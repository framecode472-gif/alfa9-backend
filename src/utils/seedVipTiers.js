const mongoose = require('mongoose');
const VipTier = require('../models/VipTier');

/**
 * Mirrors VIP_LEVELS from the frontend (src/pages/Account/subpages/Vip/Vip.jsx)
 * exactly — level, expReq, levelUpCoins/FreeSpins, monthlyCoins/FreeSpins,
 * safeRate, rebateRate all copied 1:1.
 *
 * maintenanceReq / maintenanceDeduction are NOT in the frontend file (it
 * only shows an example in a screenshot: VIP3, expReq 5000 -> maintenance
 * 2500, deduction 1250). Assumed formula until confirmed otherwise:
 *   maintenanceReq = expReq / 2
 *   maintenanceDeduction = expReq / 4
 *
 * Run once with: node src/utils/seedVipTiers.js
 * Safe to re-run — upserts by level, won't create duplicates.
 */
const VIP_LEVELS = [
  { level: 1, expReq: 60, levelUpCoins: 60, levelUpFreeSpins: 5, monthlyCoins: 20, monthlyFreeSpins: 1, safeRate: '0.2%', rebateRate: '0.3%' },
  { level: 2, expReq: 500, levelUpCoins: 200, levelUpFreeSpins: 15, monthlyCoins: 100, monthlyFreeSpins: 5, safeRate: '0.2%', rebateRate: '0.3%' },
  { level: 3, expReq: 5000, levelUpCoins: 700, levelUpFreeSpins: 50, monthlyCoins: 350, monthlyFreeSpins: 25, safeRate: '0.25%', rebateRate: '0.35%' },
  { level: 4, expReq: 50000, levelUpCoins: 2000, levelUpFreeSpins: 300, monthlyCoins: 1000, monthlyFreeSpins: 150, safeRate: '0.25%', rebateRate: '0.35%' },
  { level: 5, expReq: 200000, levelUpCoins: 7000, levelUpFreeSpins: 1000, monthlyCoins: 2500, monthlyFreeSpins: 500, safeRate: '0.3%', rebateRate: '0.4%' },
  { level: 6, expReq: 800000, levelUpCoins: 16900, levelUpFreeSpins: 2000, monthlyCoins: 7000, monthlyFreeSpins: 1500, safeRate: '0.3%', rebateRate: '0.45%' },
  { level: 7, expReq: 5000000, levelUpCoins: 70000, levelUpFreeSpins: 5000, monthlyCoins: 25000, monthlyFreeSpins: 2500, safeRate: '0.35%', rebateRate: '0.475%' },
  { level: 8, expReq: 10000000, levelUpCoins: 169000, levelUpFreeSpins: 15000, monthlyCoins: 70000, monthlyFreeSpins: 5000, safeRate: '0.35%', rebateRate: '0.5%' },
  { level: 9, expReq: 100000000, levelUpCoins: 880000, levelUpFreeSpins: 30000, monthlyCoins: 369000, monthlyFreeSpins: 15000, safeRate: '0.4%', rebateRate: '0.55%' },
  { level: 10, expReq: 2000000000, levelUpCoins: 1890000, levelUpFreeSpins: 100000, monthlyCoins: 890000, monthlyFreeSpins: 50000, safeRate: '0.45%', rebateRate: '0.6%' },
];

async function seedVipTiers() {
  for (const lvl of VIP_LEVELS) {
    await VipTier.findOneAndUpdate(
      { level: lvl.level },
      {
        ...lvl,
        name: `VIP ${lvl.level}`,
        maintenanceReq: Math.round(lvl.expReq / 2),
        maintenanceDeduction: Math.round(lvl.expReq / 4),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`✅ Seeded ${VIP_LEVELS.length} VIP tiers`);
}

// Allow running directly: node src/utils/seedVipTiers.js
if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGO_URI)
    .then(seedVipTiers)
    .then(() => mongoose.disconnect())
    .catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
}

module.exports = { seedVipTiers, VIP_LEVELS };
