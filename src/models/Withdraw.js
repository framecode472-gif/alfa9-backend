const mongoose = require('mongoose');

const WithdrawSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 500 // Minimum withdrawal
  },
  // Human-friendly reference shown to the user (e.g. WD202607310001a)
  orderNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  method: { 
    type: String, 
    enum: ['upi', 'bank_transfer', 'crypto', 'jazzcash', 'easypaisa'], 
    required: true 
  },
  upiId: { 
    type: String 
  },
  accountNumber: { 
    type: String 
  },
  ifscCode: { 
    type: String 
  },
  accountHolderName: { 
    type: String 
  },
  cryptoAddress: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  approvedAt: { 
    type: Date 
  },
  rejectionReason: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Withdraw', WithdrawSchema);