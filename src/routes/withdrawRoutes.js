const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  createWithdraw,
  getMyWithdraws,
  getPendingWithdraws,
  approveWithdraw,
  rejectWithdraw
} = require('../controllers/withdrawController');

// User routes
router.post('/create', auth, createWithdraw);
router.get('/my-withdraws', auth, getMyWithdraws);

// Admin routes
router.get('/pending', auth, admin, getPendingWithdraws);
router.put('/approve/:withdrawId', auth, admin, approveWithdraw);
router.put('/reject/:withdrawId', auth, admin, rejectWithdraw);

module.exports = router;