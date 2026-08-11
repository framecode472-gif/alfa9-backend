const Withdraw = require('../models/Withdraw');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { notifyAdmin } = require('./notificationController');
const { generateOrderNumber } = require('../utils/orderNumber');

// User: Create withdrawal request (WITH TRANSACTION SAVE)
exports.createWithdraw = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, method, upiId, accountNumber, ifscCode, accountHolderName, cryptoAddress, fundPassword } = req.body;
    const userId = req.user.id;

    if (amount < 500) {
      throw new Error('Minimum withdrawal amount is 500');
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    // ===== FUND PASSWORD GATE (Account/Safe.jsx PIN) =====
    if (!user.fundPassword) {
      throw new Error('Please set your fund password in Safe settings before withdrawing');
    }
    if (!fundPassword) {
      throw new Error('Fund password is required to withdraw');
    }
    const pinMatch = await bcrypt.compare(String(fundPassword), user.fundPassword);
    if (!pinMatch) {
      throw new Error('Incorrect fund password');
    }
    // ======================================================

    if (user.balance < amount) {
      throw new Error('Insufficient balance');
    }

    // ===== WAGERING REQUIREMENT GATE =====
    // User must have bet (turnover) at least as much as their approved
    // deposits before they're allowed to withdraw. Admin can override
    // `wagering.required` per-user from the admin panel to raise, lower,
    // or clear this (e.g. to deliberately delay a specific user).
    const wagerRequired = user.wagering?.required || 0;
    const wagerCompleted = user.wagering?.completed || 0;
    const wagerRemaining = Math.round((wagerRequired - wagerCompleted) * 100) / 100;
    if (wagerRemaining > 0) {
      throw new Error(`Withdraw karne se pehle aapko Rs${wagerRemaining} ki betting mukammal karni hogi (Rs${wagerCompleted} / Rs${wagerRequired} mukammal).`);
    }

    // Deduct balance
    user.balance -= amount;

    // Requirement cleared for this cycle — reset so the next deposit starts
    // a fresh requirement rather than carrying over old completed turnover.
    user.wagering.required = 0;
    user.wagering.completed = 0;

    await user.save({ session });

    // Create withdrawal request
    const withdraw = new Withdraw({
      userId,
      amount,
      method,
      orderNumber: generateOrderNumber('WD'),
      upiId,
      accountNumber,
      ifscCode,
      accountHolderName,
      cryptoAddress
    });
    await withdraw.save({ session });

    // ← TRANSACTION SAVE KAR (NEW)
    const transaction = new Transaction({
      userId,
      type: 'withdrawal',
      amount: amount,
      status: 'pending',
      balanceAfter: user.balance,
      description: `Withdrawal request - ${method}`
    });
    await transaction.save({ session });

    await session.commitTransaction();

    await notifyAdmin(
      req.io,
      'withdrawal',
      `${user?.name || 'A member'} requested a withdrawal of Rs${amount} via ${method}`,
      'New Withdrawal Request'
    );

    res.status(201).json({
      message: 'Withdrawal request submitted successfully',
      withdraw,
      remainingBalance: user.balance
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Withdraw error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// User: Get my withdrawal history
exports.getMyWithdraws = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userId };
    if (status) query.status = status;

    const withdraws = await Withdraw.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Withdraw.countDocuments(query);

    res.json({
      withdraws,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// User: check my own wagering (turnover) requirement status — how much more
// betting is needed before a withdrawal will be allowed.
exports.getTurnoverStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('wagering');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const required = user.wagering?.required || 0;
    const completed = user.wagering?.completed || 0;
    res.json({
      required,
      completed,
      remaining: Math.max(0, Math.round((required - completed) * 100) / 100),
      canWithdraw: completed >= required
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Get all pending withdrawals
exports.getPendingWithdraws = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const withdraws = await Withdraw.find({ status: 'pending' })
      .populate('userId', 'name email phone balance')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Withdraw.countDocuments({ status: 'pending' });

    res.json({
      withdraws,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Approve withdrawal (WITH TRANSACTION UPDATE)
exports.approveWithdraw = async (req, res) => {
  try {
    const { withdrawId } = req.params;
    const adminId = req.user.id;

    const withdraw = await Withdraw.findById(withdrawId);
    if (!withdraw) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    if (withdraw.status !== 'pending') {
      return res.status(400).json({ message: 'Withdrawal already processed' });
    }

    withdraw.status = 'approved';
    withdraw.approvedBy = adminId;
    withdraw.approvedAt = new Date();
    await withdraw.save();

    // ← UPDATE TRANSACTION STATUS (NEW)
    await Transaction.findOneAndUpdate(
      { userId: withdraw.userId, type: 'withdrawal', status: 'pending' },
      { status: 'completed', description: `Withdrawal approved - ${withdraw.method}` }
    );

    res.json({
      message: 'Withdrawal approved successfully',
      withdraw
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Reject withdrawal (WITH REFUND + TRANSACTION UPDATE)
exports.rejectWithdraw = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    const withdraw = await Withdraw.findById(withdrawId).session(session);
    if (!withdraw) {
      throw new Error('Withdrawal not found');
    }

    if (withdraw.status !== 'pending') {
      throw new Error('Withdrawal already processed');
    }

    // Refund balance to user
    const user = await User.findById(withdraw.userId).session(session);
    user.balance += withdraw.amount;
    await user.save({ session });

    withdraw.status = 'rejected';
    withdraw.approvedBy = adminId;
    withdraw.approvedAt = new Date();
    withdraw.rejectionReason = reason;
    await withdraw.save({ session });

    // ← UPDATE TRANSACTION STATUS (NEW)
    await Transaction.findOneAndUpdate(
      { userId: withdraw.userId, type: 'withdrawal', status: 'pending' },
      { status: 'completed', description: `Withdrawal rejected - Refunded - ${reason}` }
    );

    await session.commitTransaction();

    res.json({
      message: 'Withdrawal rejected and amount refunded',
      withdraw,
      refundedBalance: user.balance
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};