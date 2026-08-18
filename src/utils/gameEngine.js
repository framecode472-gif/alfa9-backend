const GameRound = require('../models/GameRound');
const GameSetting = require('../models/GameSetting');
const Bet = require('../models/Bet');
const Deposit = require('../models/Deposit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const rules = require('./gameRules');
const { addVipExp } = require('./vipExp');
const { creditCommission } = require('./commission');
const { checkAndCreditPartnerRewards } = require('./partnerRewards');
const { calculateBetRebate } = require('./activityRewards');

const TAX_RATE = 0.02; // 2% platform cut on every bet, win or lose

const ALL_STREAMS = [
  { game: 'wingo', duration: '30s', seconds: 30 },
  { game: 'wingo', duration: '1m', seconds: 60 },
  { game: 'wingo', duration: '3m', seconds: 180 },
  { game: 'wingo', duration: '5m', seconds: 300 },
  { game: 'k3', duration: '1m', seconds: 60 },
  { game: 'k3', duration: '3m', seconds: 180 },
  { game: 'k3', duration: '5m', seconds: 300 },
  { game: '5d', duration: '1m', seconds: 60 },
  { game: '5d', duration: '3m', seconds: 180 },
  { game: '5d', duration: '5m', seconds: 300 },
];

// A fixed base offset so period numbers look like the frontend's seeded examples
// (e.g. "20260716100052641") — purely cosmetic, doesn't affect correctness.
const COUNTER_BASE = 100000000;

function pad(num, size) { return String(num).padStart(size, '0'); }

function todayStr(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
}

/**
 * Computes the CURRENT period for a game+duration purely from server time —
 * no per-user state, no per-session counters. Two users opening the app at
 * the same moment (or the same user leaving and coming back) always see
 * the exact same period + time remaining, because it's a deterministic
 * function of "now", not something generated per browser session.
 */
function computeRoundWindow(seconds, now = new Date()) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const secondsSinceDayStart = Math.floor((now.getTime() - dayStart.getTime()) / 1000);
  const counterOffset = Math.floor(secondsSinceDayStart / seconds);
  const windowStart = new Date(dayStart.getTime() + counterOffset * seconds * 1000);
  const windowEnd = new Date(windowStart.getTime() + seconds * 1000);
  const counter = COUNTER_BASE + counterOffset;
  const period = `${todayStr(now)}${pad(counter, 9)}`;
  const timeLeft = Math.max(0, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000));
  return { counter, period, windowStart, windowEnd, timeLeft };
}

/**
 * Returns the current round for a game+duration, creating it in the DB if
 * this is the first request to see it. Safe to call from many requests at
 * once (unique index on game+duration+period absorbs races — a duplicate
 * insert just means someone else created it a moment earlier).
 */
async function getCurrentRound(game, duration) {
  const streamCfg = ALL_STREAMS.find(s => s.game === game && s.duration === duration);
  if (!streamCfg) throw new Error(`Unknown game/duration: ${game}/${duration}`);

  const { counter, period, windowStart, windowEnd, timeLeft } = computeRoundWindow(streamCfg.seconds);

  let round = await GameRound.findOne({ game, duration, period });
  if (!round) {
    try {
      round = await GameRound.create({
        game, duration, counter, period,
        startTime: windowStart, endTime: windowEnd, status: 'open'
      });
    } catch (err) {
      if (err.code === 11000) round = await GameRound.findOne({ game, duration, period }); // race — someone else created it first
      else throw err;
    }
  }
  return { round, timeLeft, locked: timeLeft <= 5 };
}

