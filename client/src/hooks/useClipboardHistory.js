import { useState, useCallback, useEffect, useRef } from 'react';

const MAX_HISTORY_ITEMS = 5;
const STORAGE_KEY = 'notekeeper_clipboard_history';

/**
 * Hook to manage clipboard history
 * Tracks up to 5 most recent text snippets copied within the app
 */
export function useClipboardHistory() {
  const [history, setHistory] = useState([]);
  const isInitializedRef = useRef(false);

  // Load history from localStorage on mount
  useEffect(() => {
    if (isInitializedRef.current) return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate the structure
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, MAX_HISTORY_ITEMS));
          console.log('[useClipboardHistory] Loaded history from localStorage:', parsed.length, 'items');
        }
      }
    } catch (error) {
      console.error('[useClipboardHistory] Error loading from localStorage:', error);
    }
    
    isInitializedRef.current = true;
  }, []);

  // Save to localStorage whenever history changes
  useEffect(() => {
    if (!isInitializedRef.current) return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
      console.log('[useClipboardHistory] Saved history to localStorage:', history.length, 'items');
    } catch (error) {
      console.error('[useClipboardHistory] Error saving to localStorage:', error);
    }
  }, [history]);

  /**
   * Add a new snippet to the clipboard history
   * @param {string} text - The text snippet to add
   */
  const addSnippet = useCallback((text) => {
    console.log('[useClipboardHistory] addSnippet called with text:', text?.substring(0, 50), 'length:', text?.length);
    
    if (!text || typeof text !== 'string') {
      console.warn('[useClipboardHistory] Invalid text provided to addSnippet');
      return;
    }

    // Trim and limit length for storage
    const trimmedText = text.trim();
    
    // Don't add empty strings
    if (!trimmedText) {
      console.log('[useClipboardHistory] Skipping empty text');
      return;
    }

    // Don't add if it's too short (likely accidental selection)
    if (trimmedText.length < 3) {
      console.log('[useClipboardHistory] Skipping text too short:', trimmedText.length, 'chars');
      return;
    }

    // Create new history item
    const newItem = {
      id: Date.now(), // Simple unique ID
      text: trimmedText,
      timestamp: Date.now(),
      isSticky: false
    };

    setHistory(prevHistory => {
      // Check if this exact text already exists
      const existingIndex = prevHistory.findIndex(item => item.text === trimmedText);
      
      if (existingIndex !== -1) {
        // Move existing item to the top and update timestamp
        const existingItem = prevHistory[existingIndex];
        const updatedItem = { ...existingItem, timestamp: Date.now() };
        const newHistory = [
          updatedItem,
          ...prevHistory.slice(0, existingIndex),
          ...prevHistory.slice(existingIndex + 1)
        ];
        console.log('[useClipboardHistory] Moved existing snippet to top');
        return newHistory;
      }

      // Add new item to the beginning
      const newHistoryWithItem = [newItem, ...prevHistory];
      
      // If we are within limits, just return
      if (newHistoryWithItem.length <= MAX_HISTORY_ITEMS) {
        console.log('[useClipboardHistory] Added new snippet. Total:', newHistoryWithItem.length);
        return newHistoryWithItem;
      }

      // We need to remove one item to stay within MAX_HISTORY_ITEMS.
      // We prioritize keeping sticky items.
      // Find the oldest non-sticky item (searching from the end)
      let indexToRemove = -1;
      for (let i = newHistoryWithItem.length - 1; i >= 0; i--) {
        if (!newHistoryWithItem[i].isSticky) {
          indexToRemove = i;
          break;
        }
      }

      if (indexToRemove !== -1) {
        // Remove the oldest non-sticky item
        const nextHistory = [...newHistoryWithItem];
        nextHistory.splice(indexToRemove, 1);
        console.log('[useClipboardHistory] Added new snippet and removed oldest non-sticky item.');
        return nextHistory;
      } else {
        // All items are sticky. We cannot add the new item (which is non-sticky).
        // So we return the previous history unchanged.
        console.log('[useClipboardHistory] Cannot add new snippet, history is full of sticky items');
        return prevHistory;
      }
    });
  }, []);

  /**
   * Toggle the sticky state of a clipboard item
   * @param {number} id - The ID of the item to toggle
   */
  const toggleSticky = useCallback((id) => {
    setHistory(prev => prev.map(item => 
      item.id === id ? { ...item, isSticky: !item.isSticky } : item
    ));
  }, []);

  /**
   * Remove a snippet from history by ID
   * @param {number} id - The ID of the snippet to remove
   */
  const removeSnippet = useCallback((id) => {
    setHistory(prevHistory => prevHistory.filter(item => item.id !== id));
  }, []);

  /**
   * Clear all clipboard history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    console.log('[useClipboardHistory] Cleared all history');
  }, []);

  /**
   * Get a specific snippet by index
   * @param {number} index - The index of the snippet
   * @returns {object|null} The snippet object or null
   */
  const getSnippet = useCallback((index) => {
    if (typeof index !== 'number' || index < 0 || index >= history.length) {
      return null;
    }
    return history[index];
  }, [history]);

  return {
    history,
    addSnippet,
    removeSnippet,
    clearHistory,
    getSnippet,
    toggleSticky,
    hasHistory: history.length > 0,
    historyCount: history.length
  };
}

export default useClipboardHistory;
