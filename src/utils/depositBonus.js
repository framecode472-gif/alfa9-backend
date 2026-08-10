/**
 * Deposit bonus tiers — mirrors the AMOUNTS table shown to members in
 * Deposit.jsx (300 → +10, 500 → +20, 1000 → +40, ...).
 *
 * For any deposit amount, we find the highest tier whose `min` is
 * <= the amount, and apply that tier's percentage.
 *
 * TODO (later): move this into the Bonus model (key: 'deposit') so
 * admin can edit tiers from the Bonus tab without a code change.
 * Kept as a flat table for now so it exactly matches what members
 * already see advertised on the Deposit page.
 */
const DEPOSIT_BONUS_TIERS = [
  { min: 300, percent: 10 / 300 * 100 },      // 3.33%
  { min: 500, percent: 20 / 500 * 100 },      // 4%
  { min: 1000, percent: 40 / 1000 * 100 },    // 4%
  { min: 2000, percent: 80 / 2000 * 100 },    // 4%
  { min: 3000, percent: 160 / 3000 * 100 },   // 5.33%
  { min: 5000, percent: 250 / 5000 * 100 },   // 5%
  { min: 10000, percent: 500 / 10000 * 100 }, // 5%
  { min: 15000, percent: 750 / 15000 * 100 }, // 5%
  { min: 20000, percent: 1000 / 20000 * 100 },// 5%
  { min: 30000, percent: 1500 / 30000 * 100 },// 5%
  { min: 50000, percent: 2500 / 50000 * 100 },// 5%
];

/**
 * @param {number} amount - the deposit amount
 * @returns {number} bonus amount, rounded to nearest whole rupee
 */
function calculateDepositBonus(amount) {
  if (!amount || amount < 300) return 0;

  // find the highest tier at or below this amount
  let tier = DEPOSIT_BONUS_TIERS[0];
  for (const t of DEPOSIT_BONUS_TIERS) {
    if (amount >= t.min) tier = t;
    else break;
  }

  return Math.round(amount * (tier.percent / 100));
}

module.exports = { calculateDepositBonus, DEPOSIT_BONUS_TIERS };
