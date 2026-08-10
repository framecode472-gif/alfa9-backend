const mongoose = require('mongoose');

/**
 * Real notification feed — used for:
 *  - Admin panel bell (deposit/withdrawal alerts) — currently local/fake
 *  - Member-facing Notification.jsx page — currently local/fake
 */
const NotificationSchema = new mongoose.Schema({
  // Who sees this notification. Null userId + audience 'admin' = admin-only.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  audience: {
    type: String,
    enum: ['user', 'admin'],
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'gift', 'system', 'promo', 'chat'],
    required: true
  },
  title: { type: String },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', NotificationSchema);