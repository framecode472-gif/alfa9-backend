/**
 * Game rules for WinGo / K3 / 5D — ported 1:1 from the frontend
 * (src/pages/Lottery/{WinGo,K3,FiveD}/*.jsx) so the backend enforces
 * exactly the odds the "How to play" screens promise.
 *
 * Every payout below already assumes the bettor's stake was reduced by
 * the platform's 2% tax (see gameEngine.js) — e.g. WinGo's own copy says
 * "Select green: ... you will get (98*2) 196", meaning odds apply to the
 * post-tax (98%) stake, not the raw amount.
 */

// ============================================================
// WINGO
// ============================================================
const WINGO_DURATIONS = [
  { key: '30s', seconds: 30 },
  { key: '1m', seconds: 60 },
  { key: '3m', seconds: 180 },
  { key: '5m', seconds: 300 },
];

function wingoColors(n) {
  if (n === 0) return ['violet', 'red'];
  if (n === 5) return ['violet', 'green'];
  if ([1, 3, 7, 9].includes(n)) return ['green'];
  return ['red'];
}
function wingoBigSmall(n) { return n >= 5 ? 'Big' : 'Small'; }

function wingoGenerateResult(n) {
  return { number: n, colors: wingoColors(n), big: wingoBigSmall(n) };
}

/** All 10 possible WinGo outcomes, pre-built with their display data. */
function wingoAllOutcomes() {
  return Array.from({ length: 10 }, (_, n) => wingoGenerateResult(n));
}

/** bet: { betType: 'color'|'number'|'size', betValue: string } */
function wingoEvaluateBet(bet, result) {
  const n = result.number;
  const isZeroOrFive = n === 0 || n === 5;
  if (bet.betType === 'color') {
    if (bet.betValue === 'violet') return isZeroOrFive ? 4.5 : 0;
    if (result.colors.includes(bet.betValue)) return isZeroOrFive ? 1.5 : 2;
    return 0;
  }
  if (bet.betType === 'number') return n === Number(bet.betValue) ? 9 : 0;
  if (bet.betType === 'size') return result.big === bet.betValue ? 2 : 0;
  return 0;
}

// ============================================================
// K3 (three dice)
// ============================================================
const K3_DURATIONS = [
  { key: '1m', seconds: 60 },
  { key: '3m', seconds: 180 },
  { key: '5m', seconds: 300 },
];

const K3_SUM_ODDS = {
  3: 207.36, 4: 69.12, 5: 34.56, 6: 20.74, 7: 13.83, 8: 9.88, 9: 8.3, 10: 7.68,
  11: 7.68, 12: 8.3, 13: 9.88, 14: 13.83, 15: 20.74, 16: 34.56, 17: 69.12, 18: 207.36,
};

function k3RollShape(dice) {
  const sorted = [...dice].sort((a, b) => a - b);
  const isTriple = sorted[0] === sorted[1] && sorted[1] === sorted[2];
  const isPair = !isTriple && (sorted[0] === sorted[1] || sorted[1] === sorted[2]);
  const pairValue = isPair ? (sorted[0] === sorted[1] ? sorted[0] : sorted[1]) : null;
  const singleValue = isPair ? (sorted[0] === sorted[1] ? sorted[2] : sorted[0]) : null;
  const isContinuous = !isPair && !isTriple && sorted[1] - sorted[0] === 1 && sorted[2] - sorted[1] === 1;
  const isAllDifferent = !isPair && !isTriple;
  return { sorted, isTriple, isPair, pairValue, singleValue, isContinuous, isAllDifferent };
}

function k3GenerateResult(dice) {
  const sum = dice[0] + dice[1] + dice[2];
  return {
    dice, sum,
    bigSmall: sum <= 10 ? 'Small' : 'Big',
    evenOdd: sum % 2 === 0 ? 'Even' : 'Odd'
  };
}

/** All 216 possible K3 outcomes (3 dice, 6 faces each). */
function k3AllOutcomes() {
  const out = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
    out.push(k3GenerateResult([a, b, c]));
  }
  return out;
}

/** bet.betValue is the frontend's bet.key, e.g. "total-7", "pair-4", "triple-6", "big", "even" */
function k3EvaluateBet(bet, result) {
  const dice = result.dice;
  const sum = result.sum;
  const shape = k3RollShape(dice);
  const [kind, rawVal] = bet.betValue.split('-');
  const v = rawVal !== undefined ? Number(rawVal) : null;

  switch (kind) {
    case 'total': return sum === v ? K3_SUM_ODDS[v] : 0;
    case 'small': return sum <= 10 ? 2 : 0;
    case 'big': return sum > 10 ? 2 : 0;
    case 'even': return sum % 2 === 0 ? 2 : 0;
    case 'odd': return sum % 2 !== 0 ? 2 : 0;
    case 'pair': return shape.isPair && shape.pairValue === v ? 13.83 : 0;
    case 'uniqpair': return shape.isPair && shape.pairValue === v ? 69.12 : 0;
    case 'uniqsingle': return shape.isPair && shape.singleValue === v ? 69.12 : 0;
    case 'triple': return shape.isTriple && dice[0] === v ? 207.36 : 0;
    case 'any': return shape.isTriple ? 34.56 : 0;
    case 'diff3': return shape.isAllDifferent && dice.includes(v) ? 34.56 : 0;
    case 'continuous': return shape.isContinuous ? 8.64 : 0;
    case 'diff2': return shape.isPair && (shape.pairValue === v || shape.singleValue === v) ? 6.91 : 0;
    default: return 0;
  }
}

