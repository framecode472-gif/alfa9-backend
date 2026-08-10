const PartnerReward = require('../models/PartnerReward');
const Deposit = require('../models/Deposit');
const Bet = require('../models/Bet');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mirrors REWARD_ROWS from Promotion/subpages/PartnerRewards/PartnerRewards.jsx
 * exactly — one array per deposit number (1st/2nd/3rd), each entry
 * { min, max, turnover, bonus }. max: null means no upper bound.
 */
const PARTNER_REWARD_TABLE = {
  1: [
    { min: 300, max: 1000, turnover: 1500, bonus: 30 },
    { min: 1000, max: 5000, turnover: 5000, bonus: 100 },
    { min: 5000, max: 10000, turnover: 25000, bonus: 300 },
    { min: 10000, max: 50000, turnover: 50000, bonus: 500 },
    { min: 50000, max: null, turnover: 250000, bonus: 1500 },
  ],
  2: [
    { min: 500, max: 3000, turnover: 2500, bonus: 50 },
    { min: 3000, max: 10000, turnover: 15000, bonus: 150 },
    { min: 10000, max: 50000, turnover: 50000, bonus: 500 },
    { min: 50000, max: null, turnover: 250000, bonus: 2000 },
  ],
  3: [
    { min: 1000, max: 5000, turnover: 5000, bonus: 100 },
    { min: 5000, max: 10000, turnover: 25000, bonus: 300 },
    { min: 10000, max: 50000, turnover: 50000, bonus: 700 },
    { min: 50000, max: null, turnover: 250000, bonus: 2000 },
  ],
};

function findTier(depositNumber, amount) {
  const rows = PARTNER_REWARD_TABLE[depositNumber];
  if (!rows) return null;
  return rows.find(r => amount >= r.min && (r.max === null || amount < r.max)) || null;
}

/**
 * Call this right after a deposit is approved (depositController.approveDeposit).
 * If the depositing user has a direct referrer AND this was their 1st, 2nd,
 * or 3rd approved deposit AND the amount matches a reward tier, register a
 * 'pending' PartnerReward (turnover not checked yet — that happens later).
 * Safe to call for every deposit; does nothing if not eligible.
 */
async function registerPartnerRewardCandidate(depositUser, depositAmount, depositDate, session) {
  if (!depositUser.referredBy) return;

  const countQuery = Deposit.countDocuments({
    userId: depositUser._id,
    status: 'approved'
  });
  if (session) countQuery.session(session);
  const approvedDepositCount = await countQuery;
  // approvedDepositCount already includes the deposit that was just approved
  const depositNumber = approvedDepositCount;
  if (depositNumber < 1 || depositNumber > 3) return;

  const tier = findTier(depositNumber, depositAmount);
  if (!tier) return;

  try {
    const doc = {
      referrerId: depositUser.referredBy,
      referredUserId: depositUser._id,
      depositNumber,
      depositAmount,
      requiredTurnover: tier.turnover,
      bonusAmount: tier.bonus,
      depositDate,
      expiresAt: new Date(depositDate.getTime() + SEVEN_DAYS_MS)
    };
    if (session) await PartnerReward.create([doc], { session });
    else await PartnerReward.create(doc);
  } catch (err) {
    if (err.code !== 11000) throw err; // ignore duplicate (already registered for this deposit number)
  }
}

/**
 * Call this after any of `referredUserId`'s bets settle (once the game
 * settles — called from settleRound() in utils/gameEngine.js). Checks all their pending
 * PartnerReward candidates: if turnover since depositDate now meets the
 * requirement, credits the referrer; if the 7-day window has passed
 * without meeting it, marks expired.
 */
async function checkAndCreditPartnerRewards(referredUserId) {
  const pending = await PartnerReward.find({ referredUserId, status: 'pending' });
  if (pending.length === 0) return;

  for (const reward of pending) {
    const turnoverAgg = await Bet.aggregate([
      { $match: { userId: reward.referredUserId, createdAt: { $gte: reward.depositDate } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const turnover = turnoverAgg.length > 0 ? turnoverAgg[0].total : 0;

    if (turnover >= reward.requiredTurnover) {
      const referrer = await User.findById(reward.referrerId);
      if (referrer) {
        referrer.balance += reward.bonusAmount;
        await referrer.save();
        await Transaction.create({
          userId: referrer._id,
          type: 'bonus',
          amount: reward.bonusAmount,
          status: 'completed',
          balanceAfter: referrer.balance,
          description: `Partner reward — referral's deposit #${reward.depositNumber} turnover met`
        });
      }
      reward.status = 'credited';
      reward.creditedAt = new Date();
      await reward.save();
    } else if (Date.now() > reward.expiresAt.getTime()) {
      reward.status = 'expired';
      await reward.save();
    }
  }
}

module.exports = { PARTNER_REWARD_TABLE, registerPartnerRewardCandidate, checkAndCreditPartnerRewards };
