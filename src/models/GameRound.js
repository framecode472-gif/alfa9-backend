const mongoose = require('mongoose');

/**
 * One "period" of a lottery-style game (WinGo / K3 / 5D), for one of that
 * game's duration variants (WinGo: 30s/1m/3m/5m — K3 & 5D: 1m/3m/5m).
 *
 * Period IDs are computed deterministically from server time (see
 * utils/gameEngine.js getCurrentRound) — everyone sees the exact same
 * period + countdown at the exact same real-world moment, regardless of
 * when they opened the app. That's the whole point: navigating away and
 * back, or two different users, must always see identical round state.
 */
const GameRoundSchema = new mongoose.Schema({
  game: { type: String, enum: ['wingo', 'k3', '5d'], required: true },
  duration: { type: String, enum: ['30s', '1m', '3m', '5m'], required: true },
  counter: { type: Number, required: true }, // sequence number within the day
  period: { type: String, required: true },  // e.g. "20260727" + 9-digit counter

  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },

  status: { type: String, enum: ['open', 'locked', 'settled'], default: 'open' },

  // Game-specific result, filled in by settleRound() — see utils/gameEngine.js
  result: {
    number: Number,          // wingo
    colors: [String],        // wingo
    big: String,             // wingo ('Big'/'Small')
    dice: [Number],          // k3
    sum: Number,             // k3 / 5d
    bigSmall: String,        // k3
    evenOdd: String,         // k3
    digits: [Number],        // 5d
  },

  totalBetAmount: { type: Number, default: 0 }, // cached for admin visibility
  totalPayout: { type: Number, default: 0 },
  settledAt: { type: Date }
}, { timestamps: true }); // adds createdAt/updatedAt — used to sort round history by true recency (the old `counter` field resets to 0 every day, so sorting by it alone put yesterday's late rounds above today's fresh ones once the date rolled over)

GameRoundSchema.index({ game: 1, duration: 1, period: 1 }, { unique: true });
GameRoundSchema.index({ game: 1, duration: 1, status: 1 });

module.exports = mongoose.model('GameRound', GameRoundSchema);