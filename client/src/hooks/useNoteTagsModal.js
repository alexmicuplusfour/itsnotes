import React, { useState, useRef, useCallback, useEffect } from "react";
import { tagsApi } from "../services/api";

// Simple cache to prevent duplicate tag API calls
const tagCache = new Map();
const CACHE_DURATION = 5000; // 5 seconds

// Clean up old cache entries to prevent memory leaks
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, value] of tagCache.entries()) {
    if (now - value.timestamp > CACHE_DURATION * 2) { // Clean entries older than 2x cache duration
      tagCache.delete(key);
    }
  }
};

// Clear cache for a specific note (call when tags are modified)
const clearTagCache = (noteId) => {
  if (noteId) {
    tagCache.delete(noteId);
    console.log(`[tagCache] Cleared cache for note ${noteId}`);
  }
};

// Deduplicated tag fetching function
const fetchNoteTags = async (noteId) => {
  const now = Date.now();
  const cacheKey = noteId;
  
  // Clean up old entries periodically
  if (Math.random() < 0.1) { // 10% chance to clean up on each call
    cleanupCache();
  }
  
  // Check if we have a recent cache entry
  if (tagCache.has(cacheKey)) {
    const { data, timestamp, promise } = tagCache.get(cacheKey);
    
    // If we have recent data, return it
    if (now - timestamp < CACHE_DURATION && data) {
      console.log(`[tagCache] Using cached tags for note ${noteId}`);
      return data;
    }
    
    // If there's an ongoing request, wait for it
    if (promise) {
      console.log(`[tagCache] Waiting for ongoing request for note ${noteId}`);
      return promise;
    }
  }
  
  // Make new request
  console.log(`[tagCache] Making new request for note ${noteId}`);
  const promise = tagsApi.getNoteTags(noteId);
  
  // Cache the promise immediately to prevent duplicate requests
  tagCache.set(cacheKey, { data: null, timestamp: now, promise });
  
  try {
    const response = await promise;
    // Cache the successful response
    tagCache.set(cacheKey, { data: response, timestamp: now, promise: null });
    return response;
  } catch (error) {
    // Remove failed request from cache
    tagCache.delete(cacheKey);
    throw error;
  }
};

/**
 * Custom hook to manage tags modal functionality
 * Extracts tags-related state, refs, handlers, and effects from NoteForm
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.note - The current note object
 * @param {Function} options.setNotes - Function to update notes in the context
 * @param {boolean} options.showColorPicker - Whether color picker is shown (for mutual exclusion)
 * @param {Function} options.setShowColorPicker - Function to control color picker visibility
 * @param {boolean} options.isMobile - Whether the device is mobile
 * @returns {Object} Tags modal state, handlers, and refs
 */
