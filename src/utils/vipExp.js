const VipTier = require('../models/VipTier');

function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/**
 * Award VIP EXP to a user and apply level-up rules. Call this whenever a
 * bet settles: addVipExp(user, betAmount) — betAmount in Rs, EXP = betAmount / 100
 * (rule from Vip.jsx: "Bet Rs100 = 1 EXP").
 *
 * Does NOT save the user — caller must user.save() (so it can be batched
 * with balance/transaction updates in the same save, same as other
 * controllers in this codebase).
 *
 * Rules applied (from Vip.jsx "Rules" tab):
 *  - Upgrade order: only 1 level per calendar day, no skipping levels
 *  - When level changes, the 30-day maintenance clock resets (levelSince,
 *    maintenanceExpStart)
 */
async function addVipExp(user, betAmount) {
  const expGained = betAmount / 100;
  if (expGained <= 0) return user;

  if (!user.vip) {
    user.vip = { exp: 0, level: 0, levelSince: new Date(), maintenanceExpStart: 0, levelUpClaimed: [], lastMonthlyClaim: null };
  }

  user.vip.exp += expGained;

  const tiers = await VipTier.find().sort({ level: 1 });
  const nextTier = tiers.find(t => t.level === user.vip.level + 1);

  if (nextTier && user.vip.exp >= nextTier.expReq) {
    const now = new Date();
    const leveledUpToday = user.vip.levelSince && isSameCalendarDay(user.vip.levelSince, now) && user.vip.level > 0;
    if (!leveledUpToday) {
      user.vip.level = nextTier.level;
      user.vip.levelSince = now;
      user.vip.maintenanceExpStart = user.vip.exp;
    }
  }

  return user;
}

module.exports = { addVipExp };
