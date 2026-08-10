const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const vipController = require('../controllers/vipController');

router.get('/my-status', auth, vipController.getMyVipStatus);
router.get('/exp-history', auth, vipController.getExpHistory);
router.get('/tiers', vipController.getVipTiers); // public, no auth needed to view tiers
router.post('/claim-levelup', auth, vipController.claimLevelUpBonus);
router.post('/claim-monthly', auth, vipController.claimMonthlyBonus);
router.put('/tiers/:level', auth, admin, vipController.updateVipTier);

module.exports = router;
