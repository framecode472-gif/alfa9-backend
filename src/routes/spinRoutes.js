const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const spinController = require('../controllers/spinController');

router.get('/status', auth, spinController.getSpinStatus);
router.post('/play', auth, spinController.playSpin);
router.get('/history', auth, spinController.getSpinHistory);

module.exports = router;
