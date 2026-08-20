const mongoose = require('mongoose');

const SpinHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  prizeLabel: { type: String, required: true },   // e.g. "Rs50,000" — matches Spin.jsx SEGMENTS label
  prizeAmount: { type: Number, required: true },   // actual amount credited (see spinRewards.js daily cap logic)
  source: { type: String, enum: ['deposit', 'referral'], default: 'deposit' }, // which wheel this spin came from
  createdAt: { type: Date, default: Date.now }
});

SpinHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SpinHistory', SpinHistorySchema);