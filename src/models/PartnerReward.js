const mongoose = require('mongoose');

/**
 * Tracks eligibility + payout of the direct-referral deposit bonus shown
 * in Promotion/PartnerRewards.jsx (REWARD_ROWS table — tiered bonus by
 * deposit amount + required turnover, for the referred user's 1st, 2nd,
 * and 3rd approved deposits, within 7 days of that deposit).
 *
 * Lifecycle: created as 'pending' when a referred user's Nth deposit is
 * approved (depositController.approveDeposit). Moved to 'credited' once
 * the required turnover is reached within the 7-day window (checked via
 * utils/partnerRewards.js -> checkAndCreditPartnerRewards, called after
 * any bet settles — wired into settleRound() in utils/gameEngine.js), or 'expired' if the
 * window passes first.
 */
const PartnerRewardSchema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  depositNumber: { type: Number, required: true }, // 1, 2, or 3
  depositAmount: { type: Number, required: true },
  requiredTurnover: { type: Number, required: true },
  bonusAmount: { type: Number, required: true },
  depositDate: { type: Date, required: true },
  expiresAt: { type: Date, required: true }, // depositDate + 7 days
  status: { type: String, enum: ['pending', 'credited', 'expired'], default: 'pending' },
  creditedAt: { type: Date, default: null }
});

PartnerRewardSchema.index({ referredUserId: 1, status: 1 });
PartnerRewardSchema.index({ referrerId: 1, createdAt: -1 });
// One reward per referred user per deposit number — never double-register
PartnerRewardSchema.index({ referredUserId: 1, depositNumber: 1 }, { unique: true });

module.exports = mongoose.model('PartnerReward', PartnerRewardSchema);
