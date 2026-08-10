const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Get my complete profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .select('-password')
      .populate('referredBy', 'name referralCode');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Backfill for accounts created before numeric UIDs existed — assigns
    // one lazily on first profile load instead of requiring a DB migration.
    if (!user.uid) {
      const { generateUniqueUidForModel } = require('../utils/idGenerators');
      user.uid = await generateUniqueUidForModel(User);
      await user.save();
    }

    // Get referral stats
    const Referral = require('../models/Referral');
    const referrals = await Referral.find({ referrerId: userId });
    
    const totalReferrals = referrals.length;
    const successfulReferrals = referrals.filter(r => r.status === 'bonus_given').length;
    const pendingReferrals = referrals.filter(r => r.status === 'registered').length;

    res.json({
      user,
      referralStats: {
        total: totalReferrals,
        successful: successfulReferrals,
        pending: pendingReferrals,
        referralCode: user.referralCode
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        balance: user.balance
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Old password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get my referrals (downline)
exports.getMyReferrals = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const Referral = require('../models/Referral');
    const referrals = await Referral.find({ referrerId: userId })
      .populate('invitedUserId', 'name email balance createdAt')
      .sort({ createdAt: -1 });

    res.json({
      referrals: referrals.map(r => ({
        id: r._id,
        user: r.invitedUserId,
        status: r.status,
        depositAmount: r.depositAmount,
        bonusAmount: r.bonusAmount,
        createdAt: r.createdAt
      }))
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Get my saved withdrawal accounts (Easypaisa / JazzCash)
exports.getWithdrawAccounts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('withdrawAccounts');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      accounts: {
        Easypaisa: user.withdrawAccounts?.Easypaisa?.number ? user.withdrawAccounts.Easypaisa : null,
        JazzCash: user.withdrawAccounts?.JazzCash?.number ? user.withdrawAccounts.JazzCash : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Save/update one gateway's withdrawal account (name + number), per user.
// Previously this lived only in localStorage under a key that wasn't scoped
// to the logged-in user, so every account on the same browser saw the same
// saved Easypaisa/JazzCash details.
exports.saveWithdrawAccount = async (req, res) => {
  try {
    const { gateway, name, number } = req.body;
    if (!['Easypaisa', 'JazzCash'].includes(gateway)) {
      return res.status(400).json({ message: 'Invalid gateway' });
    }
    if (!name || !number) {
      return res.status(400).json({ message: 'Name and account number are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Once THIS user has set an account for this gateway, it's locked —
    // no re-edit from anywhere, not just the UI. Without this, someone
    // could bypass the frontend lock (e.g. by switching gateway tabs
    // inside the modal) and overwrite an already-saved account.
    if (user.withdrawAccounts?.[gateway]?.number) {
      return res.status(400).json({ message: `Your ${gateway} account is already set and locked.` });
    }

    // Block the same Easypaisa/JazzCash number from being saved on more than
    // one alfa9 account — checks the SAME gateway field on every OTHER user.
    const conflict = await User.findOne({
      _id: { $ne: user._id },
      [`withdrawAccounts.${gateway}.number`]: number
    }).select('_id');
    if (conflict) {
      return res.status(400).json({ message: 'This account number is already linked to another alfa9 account.' });
    }

    if (!user.withdrawAccounts) user.withdrawAccounts = {};
    user.withdrawAccounts[gateway] = { name, number };
    await user.save();

    res.json({ message: 'Account saved successfully', accounts: user.withdrawAccounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bind/Update email
exports.updateEmail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newEmail, password } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Password is incorrect' });
    }

    // Check if email already exists
    const existing = await User.findOne({ email: newEmail });
    if (existing && existing._id.toString() !== userId) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    user.email = newEmail;
    await user.save();

    res.json({
      message: 'Email updated successfully',
      email: newEmail
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};