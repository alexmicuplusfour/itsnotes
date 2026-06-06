const demoReset = require('../services/demoReset');

const blockInDemo = (req, res, next) => {
  if (demoReset.isEnabled()) {
    return res.status(403).json({ message: 'This action is disabled in demo mode.' });
  }
  next();
};

module.exports = { blockInDemo };
