const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const boomController = require('../controllers/boomController');

router.get('/active', auth, boomController.getActiveRound);
router.get('/history', auth, boomController.getHistory);
router.post('/start', auth, boomController.startRound);
router.post('/:roundId/reveal', auth, boomController.revealTile);
router.post('/:roundId/cashout', auth, boomController.cashOut);
router.post('/:roundId/giveup', auth, boomController.giveUp);

module.exports = router;