// ============================================================
// 5D (five digit lanes A-E + SUM)
// ============================================================
const FIVED_DURATIONS = [
  { key: '1m', seconds: 60 },
  { key: '3m', seconds: 180 },
  { key: '5m', seconds: 300 },
];
const FIVED_LETTERS = ['A', 'B', 'C', 'D', 'E'];

function fivedGenerateResult(digits) {
  const sum = digits.reduce((a, b) => a + b, 0);
  return { digits, sum };
}

function fivedOddsFor(kind) {
  return kind === 'number' ? 9 : 2; // big/small/odd/even all pay 2x, number pays 9x
}

/** bet: { betLane: 'A'..'E'|'SUM', betType: 'number'|'big'|'small'|'odd'|'even', betValue: string } */
function fivedEvaluateBet(bet, result) {
  if (bet.betLane === 'SUM') {
    const sum = result.sum;
    if (bet.betType === 'big' || bet.betType === 'small') {
      const label = sum >= 23 ? 'Big' : 'Small';
      return label === bet.betValue ? fivedOddsFor(bet.betType) : 0;
    }
    if (bet.betType === 'odd' || bet.betType === 'even') {
      const label = sum % 2 === 0 ? 'Even' : 'Odd';
      return label === bet.betValue ? fivedOddsFor(bet.betType) : 0;
    }
    return 0;
  }
  const idx = FIVED_LETTERS.indexOf(bet.betLane);
  const digit = result.digits[idx];
  if (bet.betType === 'number') return digit === Number(bet.betValue) ? 9 : 0;
  if (bet.betType === 'big' || bet.betType === 'small') {
    const label = digit >= 5 ? 'Big' : 'Small';
    return label === bet.betValue ? 2 : 0;
  }
  if (bet.betType === 'odd' || bet.betType === 'even') {
    const label = digit % 2 === 0 ? 'Even' : 'Odd';
    return label === bet.betValue ? 2 : 0;
  }
  return 0;
}

/**
 * Enumerates all 100,000 possible 5D outcomes efficiently: since every bet
 * is either lane-specific (depends on 1 digit only) or SUM-specific
 * (depends on total only), we precompute payout-per-digit-per-lane and
 * payout-per-sum tables in O(bets), then each of the 100k combos is
 * evaluated in O(5) using those tables instead of re-checking every bet.
 */
function fivedBestOutcome(bets, pickMax) {
  const laneNetPayout = [0, 1, 2, 3, 4].map(() => Array(10).fill(0)); // [lane][digit] -> total payout if that digit wins
  const sumNetPayout = Array(46).fill(0); // [sum] -> total payout from SUM bets if that sum wins

  for (const bet of bets) {
    const netStake = bet.netAmount;
    if (bet.betLane === 'SUM') {
      for (let s = 0; s <= 45; s++) {
        const fakeResult = { sum: s, digits: [0, 0, 0, 0, 0] };
        const odds = fivedEvaluateBet(bet, fakeResult);
        if (odds > 0) sumNetPayout[s] += netStake * odds;
      }
    } else {
      const idx = FIVED_LETTERS.indexOf(bet.betLane);
      for (let d = 0; d <= 9; d++) {
        const fakeResult = { digits: Array(5).fill(0).map((_, i) => (i === idx ? d : 0)), sum: d };
        const odds = fivedEvaluateBet(bet, fakeResult);
        if (odds > 0) laneNetPayout[idx][d] += netStake * odds;
      }
    }
  }

  let best = null;
  let bestPayout = pickMax ? -1 : Infinity;
  // 100,000 combos, each O(5) via the precomputed tables above
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) for (let c = 0; c <= 9; c++)
    for (let d = 0; d <= 9; d++) for (let e = 0; e <= 9; e++) {
      const digits = [a, b, c, d, e];
      const sum = a + b + c + d + e;
      const payout = laneNetPayout[0][a] + laneNetPayout[1][b] + laneNetPayout[2][c]
        + laneNetPayout[3][d] + laneNetPayout[4][e] + sumNetPayout[sum];
      if (pickMax ? payout > bestPayout : payout < bestPayout) {
        bestPayout = payout;
        best = digits;
      }
    }
  return fivedGenerateResult(best);
}

module.exports = {
  WINGO_DURATIONS, wingoColors, wingoBigSmall, wingoGenerateResult, wingoAllOutcomes, wingoEvaluateBet,
  K3_DURATIONS, K3_SUM_ODDS, k3GenerateResult, k3AllOutcomes, k3EvaluateBet,
  FIVED_DURATIONS, FIVED_LETTERS, fivedGenerateResult, fivedEvaluateBet, fivedBestOutcome,
};
