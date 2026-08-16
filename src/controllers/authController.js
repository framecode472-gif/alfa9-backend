const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const JWT_SECRET = 'mySuperSecretKey123';

// ===== NUMERIC INVITE CODE (casino-style) =====
// Generates a unique 9-digit numeric referral code, e.g. "856761184".
// Retries on the rare collision instead of trusting Math.random() alone.
const { generateUniqueUidForModel, generateUniqueReferralCodeForModel } = require('../utils/idGenerators');
async function generateUniqueReferralCode() { return generateUniqueReferralCodeForModel(User); }
async function generateUniqueUid() { return generateUniqueUidForModel(User); }

// ===== LOGIN =====
// Accepts `identifier` which can be either an email or a phone number
// (keeps `email` as a fallback key for any older/existing frontend code)
exports.login = async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginId = (identifier || email || '').trim();

    const user = await User.findOne({
      $or: [{ email: loginId }, { phone: loginId }]
    });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is blocked
    if (user.status === 'blocked') {
      return res.status(403).json({ message: 'Account is blocked' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ===== SINGLE-DEVICE SESSION =====
    // A fresh sessionId is generated on every login and saved on the user.
    // Any token issued before this moment (i.e. a session on another
    // browser/device) now carries a stale `sid` and will be rejected by
    // the auth middleware — that's what forces the older session to log out.
    const sessionId = crypto.randomBytes(16).toString('hex');
    user.sessionId = sessionId;
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role, sid: sessionId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        balance: user.balance,
        coins: user.coins,
        referralCode: user.referralCode,
        referralCount: user.referralCount
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const { sendPasswordResetEmail } = require('../config/email');

// ===== FORGOT PASSWORD (real 4-digit OTP, emailed) =====
// Accepts either an email or phone as `identifier` — but the code can only
// be emailed, so an account with no email on file can't use this flow yet.
exports.forgotPassword = async (req, res) => {
  try {
    const identifier = (req.body.identifier || req.body.email || '').trim();
    if (!identifier) {
      return res.status(400).json({ message: 'Enter your email or phone number' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    });

    // Deliberately vague message either way (account exists or not) so
    // this endpoint can't be used to check which emails/phones are
    // registered — a real security concern, same reason login errors
    // don't say "wrong password" vs "no such user".
    const genericResponse = { message: 'If an account exists, a verification code has been sent to its email.' };

    if (!user || !user.email) {
      return res.json(genericResponse);
    }

    // 4-digit numeric code, matches the OTP input boxes on the frontend.
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    user.resetOtp = otp;
    user.resetOtpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    const emailResult = await sendPasswordResetEmail(user.email, otp);
    if (!emailResult.success) {
      return res.status(500).json({ message: 'Failed to send email — please try again' });
    }

    res.json(genericResponse);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== RESET PASSWORD (verify OTP, then set new password) =====
exports.resetPassword = async (req, res) => {
  try {
    const identifier = (req.body.identifier || req.body.email || '').trim();
    const { otp, newPassword } = req.body;

    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({ message: 'Missing email, code, or new password' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    });

    if (!user || !user.resetOtp || !user.resetOtpExpires) {
      return res.status(400).json({ message: 'Invalid or expired code — request a new one' });
    }
    if (user.resetOtpExpires < new Date()) {
      user.resetOtp = null;
      user.resetOtpExpires = null;
      await user.save();
      return res.status(400).json({ message: 'Code expired — request a new one' });
    }
    if (String(otp).trim() !== user.resetOtp) {
      return res.status(400).json({ message: 'Incorrect code' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetOtp = null;
    user.resetOtpExpires = null;
    // Password just changed — sign out any device currently logged in.
    user.sessionId = null;
    await user.save();

    res.json({ message: 'Password reset successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== REGISTER (referral updated) =====
exports.register = async (req, res) => {
  try {
    // `identifier` can be an email OR a phone number — the frontend's
    // single "Account" field doesn't ask which. `name` is optional
    // since the register form doesn't collect one; we derive a
    // friendly default if it's missing.
    const { name, identifier, email, phone, password, referralCode } = req.body;

    const rawId = (identifier || email || phone || '').trim();
    if (!rawId) {
      return res.status(400).json({ message: 'Phone number or email is required' });
    }
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawId);

    const finalEmail = isEmail ? rawId : undefined;
    const finalPhone = isEmail ? phone : rawId;

    const existingUser = await User.findOne({
      $or: [{ email: rawId }, { phone: rawId }]
    });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this phone/email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    // Numeric invite code (casino-style), unique per user — matches the
    // frontend's numeric-code expectation instead of the old "REF..." format.
    const userReferralCode = await generateUniqueReferralCode();
    const userUid = await generateUniqueUid();
    const finalName = name || 'Player' + rawId.replace(/\D/g, '').slice(-4).padStart(4, '0');

    let referredBy = null;
    let uplineChain = [];
    let referrer = null;

    // Referral check (codes are now numeric, so no .toUpperCase() needed —
    // trimming still guards against stray whitespace from a pasted link)
    if (referralCode) {
      referrer = await User.findOne({ referralCode: String(referralCode).trim() });
      if (referrer) {
        referredBy = referrer._id;
        referrer.referralCount += 1;
        await referrer.save();

        // uplineChain[0] = direct referrer (L1), then the referrer's own
        // upline shifted down one level each, capped at 6 tiers total
        // (matches Promotion/SubordinateData's Tier 1..6 filter and
        // RebateRatio's 6-level table).
        uplineChain = [referrer._id, ...(referrer.uplineChain || [])].slice(0, 6);
      }
    }

    const user = new User({
      name: finalName,
      email: finalEmail,
      password: hashedPassword,
      phone: finalPhone,
      role: 'user',
      referralCode: userReferralCode,
      uid: userUid,
      referredBy,
      uplineChain
    });

    const sessionId = crypto.randomBytes(16).toString('hex');
    user.sessionId = sessionId;
    await user.save();

    // Create the referral record AFTER the user exists, so invitedUserId
    // (required in the Referral schema) is always a real id. Previously this
    // was created with invitedUserId: null BEFORE the user existed, which
    // failed schema validation and made the ENTIRE registration throw a 500 —
    // i.e. anyone signing up with a referral code couldn't create an account
    // at all. Status stays 'registered' here; deposit/bonus logic updates it
    // later (see depositController's partner-reward flow).
    if (referrer) {
      const Referral = require('../models/Referral');
      await Referral.create({
        referrerId: referrer._id,
        invitedUserId: user._id,
        invitedUserEmail: rawId,
        status: 'registered',
        bonusAmount: 500
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, sid: sessionId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      referralCode: userReferralCode,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        balance: user.balance,
        coins: user.coins,
        referralCode: user.referralCode,
        referralCount: user.referralCount
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};