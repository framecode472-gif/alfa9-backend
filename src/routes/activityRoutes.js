const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const activityController = require('../controllers/activityController');

// Main Activity page
router.get('/summary', auth, activityController.getActivitySummary);

// Activity Award (6 daily missions)
router.get('/mission-award/status', auth, activityController.getMissionAwardStatus);
router.post('/mission-award/claim', auth, activityController.claimMissionAward);
router.get('/mission-award/history', auth, activityController.getMissionAwardHistory);

// Attendance Bonus
router.get('/attendance/status', auth, activityController.getAttendanceStatus);
router.post('/attendance/claim', auth, activityController.claimAttendance);

// Betting Rebate
router.get('/betting-rebate/status', auth, activityController.getBettingRebateStatus);
router.post('/betting-rebate/collect', auth, activityController.collectBettingRebate);
router.get('/betting-rebate/history', auth, activityController.getBettingRebateHistory);

// Super Jackpot
router.get('/super-jackpot/my', auth, activityController.getMyJackpots);
router.post('/super-jackpot/claim/:id', auth, activityController.claimJackpot);

// Invitation Bonus (45 milestones)
router.get('/invitation-bonus/status', auth, activityController.getInvitationBonusStatus);
router.post('/invitation-bonus/claim', auth, activityController.claimInvitationBonus);

// Bonus Details (unified ledger)
router.get('/bonus-details', auth, activityController.getBonusDetails);

module.exports = router;
