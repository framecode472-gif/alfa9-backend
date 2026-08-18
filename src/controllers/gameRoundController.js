const GameRound = require('../models/GameRound');
const Bet = require('../models/Bet');
const engine = require('../utils/gameEngine');

// GET /api/game-round/current/:gameName?duration=30s|1m|3m|5m
exports.getCurrentRound = async (req, res) => {
  try {
    const { gameName } = req.params;
    const duration = req.query.duration || (gameName === 'wingo' ? '30s' : '1m');

    const { round, timeLeft, locked } = await engine.getCurrentRound(gameName, duration);

    res.json({
      period: round.period,
      duration,
      timeLeft,
      locked,
      status: round.status
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/game-round/bet
// body: { gameName, duration, betType, betValue, betLane, unitAmount, quantity, multiplier }
exports.placeBet = async (req, res) => {
  try {
    const { gameName, duration, betType, betValue, betLane, unitAmount, quantity, multiplier } = req.body;
    const bet = await engine.placeBet(req.user.id, {
      game: gameName, duration, betType, betValue, betLane, unitAmount, quantity, multiplier
    });
    res.status(201).json({
      message: 'Bet placed',
      bet: {
        id: bet._id, orderNumber: bet.orderNumber, period: bet.period,
        amount: bet.amount, taxAmount: bet.taxAmount, netAmount: bet.netAmount
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/game-round/history/:gameName?duration=30s&page=1
// Public round-result history (the "Game history" tab — winning numbers, not any one user's bets)
exports.getRoundHistory = async (req, res) => {
  try {
    const { gameName } = req.params;
    const duration = req.query.duration || (gameName === 'wingo' ? '30s' : '1m');
    const page = Math.max(1, parseInt(req.query.page) || 1);
    // The frontend fetches this once per duration and paginates 10-per-page
    // locally (Game history / Chart / signals tabs) rather than requesting
    // page-by-page, so this needs to return a big enough window up front —
    // otherwise those tabs can never show more than 1 page.
    const limit = 500;

    const rounds = await GameRound.find({ game: gameName, duration, status: 'settled' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      rounds: rounds.map(r => ({ period: r.period, result: r.result, settledAt: r.settledAt })),
      page
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/game-round/my-bets/:gameName?duration=&page=
exports.getMyBetsForRound = async (req, res) => {
  try {
    const { gameName } = req.params;
    const duration = req.query.duration;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;

    // No approved deposit in the last 2 days -> don't show betting history
    // (across WinGo/K3/5D) for this user, even though the bets themselves
    // still exist in the database (untouched, just not returned here).
    const eligible = await engine.hasRecentDeposit(req.user.id);
    if (!eligible) {
      return res.json({ bets: [], page: 1, totalPages: 1, total: 0 });
    }

    const match = { userId: req.user.id, gameName, status: { $in: ['pending', 'won', 'lost'] } };
    if (duration) match.duration = duration;

    const bets = await Bet.find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await Bet.countDocuments(match);

    res.json({
      bets: bets.map(b => ({
        id: b._id, orderNumber: b.orderNumber, period: b.period,
        betType: b.betType, betValue: b.betValue, betLane: b.betLane,
        status: b.status === 'won' ? 'Succeed' : b.status === 'lost' ? 'Failed' : 'Pending',
        winLose: b.status === 'won' ? b.payout : b.status === 'lost' ? -b.amount : 0,
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

// GET /api/game-round/bet-detail/:betId — the tap-through "Details" screen
exports.getBetDetail = async (req, res) => {
  try {
    const bet = await Bet.findOne({ _id: req.params.betId, userId: req.user.id }).populate('roundId', 'result');
    if (!bet) return res.status(404).json({ message: 'Bet not found' });

    res.json({
      orderNumber: bet.orderNumber,
      period: bet.period,
      purchaseAmount: bet.amount,
      quantity: bet.quantity,
      amountAfterTax: bet.netAmount,
      tax: bet.taxAmount,
      result: bet.roundId ? bet.roundId.result : null,
      select: { type: bet.betType, value: bet.betValue, lane: bet.betLane },
      status: bet.status === 'won' ? 'Succeed' : bet.status === 'lost' ? 'Failed' : 'Pending',
      winLose: bet.status === 'won' ? bet.payout : bet.status === 'lost' ? -bet.amount : 0,
      orderTime: bet.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Exported for the scheduler job
exports.settleRound = engine.settleRound;