const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const spinController = require('../controllers/spinController');

router.get('/status', auth, spinController.getSpinStatus);
router.post('/play', auth, spinController.playSpin);
router.get('/history', auth, spinController.getSpinHistory);

router.get('/referral-status', auth, spinController.getReferralSpinStatus);
router.post('/referral-play', auth, spinController.playReferralSpin);

module.exports = router;