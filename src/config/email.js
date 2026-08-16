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

// Password reset email — sends the 4-digit code the user types into the
// OTP boxes on the frontend (not a clickable link).
exports.sendPasswordResetEmail = async (email, otp) => {
  const html = `
    <div style="background:#0a0a0a; padding:32px 16px; font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; margin:0 auto; background:#141414; border:1px solid #2a2210; border-radius:14px; overflow:hidden;">
        <tr>
          <td style="padding:28px 28px 8px 28px; text-align:center;">
            <h1 style="margin:0; color:#D4AF37; font-size:20px;">Alfa9 — Password Reset</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 28px 8px 28px; text-align:center;">
            <p style="margin:0; color:#e8e0cf; font-size:14px; line-height:1.6;">Use this code to reset your password. It expires in 15 minutes.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px; text-align:center;">
            <div style="display:inline-block; background:#1a1a1a; border:1px solid #D4AF37; border-radius:10px; padding:16px 32px; font-size:32px; font-weight:800; letter-spacing:10px; color:#D4AF37;">${otp}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 26px 28px; text-align:center;">
            <p style="margin:0; color:#8a8272; font-size:12px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
          </td>
        </tr>
      </table>
    </div>
  `;

  return await exports.sendEmail({
    to: email,
    subject: `Alfa9 password reset code: ${otp}`,
    html
  });
};