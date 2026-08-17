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

// Admin — review conversations, reply, mark seen
router.get('/admin/all', auth, admin, chatbotController.getAllChatLogs);
router.put('/admin/:sessionId/reply', auth, admin, chatbotController.adminReply);
router.put('/admin/:sessionId/seen', auth, admin, chatbotController.markChatSeen);

module.exports = router;