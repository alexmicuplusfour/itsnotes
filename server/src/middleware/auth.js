const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Read JWT_SECRET lazily from process.env so the value set by ensureJwtSecret()
// during startup is always picked up — no insecure compile-time fallback.
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Server startup should have generated one.');
  }
  return secret;
};
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    } else {
      return res.status(500).json({ message: 'Token verification failed' });
    }
  }
};

// Cached once users exist — that state never reverses
let usersExist = false;

const optionalAuth = async (req, res, next) => {
  try {
    // Re-query only until the first user is created
    if (!usersExist) {
      usersExist = await User.exists();
    }

    if (!usersExist) {
      req.isSetupMode = true;
      return next();
    }

    return authenticateToken(req, res, next);
  } catch (error) {
    console.error('Error checking user existence:', error);
    return res.status(500).json({ message: 'Authentication check failed' });
  }
};

module.exports = {
  generateToken,
  authenticateToken,
  optionalAuth,
  getJwtSecret,
  get JWT_SECRET() {
    return getJwtSecret();
  }
};
