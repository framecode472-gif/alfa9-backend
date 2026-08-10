const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const promotionController = require('../controllers/promotionController');

router.get('/summary', auth, promotionController.getPromotionSummary);           // Promotion.jsx main page
router.get('/subordinate-data', auth, promotionController.getSubordinateData);   // SubordinateData.jsx
router.get('/new-subordinates', auth, promotionController.getNewSubordinates);   // NewSubordinates.jsx
router.get('/commission-detail', auth, promotionController.getCommissionDetail); // CommissionDetail.jsx
router.get('/partner-rewards-summary', auth, promotionController.getPartnerRewardsSummary); // PartnerRewards.jsx
router.get('/invitation-record', auth, promotionController.getInvitationRecord); // PartnerRewards.jsx "Invitation record" link

module.exports = router;