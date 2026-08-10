const User = require('../models/User');
const VipTier = require('../models/VipTier');
const Transaction = require('../models/Transaction');

// GET /api/vip/tiers  (public list, used to render the level slider)
exports.getVipTiers = async (req, res) => {
  try {
    const tiers = await VipTier.find().sort({ level: 1 });
    res.json({ tiers });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/vip/status  (logged-in user's VIP page data)
exports.getMyVipStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const tiers = await VipTier.find().sort({ level: 1 });
    const currentTier = tiers.find(t => t.level === user.vip.level) || null;
    const nextTier = tiers.find(t => t.level === user.vip.level + 1) || null;

    const maintenanceProgress = user.vip.exp - user.vip.maintenanceExpStart;
    const maintenanceDeadline = currentTier
      ? new Date(new Date(user.vip.levelSince).getTime() + 30 * 24 * 60 * 60 * 1000)
      : null;

    res.json({
      exp: user.vip.exp,
      level: user.vip.level,
      currentTier,
      nextTier,
      levelUpClaimed: user.vip.levelUpClaimed,
      lastMonthlyClaim: user.vip.lastMonthlyClaim,
      maintenance: currentTier ? {
        required: currentTier.maintenanceReq,
        progress: Math.max(0, maintenanceProgress),
        deadline: maintenanceDeadline
      } : null,
      tiers
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/vip/claim-levelup  { level }
exports.claimLevelUpBonus = async (req, res) => {
  try {
    const { level } = req.body;
    if (!level) return res.status(400).json({ message: 'level is required' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.vip.level < level) {
      return res.status(400).json({ message: `You haven't reached VIP${level} yet` });
    }
    if (user.vip.levelUpClaimed.includes(level)) {
      return res.status(400).json({ message: `VIP${level} level-up bonus already claimed` });
    }

    const tier = await VipTier.findOne({ level });
    if (!tier) return res.status(404).json({ message: 'VIP tier not found' });

    user.balance += tier.levelUpCoins;
    user.vip.levelUpClaimed.push(level);
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: tier.levelUpCoins,
      status: 'completed',
      balanceAfter: user.balance,
      description: `VIP${level} level-up bonus (+${tier.levelUpFreeSpins} free spins)`
    });

    res.json({
      message: `VIP${level} level-up bonus claimed`,
      coins: tier.levelUpCoins,
      freeSpins: tier.levelUpFreeSpins,
      balance: user.balance
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /api/vip/claim-monthly
exports.claimMonthlyBonus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.vip.level < 1) {
      return res.status(400).json({ message: 'No VIP level achieved yet' });
    }

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (user.vip.lastMonthlyClaim === currentMonthKey) {
      return res.status(400).json({ message: 'Monthly reward already claimed this month' });
    }

    const tier = await VipTier.findOne({ level: user.vip.level });
    if (!tier) return res.status(404).json({ message: 'VIP tier not found' });

    // Maintenance requirement must be met this cycle to unlock the monthly reward
    const maintenanceProgress = user.vip.exp - user.vip.maintenanceExpStart;
    if (maintenanceProgress < tier.maintenanceReq) {
      return res.status(400).json({
        message: 'Maintenance requirement not met this month',
        required: tier.maintenanceReq,
        progress: Math.max(0, maintenanceProgress)
      });
    }

    user.balance += tier.monthlyCoins;
    user.vip.lastMonthlyClaim = currentMonthKey;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: tier.monthlyCoins,
      status: 'completed',
      balanceAfter: user.balance,
      description: `VIP${user.vip.level} monthly reward (+${tier.monthlyFreeSpins} free spins)`
    });

    res.json({
      message: 'Monthly reward claimed',
      coins: tier.monthlyCoins,
      freeSpins: tier.monthlyFreeSpins,
      balance: user.balance
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// PUT /api/admin/vip/:level  (admin — edit a tier's requirements/rewards)
exports.updateVipTier = async (req, res) => {
  try {
    const { level } = req.params;
    const updates = req.body;
    delete updates.level; // level is the identifier, don't let it be overwritten

    const tier = await VipTier.findOneAndUpdate({ level }, updates, { new: true });
    if (!tier) return res.status(404).json({ message: 'VIP tier not found' });

    res.json({ message: 'VIP tier updated', tier });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};


// GET /api/vip/exp-history — per-bet EXP gain list, for the VIP page's "Betting EXP" history tab
exports.getExpHistory = async (req, res) => {
  try {
    const Bet = require('../models/Bet');
    const bets = await Bet.find({ userId: req.user.id, status: { $in: ['won', 'lost'] } })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('amount createdAt');

    res.json({
      // shape matches Vip.jsx's history render exactly: b.amount + b.time (it computes EXP itself as amount/100)
      history: bets.map(b => ({
        amount: b.amount,
        time: new Date(b.createdAt).toISOString().slice(0, 19).replace('T', ' ')
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
