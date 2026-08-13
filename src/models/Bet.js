const mongoose = require('mongoose');

/**
 * A single bet a user places on an open GameRound (WinGo / K3 / 5D).
 * Settled (won/lost + payout) once the round's result is known.
 */
const BetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Only set for round-based games (WinGo/K3/5D). Boom Mines settles instantly
  // per-round with no shared GameRound doc, so this stays unset for it.
  roundId: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: false },

  gameName: { type: String, enum: ['wingo', 'k3', '5d', 'boom'], required: true },
  // Only set for round-based games. Boom Mines has no fixed duration/period.
  duration: { type: String, enum: ['30s', '1m', '3m', '5m'], required: false },
  period: { type: String, required: false },

  // Betting rebate category (Activity/BettingRebate.jsx) — wingo/k3/5d are
  // 'lottery', Boom Mines is 'casino'.
  category: { type: String, enum: ['lottery', 'casino', 'rummy', 'slots'], default: 'lottery' },

  // What was bet:
  //  WinGo: betType 'color'|'number'|'size', betValue e.g. 'green'/'5'/'Big'
  //  K3:    betType 'k3', betValue is the frontend's bet.key e.g. 'total-7', 'pair-4'
  //  5D:    betType 'number'|'big'|'small'|'odd'|'even', betLane 'A'-'E'|'SUM'
  betType: { type: String, required: true },
  betValue: { type: String, required: true },
  betLane: { type: String, default: null }, // 5D only

  // Stake breakdown — Purchase amount = unitAmount x quantity x multiplier.
  // 2% platform tax is deducted immediately; payout odds apply to netAmount.
  unitAmount: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  multiplier: { type: Number, required: true, default: 1 },
  amount: { type: Number, required: true, min: 1 },      // total stake (Purchase amount)
  taxAmount: { type: Number, required: true, default: 0 }, // 2% of amount
  netAmount: { type: Number, required: true },             // amount - taxAmount, odds apply to this

  orderNumber: { type: String, required: true, unique: true }, // e.g. "K320260727090952675048062448"

  status: { type: String, enum: ['pending', 'won', 'lost'], default: 'pending' },
  oddsMultiplier: { type: Number, default: 0 },
  payout: { type: Number, default: 0 },

  // Betting rebate (Activity/BettingRebate.jsx)
  rebateAmount: { type: Number, default: 0 },
  rebateCollected: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  settledAt: { type: Date }
});

BetSchema.index({ userId: 1, gameName: 1, duration: 1, createdAt: -1 });
BetSchema.index({ roundId: 1 });

module.exports = mongoose.model('Bet', BetSchema);