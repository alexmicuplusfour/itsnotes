// Production-aware logging utility
// Disables console logs in production environment

const isProduction = process.env.NODE_ENV === 'production';

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

// Create production logger
const logger = {
  log: isProduction ? () => {} : originalConsole.log,
  info: isProduction ? () => {} : originalConsole.info,
  warn: isProduction ? () => {} : originalConsole.warn,
  error: originalConsole.error, // Always keep errors in production
  debug: isProduction ? () => {} : originalConsole.debug,
  
  // Server-specific logging that should always work
  server: originalConsole.log, // For server startup messages
  
  // Force log a message regardless of environment
  force: originalConsole.log,
};

// Override global console in production
if (isProduction) {
  console.log = logger.log;
  console.info = logger.info;
  console.warn = logger.warn;
  console.debug = logger.debug;
  // Keep console.error as is for critical issues
}

module.exports = logger;
