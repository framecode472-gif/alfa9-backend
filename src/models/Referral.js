const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
  referrerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  invitedUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  invitedUserEmail: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['registered', 'deposited', 'bonus_given'], 
    default: 'registered' 
  },
  depositAmount: { 
    type: Number, 
    default: 0 
  },
  bonusAmount: { 
    type: Number, 
    default: 500 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Referral', ReferralSchema);