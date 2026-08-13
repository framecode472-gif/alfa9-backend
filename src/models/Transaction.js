const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['game', 'deposit', 'withdrawal', 'gift', 'referral', 'bonus'], 
    required: true 
  },
  category: { type: String, default: null }, // for type='bonus': matches Activity/BonusDetails.jsx CATEGORIES list
  gameName: { 
    type: String, 
    enum: ['wingo', 'k3', '5d', 'boom'], 
    // sirf game type ke liye required
  },
  betAmount: { 
    type: Number, 
    default: 0 
  },
  winAmount: { 
    type: Number, 
    default: 0 
  },
  amount: { 
    type: Number, 
    default: 0 
    // deposit, withdrawal, gift ke liye
  },
  result: { 
    type: String, 
    enum: ['win', 'loss', 'pending', 'approved', 'rejected'], 
  },
  status: { 
    type: String, 
    enum: ['completed', 'pending', 'failed'], 
    default: 'completed' 
  },
  balanceAfter: { 
    type: Number, 
    required: true 
  },
  description: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Transaction', TransactionSchema);