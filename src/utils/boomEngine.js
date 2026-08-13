const BoomRound = require('../models/BoomRound');
const GameSetting = require('../models/GameSetting');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { addVipExp } = require('./vipExp');

const GRID_SIZE = 25;
const HOUSE_FACTOR = 0.97; // same 3% built into the odds curve as the frontend's calcMultiplier

function pad(num, size) { return String(num).padStart(size, '0'); }

function generateOrderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
  const rand = Math.floor(Math.random() * 1e9);
  return `BM${stamp}${pad(rand, 9)}`;
}

/**
 * Same curve as the frontend's calcMultiplier() — kept identical so the
 * number the client shows mid-round always matches what the server will
 * actually pay out on cashout.
 */
function calcMultiplier(safeRevealed, minesCount) {
  let mult = 1;
  for (let i = 0; i < safeRevealed; i++) {
    const safeLeft = GRID_SIZE - minesCount - i;
    const tilesLeft = GRID_SIZE - i;
    mult *= tilesLeft / safeLeft;
  }
  return mult * HOUSE_FACTOR;
}

/**
 * Starts a new round. Deducts the stake immediately (like WinGo). Decides
 * ONE thing up front and stores it on the round, same pattern as
 * gameEngine.decideResult: is this round "house mode" or "fair mode",
 * rolled against GameSetting.profitPercentage for gameName='boom'
 * (admin panel: PUT /api/admin/game-settings/boom, 0-100).
 *
 *  - houseMode = true  -> the very next tile the user reveals is FORCED
 *    to be a bomb, no matter which tile they pick. This is what makes
 *    "set win% to 0" mean "boom on the first click": profitPercentage=100
 *    makes every round houseMode=true.
 *  - houseMode = false -> genuine odds the rest of the round: each reveal
 *    uses the true hypergeometric probability for minesCount mines among
 *    the tiles still hidden.
 */
async function startRound(userId, betAmount, minesCount) {
  const setting = await GameSetting.findOne({ gameName: 'boom' });
  if (setting && (!setting.isActive || setting.maintenance)) throw new Error('This game is currently unavailable');

  const mines = Math.max(1, Math.min(24, Number(minesCount) || 3));
  const amount = Math.round(Number(betAmount) * 100) / 100;
  if (!amount || amount <= 0) throw new Error('Invalid bet amount');
  if (setting) {
    if (amount < setting.minBet) throw new Error(`Minimum bet is Rs${setting.minBet}`);
    if (amount > setting.maxBet) throw new Error(`Maximum bet is Rs${setting.maxBet}`);
  }

  const existingActive = await BoomRound.findOne({ userId, status: 'active' });
  if (existingActive) throw new Error('Finish or cash out your current round first');

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.balance < amount) throw new Error('Insufficient balance');

  const profitPercentage = setting ? setting.profitPercentage : 70;
  const houseMode = Math.random() * 100 < profitPercentage;

  user.balance -= amount;
  if (!user.wagering) user.wagering = { required: 0, completed: 0 };
  user.wagering.completed = (user.wagering.completed || 0) + amount;
  await user.save();

  const round = await BoomRound.create({
    userId, betAmount: amount, minesCount: mines, houseMode,
    orderNumber: generateOrderNumber()
  });

  await Transaction.create({
    userId, type: 'game', gameName: 'boom', betAmount: amount,
    status: 'pending', balanceAfter: user.balance,
    description: `Boom bet — round ${round.orderNumber}`
  });

  return { round, balance: user.balance };
}

/**
 * Reveals one tile. Returns { busted, multiplier, balance, autoWin }.
 * Never returns bomb positions the user hasn't hit — only this tile's outcome.
 */
async function revealTile(userId, roundId, tileIndex) {
  const round = await BoomRound.findOne({ _id: roundId, userId, status: 'active' });
  if (!round) throw new Error('No active round found');

  const idx = Number(tileIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= GRID_SIZE) throw new Error('Invalid tile');
  if (round.revealedTiles.includes(idx)) throw new Error('Tile already revealed');

  const tilesLeft = GRID_SIZE - round.revealedTiles.length;
  const isFirstReveal = round.revealedTiles.length === 0;

  // houseMode forces a bust on the first pick, whichever tile it is —
  // matches "0% win" meaning the bomb comes immediately. Once a round
  // survives past its first reveal it's already in fair-mode territory,
  // since houseMode rounds never make it past reveal #1.
  const isBomb = (round.houseMode && isFirstReveal)
    ? true
    : Math.random() < round.minesCount / tilesLeft; // true hypergeometric odds

  if (isBomb) {
    round.status = 'busted';
    round.bombHit = idx;
    round.settledAt = new Date();
    await round.save();

    const user = await User.findById(userId);
    await addVipExp(user, round.betAmount);
    await user.save();

    await Transaction.create({
      userId, type: 'game', gameName: 'boom', betAmount: round.betAmount, winAmount: 0,
      result: 'loss', status: 'completed', balanceAfter: user.balance,
      description: `Boom loss — round ${round.orderNumber}`
    });

    return { busted: true, tileIndex: idx, balance: user.balance, multiplier: 0 };
  }

  round.revealedTiles.push(idx);
  const multiplier = calcMultiplier(round.revealedTiles.length, round.minesCount);

  const allSafeCleared = round.revealedTiles.length >= GRID_SIZE - round.minesCount;
  if (allSafeCleared) {
    // Board fully cleared — auto cash-out, same as the real Mines game.
    const result = await settleCashOut(round, multiplier);
    return { busted: false, tileIndex: idx, multiplier, balance: result.balance, autoWin: true, payout: result.payout };
  }

  await round.save();
  return { busted: false, tileIndex: idx, multiplier };
}

async function settleCashOut(round, multiplier) {
  const payout = Math.round(round.betAmount * multiplier * 100) / 100;

  round.status = 'cashed_out';
  round.multiplier = multiplier;
  round.payout = payout;
  round.settledAt = new Date();
  await round.save();

  const user = await User.findById(round.userId);
  user.balance += payout;
  await addVipExp(user, round.betAmount);
  await user.save();

  await Transaction.create({
    userId: user._id, type: 'game', gameName: 'boom', betAmount: round.betAmount, winAmount: payout,
    result: 'win', status: 'completed', balanceAfter: user.balance,
    description: `Boom win — round ${round.orderNumber} (${multiplier.toFixed(2)}x)`
  });

  return { balance: user.balance, payout };
}

/** Manual cash-out — requires at least one safe tile revealed. */
async function cashOut(userId, roundId) {
  const round = await BoomRound.findOne({ _id: roundId, userId, status: 'active' });
  if (!round) throw new Error('No active round found');
  if (round.revealedTiles.length === 0) throw new Error('Reveal at least one tile before cashing out');

  const multiplier = calcMultiplier(round.revealedTiles.length, round.minesCount);
  return settleCashOut(round, multiplier);
}

/** User walks away mid-round without cashing out — counts as a loss, stake already spent. */
async function giveUp(userId, roundId) {
  const round = await BoomRound.findOne({ _id: roundId, userId, status: 'active' });
  if (!round) throw new Error('No active round found');

  round.status = 'busted';
  round.settledAt = new Date();
  await round.save();

  await Transaction.create({
    userId, type: 'game', gameName: 'boom', betAmount: round.betAmount, winAmount: 0,
    result: 'loss', status: 'completed', balanceAfter: (await User.findById(userId)).balance,
    description: `Boom forfeited — round ${round.orderNumber}`
  });

  return { ok: true };
}

module.exports = { GRID_SIZE, calcMultiplier, startRound, revealTile, cashOut, giveUp };