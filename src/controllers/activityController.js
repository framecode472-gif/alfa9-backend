const mongoose = require('mongoose');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const ActivityClaim = require('../models/ActivityClaim');
const JackpotAward = require('../models/JackpotAward');
const {
  MISSIONS, DAY_REWARDS, REBATE_RATES, INVITATION_MILESTONES,
  todayStr, randomInRange
} = require('../utils/activityRewards');

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// ============================================================
// MAIN ACTIVITY PAGE — today's bonus / total bonus
// ============================================================

// GET /api/activity/summary
exports.getActivitySummary = async (req, res) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user.id);
    const today = startOfDay(new Date());

    const [todayAgg, totalAgg] = await Promise.all([
      Transaction.aggregate([
        { $match: { userId: me, type: 'bonus', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { userId: me, type: 'bonus' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    res.json({
      todayBonus: todayAgg.length ? todayAgg[0].total : 0,
      totalBonus: totalAgg.length ? totalAgg[0].total : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// ACTIVITY AWARD — 6 daily deposit+bet missions
// ============================================================

async function getTodayDepositBetTotals(userId) {
  const today = startOfDay(new Date());
  const [depAgg, betAgg] = await Promise.all([
    Deposit.aggregate([
      { $match: { userId, status: 'approved', createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Bet.aggregate([
      { $match: { userId, createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ])
  ]);
  return {
    deposit: depAgg.length ? depAgg[0].total : 0,
    bet: betAgg.length ? betAgg[0].total : 0
  };
}

// GET /api/activity/mission-award/status
exports.getMissionAwardStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { deposit, bet } = await getTodayDepositBetTotals(userId);
    const today = todayStr();

    const claims = await ActivityClaim.find({
      userId, activityType: 'activity_award_mission', claimDate: today
    });
    const claimedIndexes = new Set(claims.map(c => c.refIndex));

    const missions = MISSIONS.map((m, i) => ({
      index: i,
      depositProgress: Math.min(deposit, m.depositTarget),
      depositTarget: m.depositTarget,
      betProgress: Math.min(bet, m.betTarget),
      betTarget: m.betTarget,
      rewardRange: { min: m.min, max: m.max },
      eligible: deposit >= m.depositTarget && bet >= m.betTarget,
      claimed: claimedIndexes.has(i)
    }));

    res.json({ missions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/activity/mission-award/claim   body: { index }
exports.claimMissionAward = async (req, res) => {
  try {
    const { index } = req.body;
    if (index === undefined || !MISSIONS[index]) return res.status(400).json({ message: 'Invalid mission index' });

    const userId = req.user.id;
    const today = todayStr();

    const alreadyClaimed = await ActivityClaim.findOne({
      userId, activityType: 'activity_award_mission', refIndex: index, claimDate: today
    });
    if (alreadyClaimed) return res.status(400).json({ message: 'Already claimed today' });

    const { deposit, bet } = await getTodayDepositBetTotals(userId);
    const mission = MISSIONS[index];
    if (deposit < mission.depositTarget || bet < mission.betTarget) {
      return res.status(400).json({ message: 'Deposit/bet targets not yet met' });
    }

    const reward = randomInRange(mission.min, mission.max);
    const user = await User.findById(userId);
    user.balance += reward;
    await user.save();

    await ActivityClaim.create({
      userId, activityType: 'activity_award_mission', refIndex: index,
      amount: reward, claimDate: today
    });
    await Transaction.create({
      userId, type: 'bonus', category: 'Daily rewards', amount: reward,
      status: 'completed', balanceAfter: user.balance,
      description: `Activity Award — Daily Slots Treasure Chest Challenge (mission ${index + 1})`
    });

    res.json({ message: 'Reward claimed', amount: reward, balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/activity/mission-award/history?tab=weekly|daily
exports.getMissionAwardHistory = async (req, res) => {
  try {
    const claims = await ActivityClaim.find({
      userId: req.user.id, activityType: 'activity_award_mission'
    }).sort({ claimedAt: -1 }).limit(100);
    res.json({ history: claims });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// ATTENDANCE BONUS — 7-day streak, must deposit that day
// ============================================================

// GET /api/activity/attendance/status
exports.getAttendanceStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const today = todayStr();
    const hasCollectedToday = user.activity.lastAttendanceDate === today;

    const totalAgg = await Transaction.aggregate([
      { $match: { userId: user._id, type: 'bonus', category: 'Attendance bonus' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      consecutiveDays: user.activity.attendanceStreak,
      collectedDays: user.activity.attendanceCollectedDays,
      accumulated: totalAgg.length ? totalAgg[0].total : 0,
      hasCollectedToday,
      dayRewards: DAY_REWARDS
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/activity/attendance/claim
exports.claimAttendance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const today = todayStr();

    if (user.activity.lastAttendanceDate === today) {
      return res.status(400).json({ message: 'Already collected today! Come back tomorrow.' });
    }

    const todayStart = startOfDay(new Date());
    const depositedToday = await Deposit.exists({ userId: user._id, status: 'approved', createdAt: { $gte: todayStart } });
    if (!depositedToday) {
      return res.status(400).json({ message: 'Please make a deposit first to collect attendance bonus.' });
    }

    // Gap check: if lastAttendanceDate isn't yesterday, streak resets
    if (user.activity.lastAttendanceDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      if (user.activity.lastAttendanceDate !== yStr) {
        user.activity.attendanceStreak = 0;
        user.activity.attendanceCollectedDays = [];
      }
    }

    const nextDay = (user.activity.attendanceStreak % 7) + 1;
    user.activity.attendanceStreak = nextDay;
    if (!user.activity.attendanceCollectedDays.includes(nextDay)) {
      user.activity.attendanceCollectedDays.push(nextDay);
    }
    if (nextDay === 7) user.activity.attendanceCollectedDays = []; // cycle complete, next claim starts fresh at day 1

    const reward = DAY_REWARDS[nextDay - 1];
    user.balance += reward;
    user.activity.lastAttendanceDate = today;
    await user.save();

    await Transaction.create({
      userId: user._id, type: 'bonus', category: 'Attendance bonus', amount: reward,
      status: 'completed', balanceAfter: user.balance,
      description: `Attendance bonus — Day ${nextDay}`
    });

    res.json({ message: `Day ${nextDay} — Rs${reward} added!`, day: nextDay, amount: reward, balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// BETTING REBATE — cashback on the bettor's own turnover
// ============================================================

// GET /api/activity/betting-rebate/status?category=all|lottery|casino|rummy|slots
exports.getBettingRebateStatus = async (req, res) => {
  try {
    const me = new mongoose.Types.ObjectId(req.user.id);
    const category = req.query.category || 'all';
    const today = startOfDay(new Date());

    const betMatch = { userId: me, rebateCollected: false };
    if (category !== 'all') betMatch.category = category;
    const pendingAgg = await Bet.aggregate([
      { $match: betMatch },
      { $group: { _id: null, total: { $sum: '$rebateAmount' } } }
    ]);

    const txMatch = { userId: me, type: 'bonus', category: 'Washing Code Rebate' };
    const [todayAgg, totalAgg] = await Promise.all([
      Transaction.aggregate([{ $match: { ...txMatch, createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Transaction.aggregate([{ $match: txMatch }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);

    res.json({
      pendingRebate: pendingAgg.length ? pendingAgg[0].total : 0,
      todayRebate: todayAgg.length ? todayAgg[0].total : 0,
      totalRebate: totalAgg.length ? totalAgg[0].total : 0,
      rates: REBATE_RATES
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/activity/betting-rebate/collect
exports.collectBettingRebate = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const pendingBets = await Bet.find({ userId: user._id, rebateCollected: false, rebateAmount: { $gt: 0 } });

    const total = pendingBets.reduce((s, b) => s + b.rebateAmount, 0);
    if (total <= 0) return res.status(400).json({ message: 'No pending rebate to collect' });

    await Bet.updateMany(
      { _id: { $in: pendingBets.map(b => b._id) } },
      { $set: { rebateCollected: true } }
    );

    user.balance += total;
    await user.save();

    await Transaction.create({
      userId: user._id, type: 'bonus', category: 'Washing Code Rebate', amount: total,
      status: 'completed', balanceAfter: user.balance,
      description: `Betting rebate collected (${pendingBets.length} bets)`
    });

    res.json({ message: `Rs${total.toFixed(2)} rebate collected!`, amount: total, balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/activity/betting-rebate/history?category=all|lottery|casino|rummy|slots
exports.getBettingRebateHistory = async (req, res) => {
  try {
    const match = { userId: req.user.id };
    if (req.query.category && req.query.category !== 'all') match.category = req.query.category;

    const bets = await Bet.find(match).sort({ createdAt: -1 }).limit(100)
      .select('gameName category amount rebateAmount rebateCollected createdAt');

    res.json({
      history: bets.map(b => ({
        game: b.gameName, category: b.category, betAmount: b.amount,
        rebateAmount: b.rebateAmount, status: b.rebateCollected ? 'Collected' : 'Pending',
        date: b.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// SUPER JACKPOT — Slots big-win bonus (no slots engine yet, so this
// will read empty until one exists — see utils/activityRewards.js)
// ============================================================

// GET /api/activity/super-jackpot/my
exports.getMyJackpots = async (req, res) => {
  try {
    const jackpots = await JackpotAward.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ jackpots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/activity/super-jackpot/claim/:id
exports.claimJackpot = async (req, res) => {
  try {
    const award = await JackpotAward.findOne({ _id: req.params.id, userId: req.user.id });
    if (!award) return res.status(404).json({ message: 'Jackpot award not found' });
    if (award.status !== 'pending') return res.status(400).json({ message: `Award already ${award.status}` });
    if (Date.now() > award.expiresAt.getTime()) {
      award.status = 'expired';
      await award.save();
      return res.status(400).json({ message: 'This award has expired' });
    }

    const user = await User.findById(req.user.id);
    user.balance += award.bonusAmount;
    await user.save();

    award.status = 'claimed';
    await award.save();

    await Transaction.create({
      userId: user._id, type: 'bonus', category: 'Super Jackpot', amount: award.bonusAmount,
      status: 'completed', balanceAfter: user.balance,
      description: `Super Jackpot — ${award.game} ${award.multiplier}X`
    });

    res.json({ message: 'Jackpot claimed', amount: award.bonusAmount, balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// INVITATION BONUS — 45 milestones: invite N friends who each deposit >= X
// ============================================================

// GET /api/activity/invitation-bonus/status
exports.getInvitationBonusStatus = async (req, res) => {
  try {
    const me = req.user.id;
    const directs = await User.find({ referredBy: me }).select('_id');
    const directIds = directs.map(d => d._id);

    const depAgg = await Deposit.aggregate([
      { $match: { userId: { $in: directIds }, status: 'approved' } },
      { $group: { _id: '$userId', total: { $sum: '$amount' } } }
    ]);
    const depositTotals = depAgg.map(r => r.total);

    const claims = await ActivityClaim.find({ userId: me, activityType: 'invitation_bonus' });
    const claimedSet = new Set(claims.map(c => c.refIndex));

    const totalDirect = directIds.length;
    const milestones = INVITATION_MILESTONES.map(m => {
      const metCount = depositTotals.filter(t => t >= m.requiredPerPerson).length;
      return {
        milestone: m.milestone,
        requiredPerPerson: m.requiredPerPerson,
        rewardAmount: m.rewardAmount,
        inviteesProgress: Math.min(totalDirect, m.milestone),
        depositProgress: Math.min(metCount, m.milestone),
        eligible: metCount >= m.milestone,
        claimed: claimedSet.has(m.milestone)
      };
    });

    res.json({ milestones });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/activity/invitation-bonus/claim   body: { milestone }
exports.claimInvitationBonus = async (req, res) => {
  try {
    const { milestone } = req.body;
    const config = INVITATION_MILESTONES.find(m => m.milestone === milestone);
    if (!config) return res.status(400).json({ message: 'Invalid milestone' });

    const me = req.user.id;
    const alreadyClaimed = await ActivityClaim.findOne({ userId: me, activityType: 'invitation_bonus', refIndex: milestone });
    if (alreadyClaimed) return res.status(400).json({ message: 'Already claimed' });

    const directs = await User.find({ referredBy: me }).select('_id');
    const depAgg = await Deposit.aggregate([
      { $match: { userId: { $in: directs.map(d => d._id) }, status: 'approved' } },
      { $group: { _id: '$userId', total: { $sum: '$amount' } } }
    ]);
    const metCount = depAgg.filter(r => r.total >= config.requiredPerPerson).length;
    if (metCount < milestone) return res.status(400).json({ message: 'Requirements not yet met' });

    const user = await User.findById(me);
    user.balance += config.rewardAmount;
    await user.save();

    await ActivityClaim.create({
      userId: me, activityType: 'invitation_bonus', refIndex: milestone, amount: config.rewardAmount
    });
    await Transaction.create({
      userId: me, type: 'bonus', category: 'Invitation bonus', amount: config.rewardAmount,
      status: 'completed', balanceAfter: user.balance,
      description: `Invitation bonus — ${milestone} invitees milestone`
    });

    res.json({ message: 'Invitation bonus claimed', amount: config.rewardAmount, balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// BONUS DETAILS — unified ledger across every bonus type above
// ============================================================

// GET /api/activity/bonus-details?category=&tab=received|collected|expired&dateRange=
exports.getBonusDetails = async (req, res) => {
  try {
    const me = req.user.id;
    const { category, tab = 'received', dateRange } = req.query;

    let dateMatch = {};
    if (dateRange && dateRange !== 'All time') {
      const now = new Date();
      let start;
      if (dateRange === 'Today') start = startOfDay(now);
      else if (dateRange === 'Yesterday') { start = startOfDay(now); start.setDate(start.getDate() - 1); }
      else if (dateRange === 'This week') { start = startOfDay(now); start.setDate(start.getDate() - 7); }
      else if (dateRange === 'This month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
      else if (dateRange === 'Last 30 days') { start = startOfDay(now); start.setDate(start.getDate() - 30); }
      if (start) dateMatch = { createdAt: { $gte: start } };
    }

    if (tab === 'received') {
      const match = { userId: me, type: 'bonus', ...dateMatch };
      if (category && category !== 'All') match.category = category;
      const records = await Transaction.find(match).sort({ createdAt: -1 }).limit(100);
      return res.json({ records });
    }

    if (tab === 'collected') {
      // "To be collected" — pending items across the modules that track pending state
      const [pendingPartner, pendingJackpot] = await Promise.all([
        require('../models/PartnerReward').find({ referrerId: me, status: 'pending' }),
        JackpotAward.find({ userId: me, status: 'pending' })
      ]);
      const records = [
        ...pendingPartner.map(p => ({ category: 'Partner rewards', amount: p.bonusAmount, createdAt: p.depositDate })),
        ...pendingJackpot.map(j => ({ category: 'Super Jackpot', amount: j.bonusAmount, createdAt: j.createdAt }))
      ];
      return res.json({ records });
    }

    if (tab === 'expired') {
      const [expiredPartner, expiredJackpot] = await Promise.all([
        require('../models/PartnerReward').find({ referrerId: me, status: 'expired' }),
        JackpotAward.find({ userId: me, status: 'expired' })
      ]);
      const records = [
        ...expiredPartner.map(p => ({ category: 'Partner rewards', amount: p.bonusAmount, createdAt: p.expiresAt })),
        ...expiredJackpot.map(j => ({ category: 'Super Jackpot', amount: j.bonusAmount, createdAt: j.expiresAt }))
      ];
      return res.json({ records });
    }

    res.json({ records: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
