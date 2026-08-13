const mongoose = require('mongoose');

/**
 * One Mines ("Boom") round for one user. Unlike WinGo/K3/5D there is no
 * shared timer/period — a round starts the moment a user places a bet and
 * ends when they either cash out or hit a bomb. Bomb positions are NEVER
 * sent to the client until a tile is revealed or the round ends — the
 * client only ever sees tile-by-tile results, exactly like the real
 * Booms/Mines game.
 */
const BoomRoundSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  betAmount: { type: Number, required: true },
  minesCount: { type: Number, required: true, min: 1, max: 24 },

  // Whether admin's win-rate roll made this round house-favorable at
  // start time (see utils/boomEngine.js decideRoundMode). Never exposed
  // to the client.
  houseMode: { type: Boolean, required: true },

  revealedTiles: [{ type: Number }], // indices 0-24 revealed safe so far
  bombHit: { type: Number, default: null }, // index of the bomb that ended the round (if lost)

  status: { type: String, enum: ['active', 'cashed_out', 'busted'], default: 'active' },
  multiplier: { type: Number, default: 1 }, // multiplier at time of cashout
  payout: { type: Number, default: 0 },

  orderNumber: { type: String, required: true, unique: true },

  createdAt: { type: Date, default: Date.now },
  settledAt: { type: Date }
});

BoomRoundSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('BoomRound', BoomRoundSchema);