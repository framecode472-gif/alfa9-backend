const mongoose = require('mongoose');

/**
 * A Super Jackpot bonus (Activity/SuperJackpot.jsx) — awarded when a Slots
 * win multiplier + bet amount matches BONUS_TABLE. No slots games exist in
 * this codebase yet, so nothing populates this today; the schema + claim
 * flow are ready for when a slots engine calls utils/activityRewards.js ->
 * awardSuperJackpot().
 */
const JackpotAwardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  game: { type: String, required: true },
  multiplier: { type: Number, required: true },
  betAmount: { type: Number, required: true },
  bonusAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'claimed', 'expired'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true } // createdAt + 7 days, matches "valid for 7 days"
});

JackpotAwardSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('JackpotAward', JackpotAwardSchema);
