const Otp = require('../models/Otp');

/* ============================================================
   Settings.jsx already calls these two endpoints — they just
   don't exist on the backend yet (404 right now). This is the
   missing piece.
   ============================================================ */

// POST /api/send-otp   body: { target, purpose }
exports.sendOtp = async (req, res) => {
  try {
    // TODO:
    //  1. Generate a 6-digit code
    //  2. Save Otp doc (expiresAt = now + 5min)
    //  3. Send via src/config/email.js (email) — SMS provider not wired yet
    res.status(501).json({ message: 'Not implemented yet — sendOtp' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/verify-otp   body: { target, code, purpose }
exports.verifyOtp = async (req, res) => {
  try {
    // TODO: find matching un-expired, unverified Otp doc, mark verified
    res.status(501).json({ message: 'Not implemented yet — verifyOtp' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
