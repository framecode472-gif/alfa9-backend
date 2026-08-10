const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const safeController = require('../controllers/safeController');

// Fund password (PIN that gates withdrawals)
router.post('/set-password', auth, safeController.setFundPassword);
router.post('/verify-password', auth, safeController.verifyFundPassword);

// Savings vault (Account/Safe page)
router.get('/status', auth, safeController.getSafeStatus);
router.post('/transfer-in', auth, safeController.transferIn);
router.post('/transfer-out', auth, safeController.transferOut);
router.get('/history', auth, safeController.getSafeHistory);

module.exports = router;
