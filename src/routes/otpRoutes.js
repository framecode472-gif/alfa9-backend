const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const otpController = require('../controllers/otpController');

// NOTE: Settings.jsx calls these at the TOP level (/api/send-otp, /api/verify-otp),
// not nested under a resource — so this file is mounted directly at /api in server.js.
router.post('/send-otp', auth, otpController.sendOtp);
router.post('/verify-otp', auth, otpController.verifyOtp);

module.exports = router;
