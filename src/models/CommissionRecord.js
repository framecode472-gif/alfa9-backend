const mongoose = require('mongoose');

/**
 * One ledger entry each time an upline earns a betting-rebate commission
 * from a downline's turnover. Powers Promotion/CommissionDetail.jsx.
 *
 * Populated by settleRound() (utils/gameEngine.js) via creditCommission()
 * (utils/commission.js), which uses the earner's own VIP level plus how
 * many tiers down the bettor sits to look up a rate from the RebateRatio
 * table (frontend Promotion/subpages/RebateRatio/RebateRatio.jsx, copied
 * into utils/commission.js as LOTTERY_RATES).
 */
const CommissionRecordSchema = new mongoose.Schema({
  earnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who gets the commission
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // whose bet generated it
  level: { type: Number, required: true }, // 1-6, how many tiers down fromUserId is
  betAmount: { type: Number, required: true }, // the turnover this commission was calculated from
  amount: { type: Number, required: true }, // commission credited
  createdAt: { type: Date, default: Date.now }
});

CommissionRecordSchema.index({ earnerId: 1, createdAt: -1 });

module.exports = mongoose.model('CommissionRecord', CommissionRecordSchema);
