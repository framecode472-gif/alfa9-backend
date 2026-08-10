const mongoose = require('mongoose');

/**
 * Short-lived OTP codes for Settings.jsx (email/phone change verification).
 * Auto-deletes itself once `expiresAt` passes (TTL index).
 */
const OtpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  target: {
    type: String, // the email or phone the OTP was sent to
    required: true
  },
  code: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    enum: ['update_email', 'update_phone', 'reset_password', 'fund_password'],
    required: true
  },
  verified: { type: Boolean, default: false },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL — Mongo auto-deletes expired docs
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Otp', OtpSchema);
