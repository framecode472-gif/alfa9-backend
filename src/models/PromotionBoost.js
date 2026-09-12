const mongoose = require('mongoose');

// ===== PROMOTION BOOST (admin-set manual referral stats) =====
// Lets an admin manually pad a specific user's Promotion page numbers
// (register count, deposit number, deposit amount, first-deposit count)
// on top of whatever is real. Used e.g. to make a user's referral stats
// look more active than they actually are. These values are ADDED to the
// real, live-computed numbers in promotionController.getPromotionSummary —
// they never replace or hide real data, so nothing breaks if the boost
// is later removed.
const PromotionBoostSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    direct: {
      register: { type: Number, default: 0 },
      depositNumber: { type: Number, default: 0 },
      depositAmount: { type: Number, default: 0 },
      firstDeposit: { type: Number, default: 0 }
    },
    team: {
      register: { type: Number, default: 0 },
      depositNumber: { type: Number, default: 0 },
      depositAmount: { type: Number, default: 0 },
      firstDeposit: { type: Number, default: 0 }
    },
    note: { type: String, default: '' } // optional admin note, e.g. "why this was set"
  },
  { timestamps: true }
);

module.exports = mongoose.model('PromotionBoost', PromotionBoostSchema);