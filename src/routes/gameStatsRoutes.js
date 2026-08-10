const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const gameStatsController = require('../controllers/gameStatsController');

router.get('/my-stats', auth, gameStatsController.getMyGameStats);
router.get('/my-history', auth, gameStatsController.getMyGameHistory);

module.exports = router;
