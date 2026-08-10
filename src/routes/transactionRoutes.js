const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  getMyTransactions,
  getAllTransactions,
  getUserTransactions,
  getGameStats
} = require('../controllers/transactionController');

// User routes
router.get('/my-transactions', auth, getMyTransactions);

// Admin routes
router.get('/all', auth, admin, getAllTransactions);
router.get('/user/:userId', auth, admin, getUserTransactions);
router.get('/stats', auth, admin, getGameStats);

module.exports = router;