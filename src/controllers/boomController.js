const boomEngine = require('../utils/boomEngine');
const BoomRound = require('../models/BoomRound');

exports.startRound = async (req, res) => {
  try {
    const { betAmount, minesCount } = req.body;
    const { round, balance } = await boomEngine.startRound(req.user._id, betAmount, minesCount);
    res.json({
      roundId: round._id,
      betAmount: round.betAmount,
      minesCount: round.minesCount,
      balance
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.revealTile = async (req, res) => {
  try {
    const { roundId } = req.params;
    const { tileIndex } = req.body;
    const result = await boomEngine.revealTile(req.user._id, roundId, tileIndex);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.cashOut = async (req, res) => {
  try {
    const { roundId } = req.params;
    const result = await boomEngine.cashOut(req.user._id, roundId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.giveUp = async (req, res) => {
  try {
    const { roundId } = req.params;
    const result = await boomEngine.giveUp(req.user._id, roundId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Lets the frontend re-sync on load/refresh if a round was left active
// (e.g. app was closed mid-round) — returns it so the UI can resume
// instead of silently losing the user's stake.
exports.getActiveRound = async (req, res) => {
  try {
    const round = await BoomRound.findOne({ userId: req.user._id, status: 'active' });
    if (!round) return res.json({ active: false });
    res.json({
      active: true,
      roundId: round._id,
      betAmount: round.betAmount,
      minesCount: round.minesCount,
      revealedTiles: round.revealedTiles,
      multiplier: boomEngine.calcMultiplier(round.revealedTiles.length, round.minesCount)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const rounds = await BoomRound.find({ userId: req.user._id, status: { $ne: 'active' } })
      .sort({ settledAt: -1 })
      .limit(30);
    res.json(rounds.map(r => ({
      id: r._id,
      time: r.settledAt,
      bet: r.betAmount,
      won: r.status === 'cashed_out',
      cashout: r.payout,
      mult: r.multiplier
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};