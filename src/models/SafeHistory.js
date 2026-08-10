const mongoose = require('mongoose');

/**
 * One entry in a user's Safe (savings vault) history — feeds the
 * Account/Safe "Historical Records" list, filterable by year/month.
 */
const SafeHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['in', 'out', 'income'], // in = transfer to safe, out = transfer to wallet, income = interest paid out
    required: true
  },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

SafeHistorySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SafeHistory', SafeHistorySchema);