export const useNoteTagsModal = ({
  note,
  setNotes,
  showColorPicker,
  setShowColorPicker,
  isMobile
}) => {
  // --- State ---
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [noteTags, setNoteTags] = useState([]);

  // --- Refs ---
  const tagButtonRef = useRef(null);
  const tagPickerRef = useRef(null); // For the tag picker container itself
  const tagPickerOverlayRef = useRef(null); // For the tag picker overlay

  // --- Handlers ---
  const handleToggleTagsModal = useCallback(
    (e) => {
      if (e) e.preventDefault(); // Prevent default button behavior if needed
      const nextState = !showTagsModal;
      setShowTagsModal(nextState);
      // Only call setShowColorPicker if it's actually open
      if (nextState && showColorPicker) {
        setShowColorPicker(false);
      }
    },
    [showTagsModal, showColorPicker, setShowColorPicker],
  );

  // Handler for opening tags modal
  const handleTagsClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowTagsModal(true);
  }, []);  // Handler specifically to close the tags modal (e.g., from TagPicker's close)
  const handleCloseTagsModal = useCallback(async () => {
    // Manually refresh tags after closing the modal
    if (note?.id) {
      try {
        console.log("Refreshing tags after modal close for note", note.id);

        // Clear cache first since tags might have been modified
        clearTagCache(note.id);
        const response = await fetchNoteTags(note.id);

        // Batch ALL state updates in a single transition to minimize re-renders
        // Note: React import needs to be added to the consuming component for startTransition
        setShowTagsModal(false);
        setNoteTags(response.tags);
        
        // Force UI refresh if needed
        if (note && note.id && setNotes) {
          console.log(
            "[useNoteTagsModal] Force refresh for note tags in UI after modal close", 
            note.id,
          );
          setNotes((prevNotes) => {
            const index = prevNotes.findIndex((n) => n.id === note.id);
            if (index !== -1) {
              const newNotes = [...prevNotes];
              newNotes[index] = {
                ...newNotes[index],
                tagsUpdated: new Date().getTime(),
              };
              return newNotes;
            }
            return prevNotes;
          });
        }
      } catch (err) {
        console.error("Failed to refresh note tags after modal close:", err);
        // Still close the modal even if tag refresh fails
        setShowTagsModal(false);
      }
    } else {
      // If no note ID or temp note, just close the modal
      setShowTagsModal(false);
    }
  }, [note, setNotes, setNoteTags]);

  // Handler for closing tags modal (alternative approach)
  const handleTagsModalClose = useCallback(async () => {
    setShowTagsModal(false);    // Manually refresh tags after closing the modal
    if (note?.id) {
      try {
        console.log("Refreshing tags after modal close for note", note.id);

        // Clear cache first since tags might have been modified
        clearTagCache(note.id);
        const response = await fetchNoteTags(note.id);
        setNoteTags(response.tags);
      } catch (err) {
        console.error("Failed to refresh note tags after modal close:", err);
      }
    }

    // Force UI refresh in note list by setting tagsUpdated on the note
    if (note && note.id && setNotes) {
      console.log("[useNoteTagsModal] Force refresh for note tags in UI after modal close", note.id);
      setNotes((prevNotes) => {
        const index = prevNotes.findIndex((n) => n.id === note.id);
        if (index !== -1) {
          const newNotes = [...prevNotes];
          // This is the EXACT same pattern used for image updates
          newNotes[index] = {
            ...newNotes[index],
            tagsUpdated: new Date().getTime(),
          };
          return newNotes;
        }
        return prevNotes;
      });
    }
  }, [note, setNotes, setNoteTags]);

  // --- Effects ---
  // Fetch note tags when note ID changes with debouncing
  useEffect(() => {
    if (!note?.id) return;
    
    // Debounce to prevent rapid consecutive calls during component mounting cycles
    const timeoutId = setTimeout(() => {
      const fetchTags = async () => {
        try {
          console.log("Fetching tags for note", note.id);
          const response = await fetchNoteTags(note.id);
          setNoteTags(response.tags);

          // Set initial height immediately with expected extra space (desktop only)
          if (!isMobile) {
            requestAnimationFrame(() => {
              // Height adjustment is now handled by the useTextareaHeight hook's effect
              // This can be customized if needed
            });
          }
        } catch (err) {
          console.error("Failed to load note tags:", err);
        }
      };

      fetchTags();
    }, 50); // Small debounce delay

    return () => clearTimeout(timeoutId);
  }, [note?.id]); // Only re-fetch when note ID changes

  // Force refresh tags (useful when tags are modified externally)
  const refreshTags = useCallback(async () => {
    if (!note?.id) return;
    
    try {
      console.log("[useNoteTagsModal] Force refreshing tags for note", note.id);
      clearTagCache(note.id);
      const response = await fetchNoteTags(note.id);
      console.log("[useNoteTagsModal] Refreshed tags:", response.tags);
      setNoteTags(response.tags);
    } catch (err) {
      console.error("Failed to force refresh note tags:", err);
    }
  }, [note?.id]);

  return {
    // State
    showTagsModal,
    setShowTagsModal,
    noteTags,
    setNoteTags,
    
    // Refs
    tagButtonRef,
    tagPickerRef,
    tagPickerOverlayRef,
    
    // Handlers
    handleToggleTagsModal,
    handleTagsClick,
    handleCloseTagsModal,
    handleTagsModalClose,
    refreshTags // Export the refresh function
  };
};

export default useNoteTagsModal;

// Export clearTagCache so it can be used by other components (like NoteTagPicker)
export { clearTagCache };
