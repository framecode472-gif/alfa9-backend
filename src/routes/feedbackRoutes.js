const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const upload = require('../middleware/upload');
const feedbackController = require('../controllers/feedbackController');

// User routes
router.post('/submit', auth, upload.array('images', 3), feedbackController.submitFeedback);
router.get('/my-feedback', auth, feedbackController.getMyFeedback);

// Admin routes
router.get('/all', auth, admin, feedbackController.getAllFeedback);
router.put('/:id/reply', auth, admin, feedbackController.replyToFeedback);

module.exports = router;
