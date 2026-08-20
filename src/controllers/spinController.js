const User = require('../models/User');
const SpinHistory = require('../models/SpinHistory');
const Transaction = require('../models/Transaction');
const { resetIfNewDay, pickPrize, SPIN_DAILY_WIN_CAP, SPIN_TIERS, pickReferralPrize, REFERRAL_1000_REQUIRED_COUNT } = require('../utils/spinRewards');

// GET /api/spin/status
exports.getSpinStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    resetIfNewDay(user);
    await user.save();

    res.json({
      totalRecharge: user.spin.dailyDepositTotal,
      spinsAvailable: user.spin.totalSpinsToday - user.spin.spinsUsedToday,
      totalSpinsToday: user.spin.totalSpinsToday,
      spinsUsedToday: user.spin.spinsUsedToday,
      totalWonToday: user.spin.totalWonToday,
      dailyWinCap: SPIN_DAILY_WIN_CAP,
      tiers: SPIN_TIERS
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/spin/play
exports.playSpin = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    resetIfNewDay(user);

    const available = user.spin.totalSpinsToday - user.spin.spinsUsedToday;
    if (available <= 0) {
      return res.status(400).json({ message: 'No spins left today — deposit more to unlock spins' });
    }

    const prize = pickPrize(user);

    user.spin.spinsUsedToday += 1;
    user.spin.totalWonToday += prize.amount;
    user.balance += prize.amount;
    await user.save();

    await SpinHistory.create({ userId: user._id, prizeLabel: prize.label, prizeAmount: prize.amount });
    if (prize.amount > 0) {
      await Transaction.create({
        userId: user._id,
        type: 'bonus',
        amount: prize.amount,
        status: 'completed',
        balanceAfter: user.balance,
        description: `Wheel Spin — won ${prize.label}`
      });
    }

    res.json({
      prize: { label: prize.label, amount: prize.amount },
      spinsAvailable: user.spin.totalSpinsToday - user.spin.spinsUsedToday,
      totalWonToday: user.spin.totalWonToday,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/spin/history
exports.getSpinHistory = async (req, res) => {
  try {
    const history = await SpinHistory.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== REFERRAL SPIN WHEEL — separate pool from the deposit-based one above =====

// GET /api/spin/referral-status
exports.getReferralSpinStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      spinsAvailable: user.referralSpinsAvailable || 0,
      referralCount: user.referralCount || 0,
      thousandWinsUsed: user.referral1000Wins || 0,
      thousandRequiresReferrals: REFERRAL_1000_REQUIRED_COUNT
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/spin/referral-play
exports.playReferralSpin = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if ((user.referralSpinsAvailable || 0) <= 0) {
      return res.status(400).json({ message: 'No referral spins left — invite friends and get them to deposit to earn more!' });
    }

    const prize = pickReferralPrize(user);

    user.referralSpinsAvailable -= 1;
    if (prize.amount === 1000) user.referral1000Wins = (user.referral1000Wins || 0) + 1;
    user.balance += prize.amount;
    await user.save();

    await SpinHistory.create({ userId: user._id, prizeLabel: prize.label, prizeAmount: prize.amount, source: 'referral' });
    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: prize.amount,
      status: 'completed',
      balanceAfter: user.balance,
      description: `Referral Spin — won ${prize.label}`
    });

    res.json({
      prize: { label: prize.label, amount: prize.amount },
      spinsAvailable: user.referralSpinsAvailable,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};