const mongoose = require('mongoose');

const DepositSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 100
  },
  method: { 
    type: String, 
    enum: ['upi', 'bank_transfer', 'crypto', 'paytm', 'phonepe', 'jazzcash', 'easypaisa'], 
    required: true 
  },
  transactionId: { 
    type: String, 
    required: true,
    unique: true 
  },
  // Human-friendly reference shown to the user (e.g. RC202607310001a) —
  // separate from transactionId (that one's an internal dedupe key).
  orderNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  screenshot: { 
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

module.exports = mongoose.model('Deposit', DepositSchema);