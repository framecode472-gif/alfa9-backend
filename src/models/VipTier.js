const mongoose = require('mongoose');

/**
 * Defines each VIP level's EXP requirement + perks.
 * Values below are seeded from the frontend's VIP_LEVELS table
 * (src/pages/Account/subpages/Vip/Vip.jsx) so admin edits here
 * stay in sync with what users already see.
 *
 * EXP rule (from Vip.jsx "Rules" tab): valid bet amount, ratio 100:1
 * — Bet Rs100 = 1 EXP. Awarded when a bet settles (gameRoundController).
 *
 * Maintenance rule: within 30 days of a level change, user must earn
 * `maintenanceReq` EXP at that level. If they don't, `maintenanceDeduction`
 * EXP is removed from their total (and they may downgrade if that drops
 * them below the level's expReq).
 */
const VipTierSchema = new mongoose.Schema({
  level: { type: Number, required: true, unique: true }, // 1..10
  name: { type: String, required: true },                // "VIP 1"

  expReq: { type: Number, required: true }, // lifetime EXP needed to reach this level

  levelUpCoins: { type: Number, default: 0 },
  levelUpFreeSpins: { type: Number, default: 0 },

  monthlyCoins: { type: Number, default: 0 },
  monthlyFreeSpins: { type: Number, default: 0 },

  safeRate: { type: String, default: '0.2%' },   // extra safe income rate
  rebateRate: { type: String, default: '0.3%' }, // real-time rebate rate

  maintenanceReq: { type: Number, required: true },        // EXP needed within 30 days to keep the level
  maintenanceDeduction: { type: Number, required: true },  // EXP removed if maintenance not met

  icon: { type: String }
});

module.exports = mongoose.model('VipTier', VipTierSchema);
