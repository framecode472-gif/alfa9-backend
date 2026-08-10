const Transaction = require('../models/Transaction');

// User: Get my game transaction history
exports.getMyTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { gameName, result, page = 1, limit = 10 } = req.query;

    const query = { userId };
    if (gameName) query.gameName = gameName;
    if (result) query.result = result;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Transaction.countDocuments(query);
    const totalBet = transactions.reduce((sum, t) => sum + t.betAmount, 0);
    const totalWin = transactions.reduce((sum, t) => sum + t.winAmount, 0);

    res.json({
      transactions,
      summary: {
        totalBet,
        totalWin,
        netProfit: totalWin - totalBet
      },
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

// Admin: Get all game transactions
exports.getAllTransactions = async (req, res) => {
  try {
    const { gameName, result, page = 1, limit = 20 } = req.query;

    const query = {};
    if (gameName) query.gameName = gameName;
    if (result) query.result = result;

    const transactions = await Transaction.find(query)
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
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

// Admin: Get user game transactions
exports.getUserTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
    const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 });
    
    const totalBet = transactions.reduce((sum, t) => sum + t.betAmount, 0);
    const totalWin = transactions.reduce((sum, t) => sum + t.winAmount, 0);

    res.json({
      transactions,
      summary: {
        totalBet,
        totalWin,
        netProfit: totalWin - totalBet
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin: Get game stats
exports.getGameStats = async (req, res) => {
  try {
    const { gameName } = req.query;
    const query = gameName ? { gameName } : {};

    const totalGames = await Transaction.countDocuments(query);
    const totalBets = await Transaction.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$betAmount' } } }
    ]);
    const totalWins = await Transaction.aggregate([
      { $match: { ...query, result: 'win' } },
      { $group: { _id: null, total: { $sum: '$winAmount' } } }
    ]);
    const winCount = await Transaction.countDocuments({ ...query, result: 'win' });
    const lossCount = await Transaction.countDocuments({ ...query, result: 'loss' });

    res.json({
      totalGames,
      totalBetAmount: totalBets[0]?.total || 0,
      totalWinAmount: totalWins[0]?.total || 0,
      winCount,
      lossCount,
      winRate: totalGames > 0 ? ((winCount / totalGames) * 100).toFixed(2) + '%' : '0%'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};