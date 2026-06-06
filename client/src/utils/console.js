// Utility to handle console logs based on environment
// Will automatically disable all console output in production builds

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

// Create no-op function
const noop = () => {};

// Define whether console should be disabled
// Uses the __DISABLE_CONSOLE__ global set in the Vite config
const isConsoleDisabled = typeof __DISABLE_CONSOLE__ !== 'undefined' && __DISABLE_CONSOLE__;

// Replace console methods if disabled
if (isConsoleDisabled) {
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.debug = noop;
  // Keep error logging for critical issues
  // console.error = noop; 
}

// Export functions to enable/disable console logs manually
export const enableConsoleLogs = () => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
};

export const disableConsoleLogs = () => {
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.debug = noop;
  // Keep error logging for critical issues
  // console.error = noop;
};

// Simple debug function that only logs in development
export const debug = (...args) => {
  if (!isConsoleDisabled) {
    originalConsole.log('[DEBUG]', ...args);
  }
};