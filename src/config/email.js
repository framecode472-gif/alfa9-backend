// ===== WHY BREVO INSTEAD OF RESEND'S SANDBOX ADDRESS =====
// Resend's shared "onboarding@resend.dev" address can ONLY send to the
// email the Resend account was signed up with — it hard-blocks sending to
// anyone else until a real domain is verified. That's fine for admin
// alerts (they go to your own inbox), but it silently can't deliver
// password-reset codes to actual users' Gmail addresses.
// Brevo's free plan lets you send to ANY recipient today, no domain
// needed — you just verify ONE sender email address (see setup below).
// When you buy a domain later, authenticating it in Brevo improves
// deliverability (less chance of landing in spam) but isn't required to
// get this working right now.
//
// SETUP (5 minutes):
// 1. Sign up free at brevo.com
// 2. Senders, Domains & Dedicated IPs → Senders → add your own email
//    (e.g. saifullahowner301@gmail.com) → click the verification link
//    Brevo emails to that inbox
// 3. SMTP & API → API Keys → Generate a new API key
// 4. Set these in Railway → Variables:
//    BREVO_API_KEY = the key from step 3
//    BREVO_SENDER_EMAIL = the exact email you verified in step 2

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Alfa9';

// Send email function
exports.sendEmail = async ({ to, subject, html }) => {
  if (!BREVO_API_KEY || !SENDER_EMAIL) {
    console.error('Email error: BREVO_API_KEY or BREVO_SENDER_EMAIL is not set in environment variables — email not sent.');
    return { success: false, error: 'BREVO_API_KEY or BREVO_SENDER_EMAIL not set' };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        sender: { email: SENDER_EMAIL, name: SENDER_NAME },
        to: [{ email: to }],
        subject,
        htmlContent: html
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Email error:', data);
      return { success: false, error: data };
    }

    console.log('Email sent:', data.messageId);
    return { success: true, messageId: data.messageId };
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