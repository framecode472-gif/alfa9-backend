/**
 * Mirrors Spin.jsx exactly.
 *
 * SPIN_TIERS: DEPOSIT_TIERS from Spin.jsx — the "spins" column there is
 * the CUMULATIVE total spins unlocked once that day's total deposit
 * reaches the threshold (confirmed by the frontend's own example: "cumulative
 * deposits reaching Rs1,000,000 on the same day -> 10 lucky draw
 * opportunities" — 10 is a total, not an add-on).
 *
 * SEGMENTS: the 8 wheel prizes, with WEIGHT controlling how often each is
 * picked (only used to break ties among prizes that are currently
 * affordable — see below).
 *
 * SPIN_DAILY_WIN_CAP: no user may win more than Rs200 total from the
 * wheel in a single day, no matter how many spins they have. Enforced by
 * only letting the wheel choose from prizes that fit inside what's left
 * of the cap — the big segments (Rs10k-50k) are visually on the wheel but
 * become mathematically unreachable once today's winnings approach 200.
 */
const SPIN_TIERS = [
  { threshold: 1000, totalSpins: 1 },
  { threshold: 10000, totalSpins: 2 },
  { threshold: 50000, totalSpins: 3 },
  { threshold: 100000, totalSpins: 4 },
  { threshold: 200000, totalSpins: 6 },
  { threshold: 1000000, totalSpins: 10 },
];

const SEGMENTS = [
  { label: 'Rs50,000', amount: 50000, weight: 1 },
  { label: 'Rs30,000', amount: 30000, weight: 2 },
  { label: 'Rs20,000', amount: 20000, weight: 5 },
  { label: 'Rs10,000', amount: 10000, weight: 12 },
  { label: 'Rs200', amount: 200, weight: 300 },
  { label: 'Rs50', amount: 50, weight: 600 },
  { label: 'Rs20', amount: 20, weight: 1000 },
  { label: 'Rs5', amount: 5, weight: 1500 },
];

const SPIN_DAILY_WIN_CAP = 200;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Resets a user's spin bucket if it's a new day since lastResetDate. Mutates, doesn't save. */
function resetIfNewDay(user) {
  if (!user.spin) {
    user.spin = { dailyDepositTotal: 0, totalSpinsToday: 0, spinsUsedToday: 0, totalWonToday: 0, lastResetDate: todayStr() };
    return user;
  }
  const today = todayStr();
  if (user.spin.lastResetDate !== today) {
    // Unused spins do NOT roll over — matches Spin.jsx: "valid for the same
    // day and cannot be rolled over to the next day"
    user.spin.dailyDepositTotal = 0;
    user.spin.totalSpinsToday = 0;
    user.spin.spinsUsedToday = 0;
    user.spin.totalWonToday = 0;
    user.spin.lastResetDate = today;
  }
  return user;
}

/**
 * Call after a deposit is approved (depositController.approveDeposit).
 * Adds to today's deposit total and grants spins per SPIN_TIERS if a new
 * cumulative threshold was crossed. Mutates, doesn't save — caller saves.
 */
function grantSpinsForDeposit(user, depositAmount) {
  resetIfNewDay(user);
  user.spin.dailyDepositTotal += depositAmount;

  let unlockedTotal = 0;
  for (const tier of SPIN_TIERS) {
    if (user.spin.dailyDepositTotal >= tier.threshold) unlockedTotal = tier.totalSpins;
  }
  if (unlockedTotal > user.spin.totalSpinsToday) {
    user.spin.totalSpinsToday = unlockedTotal;
  }
  return user;
}

/**
 * Picks a prize for one spin, respecting the Rs200/day hard cap. Only
 * weighs segments that still fit inside what's left of today's cap; if
 * nothing fits, falls back to the cheapest segment (Rs5).
 */
function pickPrize(user) {
  const remaining = Math.max(0, SPIN_DAILY_WIN_CAP - user.spin.totalWonToday);
  let affordable = SEGMENTS.filter(s => s.amount <= remaining);
  if (affordable.length === 0) affordable = [SEGMENTS[SEGMENTS.length - 1]]; // cheapest (Rs5)

  const totalWeight = affordable.reduce((s, seg) => s + seg.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const seg of affordable) {
    if (roll < seg.weight) return seg;
    roll -= seg.weight;
  }
  return affordable[affordable.length - 1];
}

module.exports = { SPIN_TIERS, SEGMENTS, SPIN_DAILY_WIN_CAP, resetIfNewDay, grantSpinsForDeposit, pickPrize, todayStr };
