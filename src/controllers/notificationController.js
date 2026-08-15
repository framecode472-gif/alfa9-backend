const Notification = require('../models/Notification');
const { sendEmail } = require('../config/email');

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

    // ===== EMAIL ALERT TO ADMIN'S INBOX =====
    // The in-app bell only works while the admin panel is actually open.
    // Sending an email on every admin notification (deposit, withdraw,
    // chat, etc.) means the admin gets pinged like a normal phone
    // notification even when the panel is closed or the phone is locked.
    // Set ADMIN_NOTIFY_EMAIL in the backend's environment variables
    // (Railway → Variables) to the email you actually want these sent to.
    // If it's not set, this silently does nothing — nothing breaks.
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
    if (adminEmail) {
      sendEmail({
        to: adminEmail,
        subject: `Alfa9 Admin Alert: ${title || type}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #D4AF37;">${title || 'New Admin Notification'}</h2>
            <p>${message}</p>
            <p style="color: #999; font-size: 12px;">Sent automatically by Alfa9 — open the admin panel to take action.</p>
          </div>
        `
      }).catch((err) => console.error('Admin alert email failed:', err.message));
    }

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