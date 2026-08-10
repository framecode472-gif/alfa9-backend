const User = require('../models/User');
const VipTier = require('../models/VipTier');

/**
 * Runs once a day. For every user whose 30-day maintenance window (since
 * vip.levelSince) has ended:
 *   - if they earned >= tier.maintenanceReq EXP during that window -> fine,
 *     window quietly restarts (levelSince/maintenanceExpStart reset to now)
 *   - if not -> deduct tier.maintenanceDeduction EXP. If that drops their
 *     total below the current tier's expReq, downgrade to the highest tier
 *     they still qualify for.
 *
 * Rule source: Vip.jsx "Rules" tab — "Downgrade standard": if maintenance
 * isn't completed within 30 days, the system deducts the level's EXP and
 * downgrades if insufficient.
 *
 * NOT started automatically yet — wire it up in server.js once ready:
 *   const { runVipMaintenanceCheck } = require('./src/jobs/vipMaintenanceJob');
 *   setInterval(runVipMaintenanceCheck, 24 * 60 * 60 * 1000); // once a day
 */
async function runVipMaintenanceCheck() {
  const now = new Date();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const tiers = await VipTier.find().sort({ level: 1 });
  if (tiers.length === 0) return;

  const users = await User.find({ 'vip.level': { $gte: 1 } });

  for (const user of users) {
    const windowEnd = new Date(user.vip.levelSince).getTime() + thirtyDaysMs;
    if (now.getTime() < windowEnd) continue; // window not over yet

    const tier = tiers.find(t => t.level === user.vip.level);
    if (!tier) continue;

    const progress = user.vip.exp - user.vip.maintenanceExpStart;

    if (progress >= tier.maintenanceReq) {
      // Maintained — restart the window from today
      user.vip.levelSince = now;
      user.vip.maintenanceExpStart = user.vip.exp;
    } else {
      // Failed — deduct EXP, downgrade if it drops below current tier's requirement
      user.vip.exp = Math.max(0, user.vip.exp - tier.maintenanceDeduction);

      let newLevel = 0;
      for (const t of tiers) {
        if (user.vip.exp >= t.expReq) newLevel = t.level;
      }
      user.vip.level = newLevel;
      user.vip.levelSince = now;
      user.vip.maintenanceExpStart = user.vip.exp;
    }

    await user.save();
  }

  console.log(`✅ VIP maintenance check complete — ${users.length} VIP users reviewed`);
}

module.exports = { runVipMaintenanceCheck };
