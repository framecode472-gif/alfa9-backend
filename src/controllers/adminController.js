const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Withdraw = require('../models/Withdraw');
const Transaction = require('../models/Transaction');
const GameSetting = require('../models/GameSetting');
const Gift = require('../models/Gift');
const Bonus = require('../models/Bonus');
const Referral = require('../models/Referral');
const { calculateDepositBonus } = require('../utils/depositBonus');
const { notifyUser } = require('./notificationController');

// ========== DASHBOARD STATS ==========
exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    
    const totalBalance = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);

    const totalDeposits = await Deposit.countDocuments({ status: 'approved' });
    const pendingDeposits = await Deposit.countDocuments({ status: 'pending' });
    const totalDepositAmount = await Deposit.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalWithdrawals = await Withdraw.countDocuments({ status: 'approved' });
    const pendingWithdrawals = await Withdraw.countDocuments({ status: 'pending' });
    const totalWithdrawalAmount = await Withdraw.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalGames = await Transaction.countDocuments({ type: 'game' });
    const totalBets = await Transaction.aggregate([
      { $match: { type: 'game' } },
      { $group: { _id: null, total: { $sum: '$betAmount' } } }
    ]);

    // "Currently playing" — distinct users with a bet placed in the last 5 minutes (live-activity proxy)
    const Bet = require('../models/Bet');
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const currentlyPlayingIds = await Bet.distinct('userId', { createdAt: { $gte: fiveMinAgo } });

    // Distinct users who have ever made an approved deposit
    const depositedUserIds = await Deposit.distinct('userId', { status: 'approved' });

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({ createdAt: { $gte: last24h } });
    const recentDeposits = await Deposit.countDocuments({ createdAt: { $gte: last24h }, status: 'approved' });
    const recentWithdrawals = await Withdraw.countDocuments({ createdAt: { $gte: last24h }, status: 'approved' });

    res.json({
      users: { total: totalUsers, active: activeUsers, recent: recentUsers, deposited: depositedUserIds.length },
      balance: { totalInSystem: totalBalance[0]?.total || 0 },
      deposits: {
        total: totalDeposits,
        pending: pendingDeposits,
        totalAmount: totalDepositAmount[0]?.total || 0,
        recent: recentDeposits
      },
      withdrawals: {
        total: totalWithdrawals,
        pending: pendingWithdrawals,
        totalAmount: totalWithdrawalAmount[0]?.total || 0,
        recent: recentWithdrawals
      },
      games: { totalPlayed: totalGames, totalBetAmount: totalBets[0]?.total || 0, currentlyPlaying: currentlyPlayingIds.length }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== USERS ==========
exports.getAllUsers = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

    // ===== WHY LIVE REFERRAL COUNTS, NOT THE STORED COUNTER =====
    // referralCount used to be incremented at signup time BEFORE the
    // actual Referral record was guaranteed to be created — an old bug
    // (now fixed, see authController.register) meant some signups bumped
    // the counter without ever saving a Referral document. That leaves
    // stale accounts where the badge (e.g. "20 referred") doesn't match
    // the real number of rows in the referrals modal (e.g. 7). Counting
    // actual Referral documents here means the two numbers can never
    // disagree again, without needing to touch old data.
    const userIds = users.map((u) => u._id);
    const counts = await Referral.aggregate([
      { $match: { referrerId: { $in: userIds } } },
      { $group: { _id: '$referrerId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach((c) => { countMap[c._id.toString()] = c.count; });
    const usersWithLiveReferralCounts = users.map((u) => {
      const obj = u.toObject();
      obj.referralCount = countMap[u._id.toString()] || 0;
      return obj;
    });

    res.json({
      users: usersWithLiveReferralCounts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 }).limit(50);
    const deposits = await Deposit.find({ userId }).select('-screenshot').sort({ createdAt: -1 });
    const withdrawals = await Withdraw.find({ userId }).sort({ createdAt: -1 });

    res.json({ user, transactions, deposits, withdrawals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== WAGERING / TURNOVER REQUIREMENT (withdrawal gate) ==========
// GET /api/admin/users/:userId/wagering — quick status check
exports.getWagering = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('name email uid wagering');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const required = user.wagering?.required || 0;
    const completed = user.wagering?.completed || 0;
    res.json({
      userId: user._id,
      name: user.name,
      required,
      completed,
      remaining: Math.max(0, Math.round((required - completed) * 100) / 100),
      canWithdraw: completed >= required,
      note: user.wagering?.note || null,
      updatedAt: user.wagering?.updatedAt || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/admin/users/:userId/wagering   body: { required, completed, note }
// Admin override — set either/both values directly. Use this to:
//  - delay a user's withdrawal: raise `required` above their `completed`
//  - unlock a user immediately: set `required` to 0, or `completed` to match `required`
//  - clear everything: set both to 0
// Only fields provided in the body are changed.
exports.updateWagering = async (req, res) => {
  try {
    const { userId } = req.params;
    const { required, completed, note } = req.body;
    const adminId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.wagering) user.wagering = { required: 0, completed: 0 };

    if (required !== undefined) {
      const n = Number(required);
      if (Number.isNaN(n) || n < 0) return res.status(400).json({ message: 'required must be a non-negative number' });
      user.wagering.required = n;
    }
    if (completed !== undefined) {
      const n = Number(completed);
      if (Number.isNaN(n) || n < 0) return res.status(400).json({ message: 'completed must be a non-negative number' });
      user.wagering.completed = n;
    }
    if (note !== undefined) user.wagering.note = note;
    user.wagering.updatedBy = adminId;
    user.wagering.updatedAt = new Date();

    await user.save();

    res.json({
      message: 'Wagering requirement updated',
      wagering: {
        required: user.wagering.required,
        completed: user.wagering.completed,
        remaining: Math.max(0, Math.round((user.wagering.required - user.wagering.completed) * 100) / 100),
        note: user.wagering.note
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, role, balance } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (status) user.status = status;
    if (role) user.role = role;
    if (balance !== undefined) user.balance = balance;

    await user.save();

    res.json({ message: 'User updated successfully', user: { id: user._id, name: user.name, email: user.email, status: user.status, role: user.role, balance: user.balance } });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    await Deposit.deleteMany({ userId });
    await Withdraw.deleteMany({ userId });
    await Transaction.deleteMany({ userId });
    await Gift.deleteMany({ userId });
    await User.findByIdAndDelete(userId);

    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== ADMIN PASSWORD RESET ==========
// WHY THIS INSTEAD OF SHOWING THE USER'S PASSWORD:
// Passwords are bcrypt-hashed (one-way) before they're ever saved — that's
// intentional and standard practice, so there is literally no "original
// password" stored anywhere to display, even for the admin. Showing a
// password on screen would also mean storing it in plain text somewhere,
// which is a serious security risk if the database or admin panel is ever
// compromised (every user's real password would be exposed at once).
//
// This does the same job the admin actually needs — helping a user who's
// locked out — without that risk. The admin can either:
//   (a) type a specific password themselves (e.g. the user told them what
//       they want over chat/phone) — pass it as `newPassword` in the body, or
//   (b) leave it blank to auto-generate a random one.
// Either way, only the hash is ever saved — the plain password is returned
// ONCE in this response so the admin can relay it, and is never stored or
// shown again after this.
exports.resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body || {};

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let passwordToSet = (newPassword || '').trim();
    if (passwordToSet && passwordToSet.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters' });
    }
    if (!passwordToSet) {
      // 8-char mixed-case + digit temp password, easy to read aloud/type
      passwordToSet = crypto.randomBytes(6).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 8) || 'Alfa9Reset1';
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(passwordToSet, salt);
    // Also rotate their session so any device currently logged in gets
    // signed out — important since their password just changed.
    user.sessionId = null;
    await user.save();

    res.json({
      message: 'Password reset successfully',
      tempPassword: passwordToSet,
      note: 'Share this password with the user now — it will not be shown again. They can change it after logging in.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== REFERRALS (per user, for admin) ==========
// GET /api/admin/users/:userId/referrals — everyone this user has invited,
// enriched with each invited user's current stats (deposits/withdrawals/
// balance/status) so admin can see the real value of that referral, not
// just a headcount.
exports.getUserReferrals = async (req, res) => {
  try {
    const { userId } = req.params;
    const referrals = await Referral.find({ referrerId: userId }).sort({ createdAt: -1 });

    const enriched = await Promise.all(referrals.map(async (r) => {
      const invited = await User.findById(r.invitedUserId).select('name uid email phone balance status createdAt');
      if (!invited) {
        return { _id: r._id, status: r.status, bonusAmount: r.bonusAmount, createdAt: r.createdAt, invitedUser: null };
      }

      const [depositAgg, withdrawAgg] = await Promise.all([
        Deposit.aggregate([
          { $match: { userId: invited._id, status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Withdraw.aggregate([
          { $match: { userId: invited._id, status: 'approved' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      return {
        _id: r._id,
        status: r.status,
        bonusAmount: r.bonusAmount,
        createdAt: r.createdAt,
        invitedUser: {
          id: invited._id,
          name: invited.name,
          uid: invited.uid,
          email: invited.email,
          phone: invited.phone,
          balance: invited.balance,
          status: invited.status,
          joinedAt: invited.createdAt,
          totalDeposited: depositAgg[0]?.total || 0,
          totalWithdrawn: withdrawAgg[0]?.total || 0
        }
      };
    }));

    res.json({ referrals: enriched, count: enriched.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== DEPOSITS (Admin) ==========
exports.getAllDeposits = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;

    // ===== WHY .select('-screenshot') =====
    // Each screenshot is stored as a base64 data URI directly on the
    // Deposit document (up to ~10.7MB once encoded — see depositController
    // for why). Loading 20 of those per page for every tab switch was the
    // entire reason Pending/Approved/Rejected took 7-8 seconds to load —
    // the list doesn't need the actual image bytes, just to know one
    // exists (screenshotHash, kept here, tells us that cheaply). The image
    // itself is fetched on-demand only when the admin opens the receipt
    // lightbox — see getDepositScreenshot below.
    const deposits = await Deposit.find(query)
      .select('-screenshot')
      .populate('userId', 'name email phone uid')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Deposit.countDocuments(query);

    res.json({
      deposits,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/deposits/:depositId/screenshot — fetches ONLY the image
// bytes for one deposit, on demand. Called only when the admin actually
// opens the receipt lightbox, instead of every deposit's full image
// riding along on the list endpoint (see getAllDeposits above).
exports.getDepositScreenshot = async (req, res) => {
  try {
    const { depositId } = req.params;
    const deposit = await Deposit.findById(depositId).select('screenshot');
    if (!deposit || !deposit.screenshot) {
      return res.status(404).json({ message: 'Screenshot not found' });
    }
    res.json({ screenshot: deposit.screenshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Shared core logic — approves one deposit, credits balance + bonus, updates
// wagering. Used by both the single-deposit endpoint and bulk-approve.
// Throws on any failure (caller decides how to report it).
async function approveOneDeposit(depositId, adminId, io) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const deposit = await Deposit.findById(depositId).session(session);
    if (!deposit) throw new Error('Deposit not found');
    if (deposit.status !== 'pending') throw new Error('Deposit already processed');

    deposit.status = 'approved';
    deposit.approvedBy = adminId;
    deposit.approvedAt = new Date();
    await deposit.save({ session });

    // ===== BONUS CALCULATION =====
    // e.g. Rs300 deposit -> Rs10 bonus -> Rs310 total credited.
    // Tiers live in src/utils/depositBonus.js (mirrors what's advertised
    // on the member's Deposit page).
    const bonusAmount = calculateDepositBonus(deposit.amount);
    const totalCredit = deposit.amount + bonusAmount;

    const user = await User.findById(deposit.userId).session(session);
    user.balance += totalCredit;

    // ===== WAGERING REQUIREMENT — every approved deposit adds the FULL
    // amount credited — deposit + bonus — to what the user must bet before
    // their next withdrawal is allowed (bonus money is real balance too, so
    // it must be wagered the same as the deposit itself). Stacks on top of
    // any existing requirement. Admin can override this per-user from
    // Users tab -> Wagering. =====
    if (!user.wagering) user.wagering = { required: 0, completed: 0 };
    user.wagering.required = (user.wagering.required || 0) + totalCredit;

    // ===== SPIN WHEEL — grant today's spins per cumulative deposit tier =====
    const { grantSpinsForDeposit, grantReferralSpin } = require('../utils/spinRewards');
    grantSpinsForDeposit(user, deposit.amount);

    await user.save({ session });

    // ===== REFERRAL SPIN WHEEL — the REFERRER gets +1 spin every time
    // someone they referred gets an approved deposit. =====
    const referralRecord = await Referral.findOne({ invitedUserId: user._id }).session(session);
    if (referralRecord) {
      const referrer = await User.findById(referralRecord.referrerId).session(session);
      if (referrer) {
        grantReferralSpin(referrer);
        await referrer.save({ session });
      }
    }
    // ==========================================================================

    // Deposit transaction record
    const depositTxn = new Transaction({
      userId: deposit.userId,
      type: 'deposit',
      amount: deposit.amount,
      status: 'completed',
      balanceAfter: bonusAmount > 0 ? user.balance - bonusAmount : user.balance,
      description: `Deposit approved - ${deposit.method}`
    });
    await depositTxn.save({ session });

    // Separate bonus transaction record (so it's traceable in history)
    if (bonusAmount > 0) {
      const bonusTxn = new Transaction({
        userId: deposit.userId,
        type: 'bonus',
        amount: bonusAmount,
        status: 'completed',
        balanceAfter: user.balance,
        description: `Deposit bonus - Rs${deposit.amount} deposit`
      });
      await bonusTxn.save({ session });
    }

    await session.commitTransaction();

    // Notify the member (outside the transaction — not critical enough
    // to roll back the money if this fails)
    const notifMessage = bonusAmount > 0
      ? `Your Rs${deposit.amount} deposit was approved. Rs${bonusAmount} bonus added — Rs${totalCredit} credited to your balance.`
      : `Your Rs${deposit.amount} deposit was approved and credited to your balance.`;
    await notifyUser(io, deposit.userId, 'deposit', notifMessage, 'Deposit Approved');

    return { deposit, bonusAmount, totalCredit, newBalance: user.balance };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

exports.approveDepositAdmin = async (req, res) => {
  try {
    const { depositId } = req.params;
    const adminId = req.user.id;
    const result = await approveOneDeposit(depositId, adminId, req.io);
    res.json({ message: 'Deposit approved', ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/admin/deposits/bulk-approve   body: { depositIds: [...] }
// Speeds up review of the "safe" pile: approves every listed deposit that
// is still pending AND not flagged as a duplicate-screenshot. Any flagged
// or already-processed deposit in the list is skipped and reported back —
// never silently approved, since those genuinely need a human look.
exports.bulkApproveDeposits = async (req, res) => {
  try {
    const { depositIds } = req.body;
    const adminId = req.user.id;
    if (!Array.isArray(depositIds) || depositIds.length === 0) {
      return res.status(400).json({ message: 'depositIds must be a non-empty array' });
    }

    const approved = [];
    const skipped = [];

    for (const depositId of depositIds) {
      try {
        const deposit = await Deposit.findById(depositId);
        if (!deposit) { skipped.push({ depositId, reason: 'Not found' }); continue; }
        if (deposit.status !== 'pending') { skipped.push({ depositId, reason: 'Already processed' }); continue; }
        if (deposit.flagged) { skipped.push({ depositId, reason: 'Flagged — needs manual review' }); continue; }

        const result = await approveOneDeposit(depositId, adminId, req.io);
        approved.push({ depositId, totalCredit: result.totalCredit });
      } catch (err) {
        skipped.push({ depositId, reason: err.message });
      }
    }

    res.json({
      message: `Approved ${approved.length} of ${depositIds.length} deposits`,
      approved,
      skipped
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


exports.rejectDepositAdmin = async (req, res) => {
  try {
    const { depositId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const deposit = await Deposit.findById(depositId);
    if (!deposit) return res.status(404).json({ message: 'Deposit not found' });
    if (deposit.status !== 'pending') return res.status(400).json({ message: 'Deposit already processed' });

    deposit.status = 'rejected';
    deposit.approvedBy = adminId;
    deposit.approvedAt = new Date();
    deposit.rejectionReason = reason;
    await deposit.save();

    await notifyUser(
      req.io,
      deposit.userId,
      'deposit',
      `Your Rs${deposit.amount} deposit request was rejected. ${reason ? 'Reason: ' + reason : ''}`,
      'Deposit Rejected'
    );

    res.json({ message: 'Deposit rejected', deposit });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== WITHDRAWALS (Admin) ==========
exports.getAllWithdrawals = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;

    const withdrawals = await Withdraw.find(query)
      .populate('userId', 'name email phone balance wagering uid')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Withdraw.countDocuments(query);

    res.json({
      withdrawals,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.approveWithdrawAdmin = async (req, res) => {
  try {
    const { withdrawId } = req.params;
    const adminId = req.user.id;

    const withdraw = await Withdraw.findById(withdrawId);
    if (!withdraw) return res.status(404).json({ message: 'Withdrawal not found' });
    if (withdraw.status !== 'pending') return res.status(400).json({ message: 'Withdrawal already processed' });

    withdraw.status = 'approved';
    withdraw.approvedBy = adminId;
    withdraw.approvedAt = new Date();
    await withdraw.save();

    // Update transaction
    await Transaction.findOneAndUpdate(
      { userId: withdraw.userId, type: 'withdrawal', status: 'pending' },
      { status: 'completed', description: `Withdrawal approved - ${withdraw.method}` }
    );

    await notifyUser(
      req.io,
      withdraw.userId,
      'withdrawal',
      `Your Rs${withdraw.amount} withdrawal via ${withdraw.method} has been approved and sent.`,
      'Withdrawal Approved'
    );

    res.json({ message: 'Withdrawal approved', withdraw });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.rejectWithdrawAdmin = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const withdraw = await Withdraw.findById(withdrawId).session(session);
    if (!withdraw) throw new Error('Withdrawal not found');
    if (withdraw.status !== 'pending') throw new Error('Withdrawal already processed');

    // Refund balance
    const user = await User.findById(withdraw.userId).session(session);
    user.balance += withdraw.amount;
    await user.save({ session });

    withdraw.status = 'rejected';
    withdraw.approvedBy = adminId;
    withdraw.approvedAt = new Date();
    withdraw.rejectionReason = reason;
    await withdraw.save({ session });

    // Update transaction
    await Transaction.findOneAndUpdate(
      { userId: withdraw.userId, type: 'withdrawal', status: 'pending' },
      { status: 'completed', description: `Withdrawal rejected - Refunded - ${reason}` }
    );

    await session.commitTransaction();

    await notifyUser(
      req.io,
      withdraw.userId,
      'withdrawal',
      `Your Rs${withdraw.amount} withdrawal was rejected and refunded to your balance. ${reason ? 'Reason: ' + reason : ''}`,
      'Withdrawal Rejected'
    );

    res.json({ message: 'Withdrawal rejected and refunded', withdraw, refundedBalance: user.balance });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// ========== GAME SETTINGS ==========
exports.getGameSettings = async (req, res) => {
  try {
    const settings = await GameSetting.find();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateGameSettings = async (req, res) => {
  try {
    const { gameName } = req.params;
    const { profitPercentage, lossPercentage, minBet, maxBet, isActive, maintenance } = req.body;

    // Upsert instead of 404 — guarantees the admin panel's game controls
    // (win rate, maintenance, bet limits) always work for any valid game,
    // even if seedGameSettings.js was never run for it.
    const setting = await GameSetting.findOneAndUpdate(
      { gameName },
      { gameName },
      { upsert: true, setDefaultsOnInsert: true, new: true }
    );

    if (profitPercentage !== undefined) setting.profitPercentage = profitPercentage;
    if (lossPercentage !== undefined) setting.lossPercentage = lossPercentage;
    if (minBet !== undefined) setting.minBet = minBet;
    if (maxBet !== undefined) setting.maxBet = maxBet;
    if (isActive !== undefined) setting.isActive = isActive;
    if (maintenance !== undefined) setting.maintenance = maintenance;

    await setting.save();

    res.json({ message: 'Game settings updated', setting });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== GIFT CODES ==========
exports.getAllGiftCodes = async (req, res) => {
  try {
    // Only codes generated through the admin gift-code tool (not signup/referral/daily bonuses)
    const gifts = await Gift.find({ code: { $exists: true, $ne: null } })
      .populate('userId', 'name email uid')
      .sort({ createdAt: -1 });

    // Flatten to the shape the admin panel table expects. Show the
    // member-facing numeric uid (same one admin types into Give Points /
    // Generate Code) instead of the raw Mongo _id, for consistency.
    const codes = gifts.map((g) => ({
      code: g.code,
      userId: g.userId?.uid || g.userId?._id || g.userId,
      userName: g.userId?.name || 'Unknown',
      amount: g.amount,
      expiry: g.expiry ? new Date(g.expiry).toLocaleDateString() : '\u2014',
      claimed: g.claimed
    }));

    res.json({ codes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createGiftCode = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount, description, expiry } = req.body;
    const adminId = req.user.id;

    // Same numeric-UID lookup as givePointsToUser — admin types the ID shown
    // on the member's Account page, not the internal Mongo _id.
    let user = await User.findOne({ uid: String(userId).trim() }).session(session);
    if (!user && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId).session(session);
    }
    if (!user) throw new Error('User not found — check the ID');

    // Generate random code
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `ALFA9-${rand}`;

    const gift = new Gift({
      userId: user._id,
      amount,
      type: 'admin_gift',
      code,
      expiry: expiry || undefined,
      description: description || 'Gift from admin',
      createdBy: adminId
    });
    await gift.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: 'Gift code created',
      gift: {
        code: gift.code,
        userId: gift.userId,
        amount: gift.amount,
        expiry: gift.expiry ? new Date(gift.expiry).toLocaleDateString() : '\u2014',
        claimed: gift.claimed
      }
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

exports.toggleGiftClaim = async (req, res) => {
  try {
    const { code } = req.params;
    const gift = await Gift.findOne({ code });
    if (!gift) return res.status(404).json({ message: 'Gift code not found' });

    // One-way only: admin can manually mark an UNCLAIMED code as claimed
    // (e.g. the bonus was already given some other way). Flipping an
    // ALREADY-claimed code back to unclaimed must be blocked — that was the
    // actual double-bonus bug: the admin panel could show a stale
    // "Unclaimed" for a code the member had already redeemed in-app, admin
    // would click this to "mark" it, which really un-claimed it, and the
    // member (or anyone with the code) could then redeem it again for a
    // second payout. If a code truly needs to be voided, delete it instead.
    if (gift.claimed) {
      return res.status(400).json({ message: 'This code is already claimed and cannot be un-claimed. Delete it instead if it needs to be voided.' });
    }

    gift.claimed = true;
    gift.claimedAt = new Date();
    await gift.save();

    res.json({ message: 'Gift code marked as claimed', code: gift.code, claimed: gift.claimed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteGiftCode = async (req, res) => {
  try {
    const { code } = req.params;
    await Gift.findOneAndDelete({ code });
    res.json({ message: 'Gift code deleted' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ========== BONUSES ==========
// Default bonus definitions — used only to seed the DB the first time
const DEFAULT_BONUSES = [
  { key: 'deposit', title: 'New member 1st deposit', desc: 'Bonus applied automatically on first deposit', enabled: true, value: 100, unit: '%', cap: 5000 },
  { key: 'invite', title: 'Invitation bonus', desc: 'Paid to referrer once invited member completes first deposit', enabled: true, value: 500, unit: 'Rs', cap: 0 },
  { key: 'attendance', title: 'Attendance bonus', desc: 'Reward increases with consecutive daily sign-ins', enabled: true, value: 50, unit: 'Rs', cap: 0 },
  { key: 'rebate', title: 'Betting rebate', desc: 'Percentage of daily turnover returned as bonus', enabled: false, value: 1.5, unit: '%', cap: 2000 }
];

exports.getAllBonuses = async (req, res) => {
  try {
    let bonuses = await Bonus.find();

    // First run — no bonuses in DB yet, seed the defaults
    if (bonuses.length === 0) {
      bonuses = await Bonus.insertMany(DEFAULT_BONUSES);
    }

    res.json(bonuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateBonus = async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled, value, cap } = req.body;

    const bonus = await Bonus.findOne({ key });
    if (!bonus) return res.status(404).json({ message: 'Bonus not found' });

    if (enabled !== undefined) bonus.enabled = enabled;
    if (value !== undefined) bonus.value = value;
    if (cap !== undefined) bonus.cap = cap;
    bonus.updatedAt = new Date();
    await bonus.save();

    res.json({ message: 'Bonus updated', bonus });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// POST /api/admin/users/give-points   body: { userId, amount, pointType, mode, reason }
// Admin manually adjusts a user's account — used for "user ki ID likh ke point de do" style
// manual adjustments. mode: 'add' (default — credit/debit by `amount`, negative = deduct)
// or 'set' (force the value to exactly `amount`, e.g. reset someone's points to 0).
exports.givePointsToUser = async (req, res) => {
  try {
    const { userId, amount, pointType, mode, reason } = req.body;

    if (!userId || amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ message: 'userId and amount are required' });
    }
    const numAmount = Number(amount);
    if (Number.isNaN(numAmount)) {
      return res.status(400).json({ message: 'amount must be a number' });
    }
    const adjustMode = mode === 'set' ? 'set' : 'add';
    if (adjustMode === 'add' && numAmount === 0) {
      return res.status(400).json({ message: 'amount must be non-zero to add/deduct' });
    }

    const type = pointType === 'vipExp' ? 'vipExp' : 'balance'; // 'balance' (Rs wallet) or 'vipExp' (VIP EXP points)

    // Admin types the numeric UID shown on the member's Account page (e.g.
    // "202686"), not the internal Mongo _id — so look up by uid first and
    // only fall back to _id for any old links/records still using it.
    const mongoose = require('mongoose');
    let user = await User.findOne({ uid: String(userId).trim() });
    if (!user && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    }
    if (!user) return res.status(404).json({ message: 'User not found — check the ID' });

    let delta; // the actual change applied, used for the transaction log

    if (type === 'vipExp') {
      if (!user.vip) user.vip = { exp: 0, level: 0, levelSince: new Date(), maintenanceExpStart: 0, levelUpClaimed: [], lastMonthlyClaim: null };
      const before = user.vip.exp;
      user.vip.exp = adjustMode === 'set' ? Math.max(0, numAmount) : Math.max(0, before + numAmount);
      delta = user.vip.exp - before;
    } else {
      const before = user.balance;
      user.balance = adjustMode === 'set' ? Math.max(0, numAmount) : Math.max(0, before + numAmount);
      delta = user.balance - before;

      // ===== WAGERING REQUIREMENT — any balance the admin manually credits
      // (bonus, compensation, etc.) also has to be bet through before the
      // user can withdraw, same rule as a deposit. Only rises on a credit
      // (delta > 0) — a deduction never lowers what's already required. =====
      if (delta > 0) {
        if (!user.wagering) user.wagering = { required: 0, completed: 0 };
        user.wagering.required = (user.wagering.required || 0) + delta;
      }
    }
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      category: 'Admin Adjustment',
      amount: delta,
      status: 'completed',
      balanceAfter: user.balance,
      description: reason
        ? `Admin ${adjustMode === 'set' ? 'set' : 'adjustment'} (${type}): ${reason}`
        : `Admin ${adjustMode === 'set' ? `set ${type} to ${numAmount}` : `adjustment (${type})`}`
    });

    res.json({
      message: adjustMode === 'set'
        ? `${type === 'vipExp' ? 'VIP EXP' : 'Balance'} set to ${type === 'vipExp' ? user.vip.exp : user.balance} for this user`
        : `${delta > 0 ? 'Credited' : 'Debited'} ${Math.abs(delta)} ${type === 'vipExp' ? 'VIP EXP' : 'Rs'} to user`,
      user: { id: user._id, name: user.name, email: user.email, balance: user.balance, vipExp: user.vip?.exp || 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/users/lookup/:id  — quick lookup so admin can confirm the user before crediting points
exports.lookupUserById = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const id = req.params.id;
    let user = await User.findOne({ uid: String(id).trim() }).select('name email phone balance vip uid');
    if (!user && mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id).select('name email phone balance vip uid');
    }
    if (!user) return res.status(404).json({ message: 'User not found — check the ID' });
    res.json({ user: { id: user._id, uid: user.uid, name: user.name, email: user.email, phone: user.phone, balance: user.balance, vipExp: user.vip?.exp || 0, vipLevel: user.vip?.level || 0 } });
  } catch (error) {
    res.status(404).json({ message: 'User not found — check the ID' });
  }
};