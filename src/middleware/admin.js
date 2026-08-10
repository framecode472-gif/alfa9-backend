// Only the role-check middleware lives here.
// Token verification is handled by ../middleware/auth.js (auth) --
// that file is the single source of truth for the JWT secret.
// (A duplicate `auth` used to live here too, pointed at
// process.env.JWT_SECRET instead of the secret auth.js actually uses,
// and was never imported anywhere -- removed to avoid confusion.)

exports.admin = async (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};
