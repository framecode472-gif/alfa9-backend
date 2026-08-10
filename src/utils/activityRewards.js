/**
 * All config tables below are copied 1:1 from the frontend Activity
 * subpages so the backend enforces exactly what the UI promises.
 */

// ===== ActivityAward.jsx MISSIONS — daily deposit+bet targets, reward is a random Rs range =====
const MISSIONS = [
  { depositTarget: 500, betTarget: 5000, min: 5, max: 50 },
  { depositTarget: 1000, betTarget: 10000, min: 5, max: 100 },
  { depositTarget: 5000, betTarget: 50000, min: 50, max: 500 },
  { depositTarget: 10000, betTarget: 100000, min: 50, max: 1000 },
  { depositTarget: 50000, betTarget: 500000, min: 50, max: 2000 },
  { depositTarget: 100000, betTarget: 1000000, min: 50, max: 3000 },
];

// ===== AttendanceBonus.jsx — 7-day cycle =====
const DAY_REWARDS = [15, 30, 40, 60, 80, 90, 120];

// ===== BettingRebate.jsx — cashback rate on the bettor's OWN turnover =====
const REBATE_RATES = { lottery: 0.0020, casino: 0.0015, rummy: 0.0015, slots: 0.0018 };

// ===== SuperJackpot.jsx BONUS_TABLE — Slots big-win bonus (no slots engine yet) =====
const JACKPOT_BONUS_TABLE = [
  { minMult: 50, maxMult: 99999, minBet: 10000, maxBet: 99999, bonus: 1000 },
  { minMult: 50, maxMult: 99999, minBet: 1000, maxBet: 9999, bonus: 500 },
  { minMult: 50, maxMult: 99999, minBet: 100, maxBet: 999, bonus: 50 },
  { minMult: 50, maxMult: 99999, minBet: 10, maxBet: 99, bonus: 20 },
  { minMult: 50, maxMult: 99999, minBet: 1, maxBet: 9.9, bonus: 2 },
  { minMult: 35, maxMult: 49, minBet: 10000, maxBet: 99999, bonus: 500 },
  { minMult: 35, maxMult: 49, minBet: 1000, maxBet: 9999, bonus: 200 },
  { minMult: 35, maxMult: 49, minBet: 100, maxBet: 999, bonus: 30 },
  { minMult: 35, maxMult: 49, minBet: 10, maxBet: 99, bonus: 10 },
  { minMult: 35, maxMult: 49, minBet: 1, maxBet: 9.9, bonus: 1 },
  { minMult: 20, maxMult: 34, minBet: 10000, maxBet: 99999, bonus: 150 },
  { minMult: 20, maxMult: 34, minBet: 1000, maxBet: 9999, bonus: 50 },
  { minMult: 20, maxMult: 34, minBet: 100, maxBet: 999, bonus: 10 },
  { minMult: 20, maxMult: 34, minBet: 10, maxBet: 99, bonus: 5 },
  { minMult: 20, maxMult: 34, minBet: 1, maxBet: 9.9, bonus: 0.5 },
];

// ===== InvitationBonus.jsx — 45 milestones: invite N friends who each deposit >= X =====
function rechargeMap(i) {
  return i <= 5 ? 2000 : i <= 10 ? 2000 : i <= 15 ? 3000 : i <= 20 ? 3000
    : i <= 25 ? 5000 : i <= 30 ? 5000 : i <= 35 ? 8000 : i <= 40 ? 10000 : 15000;
}
function amountMap(i) {
  return i <= 5 ? 100 : i <= 10 ? 120 : i <= 15 ? 150 : i <= 20 ? 200
    : i <= 25 ? 250 : i <= 30 ? 300 : i <= 35 ? 400 : i <= 40 ? 500 : 600;
}
const INVITATION_MILESTONES = Array.from({ length: 45 }, (_, idx) => {
  const i = idx + 1;
  return { milestone: i, requiredPerPerson: rechargeMap(i), rewardAmount: amountMap(i) };
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function randomInRange(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

/**
 * Call when a bet settles (future game-engine hook). Sets bet.rebateAmount
 * based on its category's rate. Does not save — caller saves.
 */
function calculateBetRebate(bet) {
  const rate = REBATE_RATES[bet.category] || 0;
  bet.rebateAmount = Math.round(bet.amount * rate * 100) / 100;
  return bet;
}

/**
 * Call when a Slots win happens (future slots-engine hook, none exists yet).
 * Looks up the matching BONUS_TABLE row and creates a pending JackpotAward.
 */
async function awardSuperJackpot(userId, game, multiplier, betAmount) {
  const JackpotAward = require('../models/JackpotAward');
  const row = JACKPOT_BONUS_TABLE.find(r =>
    multiplier >= r.minMult && multiplier <= r.maxMult && betAmount >= r.minBet && betAmount <= r.maxBet
  );
  if (!row) return null;

  const now = new Date();
  return JackpotAward.create({
    userId, game, multiplier, betAmount,
    bonusAmount: row.bonus,
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  });
}

module.exports = {
  MISSIONS, DAY_REWARDS, REBATE_RATES, JACKPOT_BONUS_TABLE, INVITATION_MILESTONES,
  rechargeMap, amountMap, todayStr, randomInRange, calculateBetRebate, awardSuperJackpot
};
