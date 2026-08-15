const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ✅ EXACT same secret jo authController mein hai
const JWT_SECRET = 'mySuperSecretKey123';

exports.auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Bearer hata ke sirf token le
    const token = authHeader.replace('Bearer ', '').trim();
    
    // Verify with SAME secret
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // ===== SINGLE-DEVICE SESSION CHECK =====
    // Only tokens issued by login/register carry a `sid` (admin tokens
    // don't, so admin logins are unaffected). If this token's sid no
    // longer matches the user's current sessionId, they logged in on
    // another device since this token was issued — reject with a specific
    // code so the frontend can force-logout back to the login screen.
    if (decoded.sid && user.sessionId && decoded.sid !== user.sessionId) {
      return res.status(401).json({
        message: 'You have been logged out because this account was signed in on another device.',
        code: 'SESSION_INVALIDATED'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Auth Error:', error.message);
    res.status(401).json({ message: 'Invalid token' });
  }
};