const Deposit = require('../models/Deposit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { notifyAdmin } = require('./notificationController');
const { generateOrderNumber } = require('../utils/orderNumber');

// User: Create deposit request
exports.createDeposit = async (req, res) => {
  try {
    const { amount, method } = req.body;
    const userId = req.user.id;

    // req.file comes from the `upload.single('screenshot')` multer middleware
    if (!req.file) {
      return res.status(400).json({ message: 'Payment screenshot is required' });
    }

    // ===== DUPLICATE SCREENSHOT DETECTION =====
    // Hash the actual image bytes (SHA-256). If this exact image was ever
    // used in a prior deposit — by this user or ANY user — that's the
    // classic "reuse the same receipt screenshot" fraud pattern. We don't
    // block the submission outright (a false positive would wrongly stop a
    // genuine deposit), but we flag it clearly so admin sees it immediately
    // instead of having to eyeball every screenshot for reuse.
    // req.file.buffer comes straight from multer's memoryStorage (no disk
    // write), so this hash — and the image itself — always survives a
    // Railway redeploy.
    const fileBuffer = req.file.buffer;
    const screenshotHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const screenshotDataUri = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;

    const priorMatch = await Deposit.findOne({
      screenshotHash,
      status: { $ne: 'rejected' }
    }).populate('userId', 'name uid');

    let flagged = false;
    let flagReason;
    if (priorMatch) {
      flagged = true;
      const sameUser = priorMatch.userId?._id?.toString() === userId;
      flagReason = sameUser
        ? `This exact screenshot was already used in a previous deposit (${priorMatch.orderNumber || priorMatch._id}) by this same user.`
        : `This exact screenshot was already used in a deposit (${priorMatch.orderNumber || priorMatch._id}) by a different member (${priorMatch.userId?.name || 'unknown'}, UID ${priorMatch.userId?.uid || 'N/A'}).`;
    }

    // Internal reference id (user's own bank/wallet reference isn't collected
    // by the UI, so we generate one — used only to satisfy the unique index)
    const transactionId = `TXN${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const orderNumber = generateOrderNumber('RC');

    const deposit = new Deposit({
      userId,
      amount,
      method,
      transactionId,
      orderNumber,
      screenshot: screenshotDataUri,
      screenshotHash,
      flagged,
      flagReason
    });

    await deposit.save();

    const user = await User.findById(userId);
    await notifyAdmin(
      req.io,
      'deposit',
      flagged
        ? `⚠️ FLAGGED: ${user?.name || 'A member'} submitted a Rs${amount} deposit with a DUPLICATE screenshot via ${method}`
        : `${user?.name || 'A member'} submitted a deposit request of Rs${amount} via ${method}`,
      flagged ? 'Flagged Deposit — Duplicate Screenshot' : 'New Deposit Request'
    );

    res.status(201).json({
      message: 'Deposit request submitted successfully',
      deposit
    });

  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: error.message });
  }
};

// User: Get my deposit history
exports.getMyDeposits = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userId };
    if (status) query.status = status;

    const deposits = await Deposit.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Deposit.countDocuments(query);

    res.json({
      deposits,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Get all pending deposits
exports.getPendingDeposits = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const deposits = await Deposit.find({ status: 'pending' })
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Deposit.countDocuments({ status: 'pending' });

    res.json({
      deposits,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Reject deposit
exports.rejectDeposit = async (req, res) => {
  try {
    const { depositId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const deposit = await Deposit.findById(depositId);
    if (!deposit) {
      return res.status(404).json({ message: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ message: 'Deposit already processed' });
    }

    deposit.status = 'rejected';
    deposit.approvedBy = adminId;
    deposit.approvedAt = new Date();
    deposit.rejectionReason = reason;
    await deposit.save();

    res.json({
      message: 'Deposit rejected',
      deposit
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Approve deposit (WITH REFERRAL BONUS CHECK)
exports.approveDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { depositId } = req.params;
    const adminId = req.user.id;

    const deposit = await Deposit.findById(depositId).session(session);
    if (!deposit) throw new Error('Deposit not found');
    if (deposit.status !== 'pending') throw new Error('Deposit already processed');

    deposit.status = 'approved';
    deposit.approvedBy = adminId;
    deposit.approvedAt = new Date();
    await deposit.save({ session });

    const user = await User.findById(deposit.userId).session(session);
    user.balance += deposit.amount;

    // ===== WAGERING REQUIREMENT — see adminController.approveDepositAdmin
    // for the full explanation; kept in sync here since this is an
    // alternate (legacy) approve path. =====
    if (!user.wagering) user.wagering = { required: 0, completed: 0 };
    user.wagering.required = (user.wagering.required || 0) + deposit.amount;

    await user.save({ session });

    // ===== PARTNER REWARD CANDIDATE (tiered, turnover-gated — see utils/partnerRewards.js) =====
    const { registerPartnerRewardCandidate } = require('../utils/partnerRewards');
    await registerPartnerRewardCandidate(user, deposit.amount, deposit.approvedAt);
    // Actual bonus is credited later once turnover is met (checkAndCreditPartnerRewards,
    // called after a bet settles — wired in once the game engine exists).
    // ================================================================================

    // ===== SPIN WHEEL — grant today's spins per cumulative deposit tier =====
    const { grantSpinsForDeposit } = require('../utils/spinRewards');
    grantSpinsForDeposit(user, deposit.amount);
    await user.save({ session });
    // ==========================================================================

    const transaction = new Transaction({
      userId: deposit.userId,
      type: 'deposit',
      amount: deposit.amount,
      status: 'completed',
      balanceAfter: user.balance,
      description: `Deposit approved - ${deposit.method}`
    });
    await transaction.save({ session });

    await session.commitTransaction();

    res.json({
      message: 'Deposit approved successfully',
      deposit,
      newBalance: user.balance
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};