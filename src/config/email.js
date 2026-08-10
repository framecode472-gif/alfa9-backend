const nodemailer = require('nodemailer');

// Create transporter (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,     // your-email@gmail.com
    pass: process.env.EMAIL_PASS      // app password
  }
});

// Send email function
exports.sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: '"Alfa9 Support" <support@alfa9.com>',
      to,
      subject,
      html
    });
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
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