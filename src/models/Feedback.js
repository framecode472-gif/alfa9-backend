const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['Bug Report', 'Suggestion', 'Payment Issue', 'Other'],
    default: 'Other'
  },
  message: { type: String, required: true },
  images: [{ type: String }], // uploaded screenshot URLs (max 3, enforced in controller)

  status: {
    type: String,
    enum: ['open', 'reviewed', 'resolved'],
    default: 'open'
  },

  // Admin reply (so Alfa9 team can respond to a user's feedback)
  adminReply: { type: String, default: null },
  repliedAt: { type: Date, default: null },
  repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
