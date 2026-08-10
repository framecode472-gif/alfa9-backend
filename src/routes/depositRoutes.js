const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const upload = require('../middleware/upload');
const {
  createDeposit,
  getMyDeposits,
  getPendingDeposits,
  approveDeposit,
  rejectDeposit
} = require('../controllers/depositController');

// User routes
router.post('/create', auth, upload.single('screenshot'), createDeposit);
router.get('/my-deposits', auth, getMyDeposits);

// Admin routes
router.get('/pending', auth, admin, getPendingDeposits);
router.put('/approve/:depositId', auth, admin, approveDeposit);
router.put('/reject/:depositId', auth, admin, rejectDeposit);

module.exports = router;