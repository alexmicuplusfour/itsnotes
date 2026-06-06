import { useEffect, useCallback } from 'react';

/**
 * Keyboard shortcuts utility
 * Manages global keyboard shortcuts for the application
 */

class KeyboardShortcuts {
  constructor() {
    this.shortcuts = new Map();
    this.isListening = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Register a keyboard shortcut
   * @param {string} key - The key combination (e.g., 'Escape', 'Ctrl+S', 'Meta+K')
   * @param {Function} callback - Function to call when shortcut is triggered
   * @param {Object} options - Additional options
   * @param {string} options.description - Description of what the shortcut does
   * @param {boolean} options.preventDefault - Whether to prevent default behavior (default: true)
   * @param {Function} options.condition - Optional condition function that must return true for shortcut to execute
   */
  register(key, callback, options = {}) {
    const {
      description = '',
      preventDefault = true,
      condition = null
    } = options;

    this.shortcuts.set(key.toLowerCase(), {
      callback,
      description,
      preventDefault,
      condition
    });

    // Start listening if this is the first shortcut
    if (!this.isListening) {
      this.startListening();
    }
  }

  /**
   * Unregister a keyboard shortcut
   * @param {string} key - The key combination to remove
   */
  unregister(key) {
    this.shortcuts.delete(key.toLowerCase());
    
    // Stop listening if no shortcuts remain
    if (this.shortcuts.size === 0 && this.isListening) {
      this.stopListening();
    }
  }

  /**
   * Start listening for keyboard events
   */
  startListening() {
    if (!this.isListening) {
      document.addEventListener('keydown', this.handleKeyDown, true);
      this.isListening = true;
    }
  }

  /**
   * Stop listening for keyboard events
   */
  stopListening() {
    if (this.isListening) {
      document.removeEventListener('keydown', this.handleKeyDown, true);
      this.isListening = false;
    }
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyDown(event) {
    // Don't trigger shortcuts when typing in input fields (unless specifically allowed)
    const isInputElement = event.target.matches('input, textarea, [contenteditable="true"]');
    
    // Build the key combination string
    const key = this.buildKeyString(event);
    const shortcut = this.shortcuts.get(key);

    if (shortcut) {
      // Check if there's a condition and if it passes
      if (shortcut.condition && !shortcut.condition(event)) {
        return;
      }

      // For certain shortcuts like Escape, we want them to work even in input fields
      const allowInInputs = ['escape'];
      if (isInputElement && !allowInInputs.includes(event.key.toLowerCase())) {
        return;
      }

      if (shortcut.preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }

      // Execute the callback
      try {
        shortcut.callback(event);
      } catch (error) {
        console.error('Error executing keyboard shortcut:', error);
      }
    }
  }

  /**
   * Build a key string from a keyboard event
   * @param {KeyboardEvent} event - The keyboard event
   * @returns {string} The key combination string
   */
  buildKeyString(event) {
    const parts = [];
    
    // Add modifiers in consistent order
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');
    
    // Add the main key
    const key = event.key.toLowerCase();
    
    // Handle special cases
    if (key === ' ') {
      parts.push('space');
    } else if (key === 'escape') {
      parts.push('escape');
    } else {
      parts.push(key);
    }
    
    return parts.join('+');
  }

  /**
   * Clear all registered shortcuts
   */
  clear() {
    this.shortcuts.clear();
    this.stopListening();
  }

  /**
   * Get all registered shortcuts (for debugging/help)
   */
  getShortcuts() {
    const shortcuts = {};
    for (const [key, shortcut] of this.shortcuts) {
      shortcuts[key] = {
        description: shortcut.description
      };
    }
    return shortcuts;
  }
}

// Create a global instance
const keyboardShortcuts = new KeyboardShortcuts();

export default keyboardShortcuts;

/**
 * Hook for using keyboard shortcuts in React components
 * @param {string} key - The key combination
 * @param {Function} callback - The callback function
 * @param {Object} options - Options for the shortcut
 * @param {Array} deps - Dependency array for the callback
 */
export function useKeyboardShortcut(key, callback, options = {}, deps = []) {
  const memoizedCallback = useCallback(callback, deps);

  useEffect(() => {
    keyboardShortcuts.register(key, memoizedCallback, options);

    return () => {
      keyboardShortcuts.unregister(key);
    };
  }, [key, memoizedCallback, options.description, options.preventDefault, options.condition]);
}
