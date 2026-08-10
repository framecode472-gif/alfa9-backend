const CommissionRecord = require('../models/CommissionRecord');
const VipTier = require('../models/VipTier');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * Rebate % tables, copied 1:1 from Promotion/subpages/RebateRatio/RebateRatio.jsx
 * (LOTTERY_DATA). Row index = the earner's own VIP level (L0..L9), column
 * index = how many tiers below them the bettor sits (0 = their direct
 * referral, 5 = 6 tiers down).
 */
const LOTTERY_RATES = [
  [0.0055, 0.0018, 0.00054, 0.000162, 0.0000486, 0.00001458],
  [0.0065, 0.00245, 0.0008575, 0.00030012, 0.00010504, 0.00003677],
  [0.007, 0.0028125, 0.00105469, 0.00039551, 0.00014832, 0.00005562],
  [0.0075, 0.0032, 0.00128, 0.000512, 0.0002048, 0.00008192],
  [0.008, 0.0036125, 0.00153531, 0.00065251, 0.00027732, 0.00011786],
  [0.0085, 0.00405, 0.0018225, 0.00082012, 0.00036906, 0.00016608],
  [0.009, 0.005, 0.0025, 0.00125, 0.000625, 0.0003125],
  [0.0095, 0.00605, 0.0033275, 0.00183013, 0.00100657, 0.00055361],
  [0.01, 0.0072, 0.00432, 0.002592, 0.0015552, 0.00093312],
  [0.014, 0.0098, 0.00686, 0.004802, 0.0033614, 0.00235298],
];

/**
 * Call this whenever a bet settles (from the WinGo/K3/5D engine, once
 * built). Walks `bettor.uplineChain` (up to 6 levels) and credits each
 * upline member their rebate commission based on THEIR OWN vip level and
 * how many tiers down the bettor sits — same rule shown in RebateRatio.jsx.
 *
 * Does not throw on a missing upline member (chain may be shorter than 6).
 */
async function creditCommission(bettor, betAmount) {
  if (!bettor.uplineChain || bettor.uplineChain.length === 0) return;

  for (let i = 0; i < bettor.uplineChain.length && i < 6; i++) {
    const earnerId = bettor.uplineChain[i];
    const earner = await User.findById(earnerId);
    if (!earner) continue;

    const earnerLevel = earner.vip?.level || 0;
    const rate = LOTTERY_RATES[earnerLevel]?.[i] || 0;
    if (rate <= 0) continue;

    const amount = betAmount * rate;
    if (amount <= 0) continue;

    earner.balance += amount;
    await earner.save();

    await CommissionRecord.create({
      earnerId: earner._id,
      fromUserId: bettor._id,
      level: i + 1,
      betAmount,
      amount
    });

    await Transaction.create({
      userId: earner._id,
      type: 'bonus',
      amount,
      status: 'completed',
      balanceAfter: earner.balance,
      description: `L${i + 1} rebate commission from downline bet`
    });
  }
}

module.exports = { creditCommission, LOTTERY_RATES };
