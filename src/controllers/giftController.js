const mongoose = require('mongoose');
const Gift = require('../models/Gift');
const User = require('../models/User');

// Admin: Create gift for user
exports.createGift = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, amount, type, description } = req.body;

    // Add balance to user — accepts the numeric UID shown on the member's
    // Account page (same fix as adminController's give-points/gift-code).
    let user = await User.findOne({ uid: String(userId).trim() }).session(session);
    if (!user && mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId).session(session);
    }
    if (!user) {
      throw new Error('User not found — check the ID');
    }

    user.balance += amount;

    // ===== WAGERING REQUIREMENT — gift money is real balance too, so it
    // must be wagered the same as a deposit before it can be withdrawn. =====
    if (!user.wagering) user.wagering = { required: 0, completed: 0 };
    user.wagering.required = (user.wagering.required || 0) + Number(amount);

    await user.save({ session });

    // Create gift record
    const gift = new Gift({
      userId: user._id,
      amount,
      type,
      description
    });
    await gift.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      message: 'Gift created successfully',
      gift,
      newBalance: user.balance
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// User: Get my gifts
exports.getMyGifts = async (req, res) => {
  try {
    const userId = req.user.id;
    const gifts = await Gift.find({ userId }).sort({ createdAt: -1 });
    res.json(gifts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Get all gifts
exports.getAllGifts = async (req, res) => {
  try {
    const gifts = await Gift.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });
    res.json(gifts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// POST /api/gift/redeem   body: { code }
// User redeems an admin-generated gift code (see adminController.createGiftCode).
// Only the exact user it was generated for can redeem it.
exports.redeemGiftCode = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { code } = req.body;
    if (!code || !code.trim()) {
      throw new Error('Please enter a gift code');
    }

    const gift = await Gift.findOne({ code: code.trim().toUpperCase() }).session(session);
    if (!gift) {
      throw new Error('Invalid gift code. Please try again.');
    }
    if (gift.claimed) {
      throw new Error('This gift code has already been used.');
    }
    if (gift.expiry && new Date() > new Date(gift.expiry)) {
      throw new Error('This gift code has expired.');
    }
    if (gift.userId.toString() !== req.user.id) {
      throw new Error('This gift code was not generated for your account.');
    }

    const user = await User.findById(req.user.id).session(session);
    user.balance += gift.amount;

    // ===== WAGERING REQUIREMENT — same rule as above: redeemed gift-code
    // money must be wagered before it can be withdrawn. =====
    if (!user.wagering) user.wagering = { required: 0, completed: 0 };
    user.wagering.required = (user.wagering.required || 0) + gift.amount;

    await user.save({ session });

    gift.claimed = true;
    gift.claimedAt = new Date();
    await gift.save({ session });

    const Transaction = require('../models/Transaction');
    await Transaction.create([{
      userId: user._id,
      type: 'bonus',
      category: 'Gift code',
      amount: gift.amount,
      status: 'completed',
      balanceAfter: user.balance,
      description: `Gift code redeemed: ${gift.code}`
    }], { session });

    await session.commitTransaction();

    res.json({ message: `Rs${gift.amount} added to your balance!`, amount: gift.amount, balance: user.balance });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
};