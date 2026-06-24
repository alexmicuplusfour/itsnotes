const express = require('express');
const User = require('../models/User');
const { generateToken, authenticateToken } = require('../middleware/auth');
const demoReset = require('../services/demoReset');
const router = express.Router();

// Check authentication status and setup requirements
router.get('/status', async (req, res) => {
  const demoInfo = demoReset.isEnabled()
    ? { isDemoMode: true, nextResetAt: demoReset.getNextResetAt() }
    : { isDemoMode: false, nextResetAt: null };

  // Check JWT first — pure CPU, no DB round-trip for authenticated users
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const { JWT_SECRET } = require('../middleware/auth');
      const decoded = jwt.verify(token, JWT_SECRET);
      return res.json({
        authenticated: true,
        requiresSetup: false,
        user: { id: decoded.id, username: decoded.username },
        ...demoInfo
      });
    } catch {
      // Token invalid — fall through to check if setup is needed
    }
  }

  // No valid token — only now hit the DB to determine setup vs login state
  try {
    const hasUsers = await User.exists();
    if (!hasUsers) {
      return res.json({
        authenticated: false,
        requiresSetup: true,
        message: 'No users exist. Setup required.',
        ...demoInfo
      });
    }
    return res.json({
      authenticated: false,
      requiresSetup: false,
      message: 'Authentication required',
      ...demoInfo
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.status(500).json({ message: 'Failed to check authentication status' });
  }
});

// Initial setup route (only works if no users exist)
router.post('/setup', async (req, res) => {
  try {
    const hasUsers = await User.exists();
    
    if (hasUsers) {
      return res.status(400).json({ message: 'Setup already completed' });
    }
    
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }
    
    const user = await User.create(username, password);
    const token = generateToken(user);
    
    res.status(201).json({
      message: 'Setup completed successfully',
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error during setup:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ message: 'Username already exists' });
    } else {
      res.status(500).json({ message: 'Setup failed' });
    }
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    const user = await User.validatePassword(username, password);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    
    const token = generateToken(user);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// Logout route (client-side token removal, server just confirms)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logout successful' });
});

// Change password route
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }
    
    // Verify current password
    const user = await User.validatePassword(req.user.username, currentPassword);
    if (!user) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    const updatedUser = await User.updatePassword(req.user.username, newPassword);
    
    res.json({
      message: 'Password changed successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username
      }
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Mint a long-lived token for connecting AI clients to the MCP endpoint.
// Separate from session tokens so it can outlive a normal login without
// weakening session expiry. Treat the returned value like a password.
router.post('/mcp-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByUsername(req.user.username);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const token = generateToken(user, '3650d'); // ~10 years
    res.json({ token });
  } catch (error) {
    console.error('Error minting MCP token:', error);
    res.status(500).json({ message: 'Failed to mint MCP token' });
  }
});

// Mint a long-lived token for the browser extension ("itsnotes clipper").
// Same mechanism as the MCP token above — a separate endpoint only so the UI
// can label it distinctly. Like the MCP token, it can't be revoked individually
// without rotating JWT_SECRET (which invalidates all tokens). Treat like a password.
router.post('/extension-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByUsername(req.user.username);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const token = generateToken(user, '3650d'); // ~10 years
    res.json({ token });
  } catch (error) {
    console.error('Error minting extension token:', error);
    res.status(500).json({ message: 'Failed to mint extension token' });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByUsername(req.user.username);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ message: 'Failed to fetch user info' });
  }
});

module.exports = router;
