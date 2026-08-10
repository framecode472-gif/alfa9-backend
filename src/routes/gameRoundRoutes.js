const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const gameRoundController = require('../controllers/gameRoundController');

router.get('/current/:gameName', auth, gameRoundController.getCurrentRound);
router.post('/bet', auth, gameRoundController.placeBet);
router.get('/history/:gameName', auth, gameRoundController.getRoundHistory);
router.get('/my-bets/:gameName', auth, gameRoundController.getMyBetsForRound);
router.get('/bet-detail/:betId', auth, gameRoundController.getBetDetail);

module.exports = router;
