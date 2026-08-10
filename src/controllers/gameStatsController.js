const mongoose = require('mongoose');
const Bet = require('../models/Bet');
const { hasRecentDeposit } = require('../utils/gameEngine');

/**
 * Frontend (Account/GameStats/GameStats.jsx) shows 6 categories:
 * lottery, video, slot, fish, sport, chess.
 *
 * Right now only the lottery games (WinGo/K3/5D — see Bet model) are
 * actually implemented in this codebase, so lottery is computed from
 * real Bet documents and the other 5 return zeroed stats. When those
 * games get built, add their bet source to CATEGORY_SOURCES below —
 * the response shape already matches what the frontend expects.
 */
const EMPTY_STATS = { bet: 0, count: 0, win: 0 };
const OTHER_CATEGORIES = ['video', 'slot', 'fish', 'sport', 'chess'];

function getPeriodRange(period) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  switch (period) {
    case 'yesterday': {
      const end = startOfDay(now);
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      return { start, end };
    }
    case 'week': {
      const start = startOfDay(now);
      const day = start.getDay(); // 0 = Sunday
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday);
      return { start, end: now };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: now };
    }
    case 'today':
    default: {
      return { start: startOfDay(now), end: now };
    }
  }
}

// GET /api/user/game-stats?period=today|yesterday|week|month
exports.getMyGameStats = async (req, res) => {
  try {
    const period = ['today', 'yesterday', 'week', 'month'].includes(req.query.period)
      ? req.query.period
      : 'today';
    const { start, end } = getPeriodRange(period);

    const rows = await Bet.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          createdAt: { $gte: start, $lt: end }
        }
      },
      {
        $group: {
          _id: null,
          bet: { $sum: '$amount' },
          count: { $sum: 1 },
          win: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$payout', 0] } }
        }
      }
    ]);

    const lottery = rows.length > 0
      ? { bet: rows[0].bet, count: rows[0].count, win: rows[0].win }
      : { ...EMPTY_STATS };

    const stats = { lottery };
    OTHER_CATEGORIES.forEach((cat) => { stats[cat] = { ...EMPTY_STATS }; });

    res.json({ period, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/game-stats/my-history?page=1&game=wingo  (Account/GameHistory.jsx — flat bet list across wingo/k3/5d)
exports.getMyGameHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;

    const match = { userId: req.user.id, status: { $in: ['won', 'lost'] } };
    if (req.query.game && req.query.game !== 'all') match.gameName = req.query.game;

    const bets = await Bet.find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await Bet.countDocuments(match);

    res.json({
      bets: bets.map(b => ({
        id: b._id, orderNumber: b.orderNumber, game: b.gameName, duration: b.duration, period: b.period,
        betType: b.betType, betValue: b.betValue,
        status: b.status === 'won' ? 'Succeed' : 'Failed',
        winLose: b.status === 'won' ? b.payout : -b.amount,
        amount: b.amount, createdAt: b.createdAt
      })),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};