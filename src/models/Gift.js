const mongoose = require('mongoose');

const GiftSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true,
    min: 1
  },
  type: { 
    type: String, 
    enum: ['signup_bonus', 'referral', 'daily_bonus', 'admin_gift'], 
    default: 'admin_gift'
  },
  // ===== ADMIN GIFT-CODE FIELDS (redeemable code system) =====
  code: {
    type: String,
    unique: true,
    sparse: true // allows null for non-code gifts (signup_bonus etc.)
  },
  claimed: {
    type: Boolean,
    default: false
  },
  claimedAt: {
    type: Date
  },
  expiry: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // ==============================================================
  description: { 
    type: String 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Gift', GiftSchema);