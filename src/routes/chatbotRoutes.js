const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const upload = require('../middleware/upload');
const chatbotController = require('../controllers/chatbotController');

// Public — self-service widget works for guests and logged-in users alike
router.post('/message', chatbotController.sendMessage);
router.post('/upload', upload.single('image'), chatbotController.uploadAttachment);
router.get('/history/:sessionId', chatbotController.getHistory);

// Admin — review conversations
router.get('/admin/all', auth, admin, chatbotController.getAllChatLogs);

module.exports = router;