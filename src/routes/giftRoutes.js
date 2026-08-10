const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const {
  createGift,
  getMyGifts,
  getAllGifts,
  redeemGiftCode
} = require('../controllers/giftController');

// User routes
router.get('/my-gifts', auth, getMyGifts);
router.post('/redeem', auth, redeemGiftCode);

// Admin routes
router.post('/create', auth, admin, createGift);
router.get('/all', auth, admin, getAllGifts);

module.exports = router;