function generateOrderNumber(game) {
  const prefix = game === 'wingo' ? 'WG' : game === 'k3' ? 'K3' : '5D';
  const now = new Date();
  const stamp = `${todayStr(now)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
  const rand = Math.floor(Math.random() * 1e9);
  return `${prefix}${stamp}${pad(rand, 9)}`;
}

/**
 * Places a bet on the CURRENT round of game+duration. Deducts the full
 * stake (unitAmount x quantity x multiplier) from the user's balance
 * immediately, splits off the 2% platform tax, and stores netAmount as
 * what odds actually apply to (matches WinGo's own "How to play" text:
 * "98*2 = 196" — the 98 is the post-tax stake on a 100 bet).
 */
async function placeBet(userId, { game, duration, betType, betValue, betLane, unitAmount, quantity, multiplier }) {
  if (!['wingo', 'k3', '5d'].includes(game)) throw new Error('Invalid game');

  const setting = await GameSetting.findOne({ gameName: game });
  if (setting && (!setting.isActive || setting.maintenance)) throw new Error('This game is currently unavailable');

  const { round, locked } = await getCurrentRound(game, duration);
  if (locked || round.status !== 'open') throw new Error('Betting is closed for this round — wait for the next one');

  const qty = Math.max(1, Math.min(9999, Number(quantity) || 1));
  const unit = Number(unitAmount);
  const mult = Number(multiplier) || 1;
  const amount = Math.round(unit * qty * mult * 100) / 100;
  if (!amount || amount <= 0) throw new Error('Invalid bet amount');
  if (setting) {
    if (amount < setting.minBet) throw new Error(`Minimum bet is Rs${setting.minBet}`);
    if (amount > setting.maxBet) throw new Error(`Maximum bet is Rs${setting.maxBet}`);
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.balance < amount) throw new Error('Insufficient balance');

  const taxAmount = Math.round(amount * TAX_RATE * 100) / 100;
  const netAmount = Math.round((amount - taxAmount) * 100) / 100;

  user.balance -= amount;

  // ===== WAGERING PROGRESS — counts toward the deposit turnover requirement
  // that gates withdrawals (see User.wagering + withdrawController). Every
  // bet's full stake counts, win or lose. =====
  if (!user.wagering) user.wagering = { required: 0, completed: 0 };
  user.wagering.completed = (user.wagering.completed || 0) + amount;

  await user.save();

  const bet = await Bet.create({
    userId, roundId: round._id, gameName: game, duration, period: round.period,
    betType, betValue, betLane: betLane || null,
    unitAmount: unit, quantity: qty, multiplier: mult,
    amount, taxAmount, netAmount,
    orderNumber: generateOrderNumber(game)
  });

  await Transaction.create({
    userId, type: 'game', gameName: game, betAmount: amount,
    status: 'pending', balanceAfter: user.balance,
    description: `${game.toUpperCase()} bet — period ${round.period}`
  });

  // Platform tax goes straight to platform revenue regardless of outcome —
  // no user-facing transaction needed, this is just internal bookkeeping.
  // (See GameSetting/admin reporting for platform revenue totals.)

  return bet;
}

/**
 * Chooses the round result. Admin fully controls the win rate via
 * GameSetting.profitPercentage / lossPercentage (0-100, existing admin
 * panel endpoint PUT /api/admin/game-settings/:gameName):
 *   - profitPercentage% of rounds: the outcome that pays users the LEAST
 *     is chosen (house-favorable)
 *   - lossPercentage% of rounds: the outcome that pays users the MOST
 *     (among outcomes where someone actually wins) is chosen (user-favorable)
 * With no bets at all, the result is picked uniformly at random either way.
 */
async function decideResult(game, bets) {
  const setting = await GameSetting.findOne({ gameName: game });
  const profitPercentage = setting ? setting.profitPercentage : 70;

  const pickHouseFavorable = Math.random() * 100 < profitPercentage;

  if (game === 'wingo') {
    const outcomes = rules.wingoAllOutcomes();
    if (bets.length === 0) return outcomes[Math.floor(Math.random() * 10)];
    return pickBestOutcome(outcomes, bets, rules.wingoEvaluateBet, !pickHouseFavorable);
  }
  if (game === 'k3') {
    const outcomes = rules.k3AllOutcomes();
    if (bets.length === 0) return outcomes[Math.floor(Math.random() * outcomes.length)];
    return pickBestOutcome(outcomes, bets, rules.k3EvaluateBet, !pickHouseFavorable);
  }
  // 5d — uses its own optimized enumeration (100k combos via precomputed tables)
  if (bets.length === 0) {
    const digits = Array.from({ length: 5 }, () => Math.floor(Math.random() * 10));
    return rules.fivedGenerateResult(digits);
  }
  return rules.fivedBestOutcome(bets, !pickHouseFavorable);
}

/** Generic brute-force outcome picker for WinGo (10 outcomes) and K3 (216 outcomes). */
function pickBestOutcome(outcomes, bets, evaluateBetFn, pickMax) {
  let best = null;
  let bestPayout = pickMax ? -1 : Infinity;
  for (const outcome of outcomes) {
    let payout = 0;
    for (const bet of bets) {
      const odds = evaluateBetFn(bet, outcome);
      if (odds > 0) payout += bet.netAmount * odds;
    }
    if (pickMax ? payout > bestPayout : payout < bestPayout) {
      bestPayout = payout;
      best = outcome;
    }
  }
  return best;
}

function evaluateBetForGame(game, bet, result) {
  if (game === 'wingo') return rules.wingoEvaluateBet(bet, result);
  if (game === 'k3') return rules.k3EvaluateBet(bet, result);
  return rules.fivedEvaluateBet(bet, result);
}

/**
 * Settles a round: locks it, decides the result (respecting admin win-rate
 * control), pays out every pending bet, and fires all the downstream
 * hooks — VIP EXP, upline commission, partner-reward turnover check,
 * and betting-rebate accrual — for every user who bet in this round.
 */
async function settleRound(round, io) {
  // Atomically claim this round for settlement. If the round scheduler's tick overlaps
  // with a previous tick that's still mid-settlement (e.g. a round with many bets takes
  // >1s to process), a second call could otherwise re-settle the same round and pay
  // winners twice. This atomic open->locked transition guarantees only ONE caller ever
  // proceeds past this point for a given round.
  const claimed = await GameRound.findOneAndUpdate(
    { _id: round._id, status: 'open' },
    { status: 'locked' },
    { new: true }
  );
  if (!claimed) return round; // already claimed / already settled elsewhere — no-op
  round = claimed;

  const bets = await Bet.find({ roundId: round._id, status: 'pending' });
  let result;

  try {
    result = await decideResult(round.game, bets);
    round.result = result;
    let totalBetAmount = 0;
    let totalPayout = 0;

    for (const bet of bets) {
      try {
        const odds = evaluateBetForGame(round.game, bet, result);
        const win = odds > 0;
        const payout = win ? Math.round(bet.netAmount * odds * 100) / 100 : 0;

        bet.status = win ? 'won' : 'lost';
        bet.oddsMultiplier = odds;
        bet.payout = payout;
        bet.settledAt = new Date();

        // Betting rebate (Activity/BettingRebate.jsx) — cashback on the
        // bettor's OWN turnover, independent of win/loss.
        calculateBetRebate(bet);
        await bet.save();

        totalBetAmount += bet.amount;
        totalPayout += payout;

        const user = await User.findById(bet.userId);
        if (!user) continue;

        if (win) {
          user.balance += payout;
        }
        await addVipExp(user, bet.amount); // VIP EXP: Rs100 bet = 1 EXP, regardless of win/loss
        await user.save();

        await Transaction.create({
          userId: user._id, type: 'game', gameName: round.game, betAmount: bet.amount,
          winAmount: payout,
          result: win ? 'win' : 'loss',
          status: 'completed',
          balanceAfter: user.balance,
          description: `${round.game.toUpperCase()} ${win ? 'win' : 'loss'} — period ${round.period}`
        });

        // Upline commission (Promotion/CommissionDetail.jsx — 6-level rebate) — on turnover, not just wins.
        await creditCommission(user, bet.amount);
        // Partner-reward turnover check (referrer's deposit-bonus unlock).
        await checkAndCreditPartnerRewards(user._id);

        io?.to(`user:${user._id}`).emit('betSettled', {
          betId: bet._id.toString(),
          game: round.game,
          duration: round.duration,
          period: round.period,
          status: win ? 'Succeed' : 'Failed',
          winLose: win ? payout : -bet.amount,
          amount: bet.amount,
          result,
          newBalance: user.balance
        });
      } catch (betErr) {
        // One bad bet (e.g. a deleted user, a transient DB hiccup) must not
        // stop the whole round from settling — log it and keep going so
        // every other bettor in this round still gets their result.
        console.error(`Bet settlement error (bet ${bet._id}, round ${round.period}):`, betErr.message);
      }
    }

    // Commit the round's final state with a plain atomic update (not
    // round.save()) — a full Mongoose document save can fail on a version
    // conflict even though every field on it is perfectly valid, and if that
    // happened here (AFTER every bet above was already correctly decided
    // and saved as won/lost), the old code would fall into the catch below
    // and revert the round to 'open'. On retry, since none of those bets
    // are 'pending' anymore, a BRAND NEW random result would get generated
    // and saved as this round's result — completely disconnected from the
    // result each bet was actually judged against. That mismatch (a bet
    // correctly marked Failed, but the round's stored result being some
    // unrelated later draw, or blank while retrying) is exactly what made
    // it look like results weren't matching / were missing. Retrying the
    // atomic write directly avoids that entirely, since it can't hit a
    // version conflict and doesn't touch decideResult again.
    let committed = false;
    let lastErr;
    for (let i = 0; i < 3 && !committed; i++) {
      try {
        await GameRound.updateOne(
          { _id: round._id },
          { result, totalBetAmount, totalPayout, status: 'settled', settledAt: new Date() }
        );
        committed = true;
      } catch (writeErr) {
        lastErr = writeErr;
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    if (!committed) throw lastErr;

    io?.emit('roundSettled', { game: round.game, duration: round.duration, period: round.period, result });
  } catch (err) {
    if (!result) {
      // Failed before a result was even decided — nothing was processed
      // yet, so it's safe to put the round back to 'open' and let the next
      // scheduler tick try the whole thing fresh.
      console.error(`Round settlement failed before deciding a result (round ${round.period}), will retry next tick:`, err.message);
      await GameRound.updateOne({ _id: round._id }, { status: 'open' });
    } else {
      // A result WAS decided and bets were already judged against it — do
      // NOT revert to 'open' (that would cause a mismatched re-decide on
      // retry). Leave it 'locked' and log loudly; this needs a human look,
      // but member balances/bet outcomes above are already correct either way.
      console.error(`CRITICAL: round ${round.period} bets settled but final round commit failed after retries:`, err.message);
    }
    throw err;
  }

  return round;
}

/**
 * "My history" rule: if a user hasn't made an approved deposit in the last
 * 2 days, their bet history is hidden (not deleted — just not returned)
 * across all three games. Returns true if history should be shown.
 */
async function hasRecentDeposit(userId) {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const exists = await Deposit.exists({ userId, status: 'approved', createdAt: { $gte: twoDaysAgo } });
  return !!exists;
}

module.exports = {
  ALL_STREAMS, TAX_RATE, computeRoundWindow, getCurrentRound,
  generateOrderNumber, placeBet, decideResult, settleRound,
  evaluateBetForGame, hasRecentDeposit
};