import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';

// Simple debounce utility function
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

const StarredNotesContext = createContext();

const STARRED_NOTES_STORAGE_KEY = 'starredNotes';
const SCROLL_POSITIONS_STORAGE_KEY = 'noteScrollPositions';

export const StarredNotesProvider = ({ children }) => {
  const [starredNoteIds, setStarredNoteIds] = useState(() => {
    try {
      const stored = localStorage.getItem(STARRED_NOTES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error loading starred notes from localStorage:", error);
      return [];
    }
  });

  // Use ref for storing scroll positions to avoid re-renders
  const noteScrollPositionsRef = useRef();
  
  // Initialize scroll positions from localStorage
  if (!noteScrollPositionsRef.current) {
    try {
      const stored = localStorage.getItem(SCROLL_POSITIONS_STORAGE_KEY);
      noteScrollPositionsRef.current = stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error("Error loading scroll positions from localStorage:", error);
      noteScrollPositionsRef.current = {};
    }
  }

  // Debounced save to localStorage for scroll positions
  const saveScrollPositionsToStorage = useCallback(
    debounce((positions) => {
      try {
        localStorage.setItem(SCROLL_POSITIONS_STORAGE_KEY, JSON.stringify(positions));
      } catch (error) {
        console.error("Error saving scroll positions to localStorage:", error);
      }
    }, 1000),
    []
  );

  // Save to localStorage whenever starredNoteIds changes
  useEffect(() => {
    try {
      localStorage.setItem(STARRED_NOTES_STORAGE_KEY, JSON.stringify(starredNoteIds));
    } catch (error) {
      console.error("Error saving starred notes to localStorage:", error);
    }
  }, [starredNoteIds]);

  const addStar = useCallback((noteId) => {
    if (!noteId) return;
    setStarredNoteIds((prevIds) => {
      if (prevIds.includes(noteId)) {
        return prevIds; // Already starred
      }
      return [...prevIds, noteId];
    });
  }, []);

  const removeStar = useCallback((noteId) => {
    if (!noteId) return;
    setStarredNoteIds((prevIds) => prevIds.filter(id => id !== noteId));
  }, []);

  const toggleStar = useCallback((noteId) => {
    if (!noteId) return;
    setStarredNoteIds((prevIds) => {
      if (prevIds.includes(noteId)) {
        return prevIds.filter(id => id !== noteId); // Remove if exists
      } else {
        return [...prevIds, noteId]; // Add if doesn't exist
      }
    });
  }, []);

  const isStarred = useCallback((noteId) => {
    return starredNoteIds.includes(noteId);
  }, [starredNoteIds]);

  // Set scroll position for a note (as a ratio 0-1)
  const setNoteScrollPosition = useCallback((noteId, scrollRatio) => {
    if (!noteId || typeof scrollRatio !== 'number') return;
    
    console.log(`[StarredNotesContext] Setting scroll position for ${noteId}: ${scrollRatio}`);
    
    // Update the ref directly (no state update = no re-render)
    noteScrollPositionsRef.current = {
      ...noteScrollPositionsRef.current,
      [noteId]: Math.max(0, Math.min(1, scrollRatio)) // Clamp between 0 and 1
    };
    
    // Save to localStorage with debouncing
    saveScrollPositionsToStorage(noteScrollPositionsRef.current);
  }, [saveScrollPositionsToStorage]);

  // Get scroll position for a note (returns ratio 0-1, defaults to 0)
  const getNoteScrollPosition = useCallback((noteId) => {
    if (!noteId) return 0;
    const position = noteScrollPositionsRef.current[noteId] || 0;
    return position;
  }, []);

  // Clear scroll position for a note
  const clearNoteScrollPosition = useCallback((noteId) => {
    if (!noteId) return;
    
    const { [noteId]: _, ...rest } = noteScrollPositionsRef.current;
    noteScrollPositionsRef.current = rest;
    
    // Save to localStorage with debouncing
    saveScrollPositionsToStorage(noteScrollPositionsRef.current);
  }, [saveScrollPositionsToStorage]);

  // Reset scroll position for a note to 0 (useful when opening a note normally, not from tab)
  const resetNoteScrollPosition = useCallback((noteId) => {
    if (!noteId) return;
    
    console.log(`[StarredNotesContext] Resetting scroll position for note ${noteId} to 0`);
    
    // Update the ref directly (no state update = no re-render)
    noteScrollPositionsRef.current = {
      ...noteScrollPositionsRef.current,
      [noteId]: 0
    };
    
    // Save to localStorage with debouncing
    saveScrollPositionsToStorage(noteScrollPositionsRef.current);
  }, [saveScrollPositionsToStorage]);

  // Clean up scroll positions for notes that are no longer relevant
  useEffect(() => {
    const starredSet = new Set(starredNoteIds);
    const scrollPositionNoteIds = Object.keys(noteScrollPositionsRef.current);
    
    // Only clean up if we have a lot of scroll positions to avoid too frequent cleanup
    if (scrollPositionNoteIds.length > 10) {
      // Keep scroll positions for:
      // 1. All starred notes
      // 2. Up to 3 most recently used non-starred notes (for recent tab usage)
      const nonStarredNotes = scrollPositionNoteIds.filter(noteId => !starredSet.has(noteId));
      
      if (nonStarredNotes.length > 3) {
        console.log(`[StarredNotesContext] Cleaning up scroll positions. Total: ${scrollPositionNoteIds.length}, Non-starred: ${nonStarredNotes.length}`);
        
        // Update the ref directly
        const updated = { ...noteScrollPositionsRef.current };
        // Remove the oldest non-starred scroll positions, keeping the 3 most recent
        const toRemove = nonStarredNotes.slice(0, -3);
        toRemove.forEach(noteId => {
          console.log(`[StarredNotesContext] Removing scroll position for non-starred note: ${noteId}`);
          delete updated[noteId];
        });
        noteScrollPositionsRef.current = updated;
        
        // Save to localStorage with debouncing
        saveScrollPositionsToStorage(noteScrollPositionsRef.current);
      }
    }
  }, [starredNoteIds, saveScrollPositionsToStorage]);

  const value = {
    starredNoteIds,
    addStar,
    removeStar,
    toggleStar,
    isStarred,
    setNoteScrollPosition,
    getNoteScrollPosition,
    clearNoteScrollPosition,
    resetNoteScrollPosition,
  };

  return (
    <StarredNotesContext.Provider value={value}>
      {children}
    </StarredNotesContext.Provider>
  );
};

export const useStarredNotes = () => {
  const context = useContext(StarredNotesContext);
  if (context === undefined) {
    throw new Error('useStarredNotes must be used within a StarredNotesProvider');
  }
  return context;
};
