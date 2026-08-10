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

    req.user = user;
    next();

  } catch (error) {
    console.error('Auth Error:', error.message);
    res.status(401).json({ message: 'Invalid token' });
  }
};