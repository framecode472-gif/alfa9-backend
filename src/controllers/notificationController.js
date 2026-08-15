const Notification = require('../models/Notification');
const { sendEmail } = require('../config/email');

/* ============================================================
   Real notification feed. Replaces the local/fake `notifications`
   state in both AdminPanel.jsx and Notification.jsx once wired.
   ============================================================ */

// ===== BRANDED ADMIN ALERT EMAIL TEMPLATE =====
// Matches the app's gold-on-black look. Built with a table layout and
// inline styles only (no external CSS/fonts) because that's what actually
// renders consistently across Gmail, Outlook, etc.
const ADMIN_PANEL_URL = `${(process.env.FRONTEND_URL || 'https://alfa9.vercel.app').replace(/\/$/, '')}/admin`;
const LOGO_URL = `${(process.env.FRONTEND_URL || 'https://alfa9.vercel.app').replace(/\/$/, '')}/image/ALFA_9_LOGO.png`;

const TYPE_BADGES = {
  deposit: { label: 'DEPOSIT', color: '#2ecc71' },
  withdraw: { label: 'WITHDRAW', color: '#e05252' },
  chat: { label: 'CHAT', color: '#4aa3ff' },
  flagged: { label: 'FLAGGED', color: '#e05252' }
};

function buildAdminAlertHtml(type, title, message) {
  const badge = TYPE_BADGES[type] || { label: (type || 'ALERT').toUpperCase(), color: '#D4AF37' };

  return `
  <div style="background:#0a0a0a; padding:32px 16px; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background:#141414; border:1px solid #2a2210; border-radius:14px; overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,#1a1a1a,#0a0a0a); padding:24px 28px; text-align:center; border-bottom:1px solid #2a2210;">
          <img src="${LOGO_URL}" alt="Alfa9" width="72" style="display:block; margin:0 auto 4px auto;" />
        </td>
      </tr>
      <tr>
        <td style="padding:28px 28px 8px 28px;">
          <span style="display:inline-block; background:${badge.color}22; color:${badge.color}; border:1px solid ${badge.color}55; font-size:11px; font-weight:bold; letter-spacing:0.6px; padding:4px 10px; border-radius:20px;">${badge.label}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 4px 28px;">
          <h1 style="margin:0; color:#D4AF37; font-size:20px; font-weight:700;">${title || 'New Admin Notification'}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 28px 26px 28px;">
          <p style="margin:0; color:#e8e0cf; font-size:15px; line-height:1.6;">${message}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 28px 28px;">
          <a href="${ADMIN_PANEL_URL}" style="display:block; text-align:center; background:#D4AF37; color:#140A03; text-decoration:none; font-weight:bold; font-size:14px; padding:13px 20px; border-radius:9px;">Open Admin Panel →</a>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 24px 28px; border-top:1px solid #2a2210;">
          <p style="margin:0; color:#8a8272; font-size:11px; line-height:1.5;">Sent automatically by Alfa9. This alert was generated because a new event needs your review.</p>
        </td>
      </tr>
    </table>
  </div>`;
}

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
        html: buildAdminAlertHtml(type, title, message)
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