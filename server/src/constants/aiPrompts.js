// AI Prompts Utility
// Core prompts are now stored in the database (settings table)
// This file only provides utility functions

/**
 * Combines core prompt with user's custom additions
 * @param {string} corePrompt - The core prompt that ensures functionality
 * @param {string} customAdditions - User's custom requirements (optional)
 * @returns {string} Combined prompt
 */
function combinePrompts(corePrompt, customAdditions) {
  if (!customAdditions || customAdditions.trim() === '') {
    return corePrompt;
  }

  return `${corePrompt}

ADDITIONAL USER REQUIREMENTS:
${customAdditions.trim()}`;
}

module.exports = {
  combinePrompts
};
