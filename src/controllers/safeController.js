const bcrypt = require('bcryptjs');
const User = require('../models/User');
const SafeHistory = require('../models/SafeHistory');
const { accrueInterest, getDailyRate } = require('../utils/safeInterest');

const EACH_AMOUNT = 100; // minimum transfer unit, must match Safe.jsx EACH_AMOUNT

// ===== FUND PASSWORD (6-digit PIN, gates withdrawals) =====

// POST /api/user/safe/set-password   body: { pin }
exports.setFundPassword = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 6 digits' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.fundPassword = await bcrypt.hash(pin, 10);
    await user.save();

    res.json({ message: 'Fund password set successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/user/safe/verify-password   body: { pin }
exports.verifyFundPassword = async (req, res) => {
  try {
    const { pin } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.fundPassword) {
      return res.status(400).json({ message: 'Fund password not set yet' });
    }

    const match = await bcrypt.compare(String(pin || ''), user.fundPassword);
    if (!match) return res.status(400).json({ message: 'Incorrect fund password' });

    res.json({ message: 'Fund password verified', valid: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== SAFE (interest-bearing vault) =====

// GET /api/safe/status
exports.getSafeStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await accrueInterest(user);
    await user.save();

    const dailyRate = await getDailyRate(user);

    res.json({
      safeBalance: user.safe.balance,
      walletBalance: user.balance,
      generatedRevenue: user.safe.generatedRevenue,
      accumulatedRevenue: user.safe.accumulatedRevenue,
      dailyRate,                                   // e.g. 0.0012 = 0.12%
      estimatedDailyRevenue: user.safe.balance * dailyRate,
      hasFundPassword: !!user.fundPassword
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/safe/transfer-in   body: { amount }
exports.transferIn = async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Enter amount to transfer' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (amount > user.balance) return res.status(400).json({ message: 'Insufficient wallet balance' });

    const rounded = Math.floor(amount / EACH_AMOUNT) * EACH_AMOUNT;
    if (rounded <= 0) return res.status(400).json({ message: `Minimum transfer is Rs${EACH_AMOUNT}` });

    await accrueInterest(user);

    user.balance -= rounded;
    user.safe.balance += rounded;
    await user.save();

    await SafeHistory.create({ userId: user._id, type: 'in', amount: rounded });

    res.json({
      message: 'Transferred to Safe',
      amount: rounded,
      walletBalance: user.balance,
      safeBalance: user.safe.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/safe/transfer-out   body: { amount }
exports.transferOut = async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Enter amount to transfer' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (amount > user.safe.balance) return res.status(400).json({ message: 'Insufficient safe balance' });

    const rounded = Math.floor(amount / EACH_AMOUNT) * EACH_AMOUNT;
    if (rounded <= 0) return res.status(400).json({ message: `Minimum transfer is Rs${EACH_AMOUNT}` });

    await accrueInterest(user);

    const profit = user.safe.generatedRevenue;

    user.safe.balance -= rounded;
    user.balance += rounded + profit;
    user.safe.generatedRevenue = 0; // paid out — matches Safe.jsx (profit rolls into the transfer)
    await user.save();

    await SafeHistory.create({ userId: user._id, type: 'out', amount: rounded });
    if (profit > 0.004) {
      await SafeHistory.create({ userId: user._id, type: 'income', amount: profit });
    }

    res.json({
      message: 'Transferred to Wallet',
      amount: rounded + profit,
      walletBalance: user.balance,
      safeBalance: user.safe.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/safe/history?year=2026&month=7
exports.getSafeHistory = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const records = await SafeHistory.find({
      userId: req.user.id,
      createdAt: { $gte: start, $lt: end }
    }).sort({ createdAt: -1 });

    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};