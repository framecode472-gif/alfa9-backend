// ===== WHY RESEND INSTEAD OF GMAIL SMTP =====
// Railway (like most cloud hosts) blocks outbound SMTP connections by
// default — that's exactly what caused the "Connection timeout" /
// ETIMEDOUT error when we tried talking to Gmail's SMTP server directly.
// Resend sends email over a normal HTTPS API call instead of raw SMTP, so
// it isn't blocked. Sign up free at resend.com, grab an API key, and set
// RESEND_API_KEY in Railway's Variables tab — no domain verification
// needed since we send from Resend's shared "onboarding@resend.dev"
// address, which is fine for admin alerts to your own inbox.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM || 'Alfa9 Support <onboarding@resend.dev>';

// Send email function
exports.sendEmail = async ({ to, subject, html }) => {
  if (!RESEND_API_KEY) {
    console.error('Email error: RESEND_API_KEY is not set in environment variables — email not sent.');
    return { success: false, error: 'RESEND_API_KEY not set' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Email error:', data);
      return { success: false, error: data };
    }

    console.log('Email sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
};

// Password reset email template
exports.sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #D4AF37;">Alfa9 - Password Reset</h2>
      <p>You requested a password reset. Click the button below to reset your password:</p>
      <a href="${resetLink}" style="display: inline-block; background: #D4AF37; color: #000; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
      <p style="margin-top: 20px; color: #666;">Or copy this link: ${resetLink}</p>
      <p style="color: #999; font-size: 12px;">This link expires in 1 hour.</p>
    </div>
  `;

  return await exports.sendEmail({
    to: email,
    subject: 'Alfa9 - Password Reset Request',
    html
  });
};