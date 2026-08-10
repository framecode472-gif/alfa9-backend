const mongoose = require('mongoose');
const User = require('../models/User');
const Deposit = require('../models/Deposit');
const Bet = require('../models/Bet');
const CommissionRecord = require('../models/CommissionRecord');
const PartnerReward = require('../models/PartnerReward');

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function getFilterRange(filter) {
  const now = new Date();
  if (filter === 'Yesterday') {
    const end = startOfDay(now);
    const start = new Date(end); start.setDate(start.getDate() - 1);
    return { start, end };
  }
  if (filter === 'This month' || filter === 'ThisMonth') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }
  return { start: startOfDay(now), end: now }; // Today
}

// Direct = users whose uplineChain[0] is me. Team = me appears anywhere in their uplineChain (tiers 1-6).
async function getDirectIds(userId) {
  const users = await User.find({ referredBy: userId }).select('_id');
  return users.map(u => u._id);
}
async function getTeamIds(userId) {
  const users = await User.find({ uplineChain: userId }).select('_id');
  return users.map(u => u._id);
}

// GET /api/referral/summary  (Promotion.jsx main page)
exports.getPromotionSummary = async (req, res) => {
  try {
    const me = req.user.id;
    const user = await User.findById(me);

    const directIds = await getDirectIds(me);
    const teamIds = await getTeamIds(me);

    const now = new Date();
    const today = startOfDay(now);
    const yesterdayStart = new Date(today); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(today);
    const day = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));

    const countRegistered = (ids, start, end) =>
      User.countDocuments({ _id: { $in: ids }, createdAt: { $gte: start, ...(end ? { $lt: end } : {}) } });

    const depositAgg = async (ids, start, end) => {
      const match = { userId: { $in: ids }, status: 'approved' };
      if (start) match.createdAt = end ? { $gte: start, $lt: end } : { $gte: start };
      const rows = await Deposit.aggregate([
        { $match: match },
        { $group: { _id: '$userId', total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]);
      return {
        depositors: rows.length,
        amount: rows.reduce((s, r) => s + r.total, 0)
      };
    };

    const firstDepositCount = async (ids) => {
      // A user's very first approved deposit ever, counted only if it happened today (matches frontend "Number of people making first deposit")
      const rows = await Deposit.aggregate([
        { $match: { userId: { $in: ids }, status: 'approved' } },
        { $sort: { createdAt: 1 } },
        { $group: { _id: '$userId', firstAt: { $first: '$createdAt' } } },
        { $match: { firstAt: { $gte: today } } }
      ]);
      return rows.length;
    };

    const [directReg, teamReg] = await Promise.all([
      countRegistered(directIds, today), countRegistered(teamIds, today)
    ]);
    const [directDep, teamDep] = await Promise.all([
      depositAgg(directIds, today), depositAgg(teamIds, today)
    ]);
    const [directFirstDep, teamFirstDep] = await Promise.all([
      firstDepositCount(directIds), firstDepositCount(teamIds)
    ]);

    const commissionSum = async (start, end) => {
      const match = { earnerId: new mongoose.Types.ObjectId(me) };
      if (start) match.createdAt = end ? { $gte: start, $lt: end } : { $gte: start };
      const rows = await CommissionRecord.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
      return rows.length ? rows[0].total : 0;
    };

    const [yesterdayCommission, weekCommission, totalCommission] = await Promise.all([
      commissionSum(yesterdayStart, today), commissionSum(weekStart), commissionSum(null)
    ]);

    res.json({
      inviteCode: user.referralCode,
      agencyEarnings: { yesterdayCommission },
      stats: {
        register: { direct: directReg, team: teamReg },
        depositNumber: { direct: directDep.depositors, team: teamDep.depositors },
        depositAmount: { direct: directDep.amount, team: teamDep.amount },
        firstDeposit: { direct: directFirstDep, team: teamFirstDep }
      },
      promoData: {
        thisWeekCommission: weekCommission,
        totalCommission,
        directSubordinateCount: directIds.length,
        teamSubordinateCount: teamIds.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/referral/subordinate-data?tier=All|1|2|3|4|5|6&year=&month=&day=&search=
exports.getSubordinateData = async (req, res) => {
  try {
    const me = req.user.id;
    const { tier = 'All', year, month, day, search } = req.query;

    let idFilter;
    if (tier === 'All') {
      idFilter = { uplineChain: me };
    } else {
      const idx = parseInt(tier, 10) - 1;
      idFilter = { [`uplineChain.${idx}`]: me };
    }
    if (search) {
      idFilter.$or = [
        { name: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { referralCode: new RegExp(search, 'i') }
      ];
    }

    const subordinates = await User.find(idFilter).select('_id name phone email createdAt referralCode');
    const ids = subordinates.map(s => s._id);

    let start, end;
    if (year && month && day) {
      start = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      end = new Date(start); end.setDate(end.getDate() + 1);
    }
    const dateMatch = start ? { createdAt: { $gte: start, $lt: end } } : {};

    const depAgg = await Deposit.aggregate([
      { $match: { userId: { $in: ids }, status: 'approved', ...dateMatch } },
      { $group: { _id: '$userId', total: { $sum: '$amount' } } }
    ]);
    const betAgg = await Bet.aggregate([
      { $match: { userId: { $in: ids }, ...dateMatch } },
      { $group: { _id: '$userId', total: { $sum: '$amount' } } }
    ]);
    const firstDepAgg = await Deposit.aggregate([
      { $match: { userId: { $in: ids }, status: 'approved' } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: '$userId', firstAt: { $first: '$createdAt' }, firstAmount: { $first: '$amount' } } },
      ...(start ? [{ $match: { firstAt: { $gte: start, $lt: end } } }] : [])
    ]);

    const stats = {
      depositNumber: depAgg.length,
      depositAmount: depAgg.reduce((s, r) => s + r.total, 0),
      numberOfBettors: betAgg.length,
      totalBet: betAgg.reduce((s, r) => s + r.total, 0),
      firstDepositCount: firstDepAgg.length,
      firstDepositAmount: firstDepAgg.reduce((s, r) => s + r.firstAmount, 0)
    };

    res.json({
      stats,
      subordinates: subordinates.map(s => ({
        id: s._id, name: s.name, registeredAt: s.createdAt, referralCode: s.referralCode
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/referral/new-subordinates?filter=Today|Yesterday|This month
exports.getNewSubordinates = async (req, res) => {
  try {
    const me = req.user.id;
    const { start, end } = getFilterRange(req.query.filter);

    const directs = await User.find({
      referredBy: me,
      createdAt: end ? { $gte: start, $lt: end } : { $gte: start }
    }).select('_id name createdAt').sort({ createdAt: -1 });

    const ids = directs.map(d => d._id);
    const depAgg = await Deposit.aggregate([
      { $match: { userId: { $in: ids }, status: 'approved' } },
      { $group: { _id: '$userId', total: { $sum: '$amount' } } }
    ]);
    const depositMap = {};
    depAgg.forEach(r => { depositMap[r._id.toString()] = r.total; });

    res.json({
      subordinates: directs.map(d => ({
        id: d._id,
        initial: (d.name || '?').charAt(0).toUpperCase(),
        name: d.name,
        date: d.createdAt,
        amount: depositMap[d._id.toString()] || 0
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/referral/commission-detail?year=&month=&day=
exports.getCommissionDetail = async (req, res) => {
  try {
    const me = req.user.id;
    const { year, month, day } = req.query;

    const match = { earnerId: me };
    if (year && month && day) {
      const start = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const end = new Date(start); end.setDate(end.getDate() + 1);
      match.createdAt = { $gte: start, $lt: end };
    }

    const records = await CommissionRecord.find(match)
      .populate('fromUserId', 'name')
      .sort({ createdAt: -1 });

    res.json({
      commissionList: records.map(r => ({
        name: r.fromUserId?.name || 'Player',
        time: r.createdAt,
        amount: r.amount,
        level: r.level
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/referral/partner-rewards-summary  (PartnerRewards.jsx)
exports.getPartnerRewardsSummary = async (req, res) => {
  try {
    const me = req.user.id;
    const user = await User.findById(me);

    const directIds = await getDirectIds(me);
    const invitationCount = directIds.length;

    const effectiveIds = await Deposit.distinct('userId', {
      userId: { $in: directIds }, status: 'approved', amount: { $gte: 300 }
    });

    const creditedAgg = await PartnerReward.aggregate([
      { $match: { referrerId: new mongoose.Types.ObjectId(me), status: 'credited' } },
      { $group: { _id: null, total: { $sum: '$bonusAmount' } } }
    ]);

    res.json({
      // The app uses BrowserRouter (no hash) and the register form actually
      // lives at /auth — not /#/register, which doesn't exist in this app.
      inviteLink: `${process.env.FRONTEND_URL || ''}/auth?ref=${user.referralCode}`,
      invitationCount,
      effectiveInvitationCount: effectiveIds.length,
      invitationTotalBonus: creditedAgg.length ? creditedAgg[0].total : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/promotion/invitation-record — full list of direct referrals for the
// PartnerRewards.jsx "Invitation record »" link, with their deposit + reward status.
exports.getInvitationRecord = async (req, res) => {
  try {
    const me = req.user.id;
    const directs = await User.find({ referredBy: me }).select('_id name createdAt').sort({ createdAt: -1 });
    const ids = directs.map((d) => d._id);

    // Every approved deposit for these members, oldest first, so we can
    // pick out each person's 1st / 2nd / 3rd deposit individually.
    const allDeposits = await Deposit.find({ userId: { $in: ids }, status: 'approved' })
      .sort({ createdAt: 1 })
      .select('userId amount');

    const depositsByUser = {};
    allDeposits.forEach((dep) => {
      const key = dep.userId.toString();
      if (!depositsByUser[key]) depositsByUser[key] = [];
      depositsByUser[key].push(dep.amount);
    });

    // Turnover = total amount wagered (all bets, win or lose)
    const turnoverAgg = await Bet.aggregate([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: '$userId', total: { $sum: '$amount' } } }
    ]);
    const turnoverMap = {};
    turnoverAgg.forEach((r) => { turnoverMap[r._id.toString()] = r.total; });

    res.json({
      records: directs.map((d) => {
        const key = d._id.toString();
        const deposits = depositsByUser[key] || [];
        return {
          id: d._id,
          uid: key.slice(-7), // short display ID, same convention as the rest of the admin/member UI
          name: d.name,
          registeredAt: d.createdAt,
          firstDepositAmount: deposits[0] || 0,
          secondDepositAmount: deposits[1] || 0,
          thirdDepositAmount: deposits[2] || 0,
          turnover: turnoverMap[key] || 0
        };
      })
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};