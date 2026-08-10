const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const notificationController = require('../controllers/notificationController');

// Member-facing feed (Notification.jsx)
router.get('/my', auth, notificationController.getMyNotifications);

// Admin bell feed (AdminPanel.jsx) — real version of the currently-local state
router.get('/admin', auth, admin, notificationController.getAdminNotifications);

router.put('/:id/read', auth, notificationController.markRead);

module.exports = router;
