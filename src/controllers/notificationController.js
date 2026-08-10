const Notification = require('../models/Notification');

/* ============================================================
   Real notification feed. Replaces the local/fake `notifications`
   state in both AdminPanel.jsx and Notification.jsx once wired.
   ============================================================ */

// GET /api/notifications/my
exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user.id,
      audience: 'user'
    }).sort({ createdAt: -1 }).limit(100);

    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/notifications/admin
exports.getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ audience: 'admin' })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Marked as read', notification: notif });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Internal helpers (not HTTP routes) — call these from
 * depositController / withdrawController / adminController
 * wherever a real event happens, so both the admin bell and the
 * member's Notification.jsx page fill with real data.
 */
exports.notifyAdmin = async (io, type, message, title) => {
  try {
    const notif = await Notification.create({
      audience: 'admin',
      type,
      title,
      message
    });
    io?.emit('adminNotification', notif);
    return notif;
  } catch (error) {
    console.error('notifyAdmin error:', error.message);
  }
};

exports.notifyUser = async (io, userId, type, message, title) => {
  try {
    const notif = await Notification.create({
      userId,
      audience: 'user',
      type,
      title,
      message
    });
    io?.emit(`userNotification:${userId}`, notif);
    return notif;
  } catch (error) {
    console.error('notifyUser error:', error.message);
  }
};
