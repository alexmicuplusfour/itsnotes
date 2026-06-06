const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT secret - in production, use a secure environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 days

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username 
    },
    JWT_SECRET,
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
    const decoded = jwt.verify(token, JWT_SECRET);
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
  JWT_SECRET
};
