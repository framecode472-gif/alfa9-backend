const VipTier = require('../models/VipTier');

const BASE_DAILY_RATE = 0.001; // 0.1% — matches Safe.jsx DAILY_RATE
const MS_PER_MINUTE = 60000;

/**
 * Total daily rate = base rate + the user's current VIP tier's safeRate
 * (Safe.jsx "Learn about safes": "Income Calculation Method is the Base
 * Interest Rate plus the VIP Level Extra Interest Rate").
 */
async function getDailyRate(user) {
  let extra = 0;
  if (user.vip && user.vip.level > 0) {
    const tier = await VipTier.findOne({ level: user.vip.level });
    if (tier && tier.safeRate) {
      extra = parseFloat(String(tier.safeRate).replace('%', '')) / 100 || 0;
    }
  }
  return BASE_DAILY_RATE + extra;
}

/**
 * Lazily accrue interest on user.safe.balance since safe.lastCalcAt, in
 * whole-minute steps (Safe.jsx pays interest once per minute while the
 * safe page is open — here we just catch up however many minutes have
 * passed since the last time this ran, e.g. on login, on any Safe API
 * call, or before a transfer).
 *
 * Mutates the user doc's safe fields. Does NOT save — caller saves.
 */
async function accrueInterest(user) {
  if (!user.safe) {
    user.safe = { balance: 0, generatedRevenue: 0, accumulatedRevenue: 0, lastCalcAt: new Date() };
  }
  if (user.safe.balance <= 0) {
    user.safe.lastCalcAt = new Date();
    return user;
  }

  const now = Date.now();
  const last = new Date(user.safe.lastCalcAt).getTime();
  const minutesElapsed = Math.floor((now - last) / MS_PER_MINUTE);
  if (minutesElapsed <= 0) return user;

  const dailyRate = await getDailyRate(user);
  const perMinute = (user.safe.balance * dailyRate) / (24 * 60);
  const interest = perMinute * minutesElapsed;

  user.safe.generatedRevenue += interest;
  user.safe.accumulatedRevenue += interest;
  user.safe.lastCalcAt = new Date(last + minutesElapsed * MS_PER_MINUTE);

  return user;
}

module.exports = { accrueInterest, getDailyRate, BASE_DAILY_RATE };
