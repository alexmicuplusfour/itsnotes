// src/hooks/useNoteSaver.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { getCleanContent } from '../services/imageUtils';

/**
 * Custom hook for managing note saving logic
 * 
 * @param {Object} initialNote - The initial note object
 * @param {string} currentTitle - Current title state
 * @param {string} currentContent - Current content state
 * @param {string} currentColor - Current color state
 * @param {Array} currentImages - Current images array
 * @param {Array} unsavedImageIds - Array of unsaved image IDs
 * @param {Object} options - Configuration options and callbacks
 * @returns {Object} Hook state and functions
 */
export function useNoteSaver(
  initialNote,
  currentTitle,
  currentContent,
  currentColor,
  currentImages,
  unsavedImageIds,
  options = {}
) {
  const {
    // Callbacks
    onSaveStart,
    onSaveSuccess,
    onSaveError,
    onDeleteSuccess,
    // Context functions
    createNote,
    updateNote,
    deleteNote,
    // Image manager functions
    uploadTemporaryImages,
    clearUnsavedIds,
    resetImageState,
    // Auto-save interval (default to 2000ms)
    autoSaveInterval = 2000,
  } = options;

  // Internal state - now managed entirely by the hook
  const [isModified, setIsModified] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState(Date.now());
  const autoSaveTimerRef = useRef(null);
  /**
   * Marks the note as modified
   */
  const markAsModified = useCallback(() => {
    // console.log('[useNoteSaver] Note marked as modified');
    setIsModified(true);
    setLastSaveTime(Date.now()); // Reset save timer when marking as modified
  }, []);

  /**
   * Determines if a save operation is needed
   */
  const _shouldSave = useCallback((noteData, isForced = false) => {
    const isTextEmpty = 
      (noteData.title || '').trim() === '' && 
      getCleanContent(noteData.content || '') === '';
    const hasImages = (noteData.images || []).length > 0;

    // Check for empty note
    if (isTextEmpty && !hasImages) {
      // Only delete empty notes on forced saves (like manual close)
      // Don't delete during auto-save to prevent accidental deletion while editing
      if (isForced && noteData.id) {
        console.log('[useNoteSaver] Empty existing note will be deleted on forced save:', noteData.id);
        return { shouldSave: true, action: 'delete' };
      }
      // For auto-save or new notes, don't save empty notes
      console.log('[useNoteSaver] Skipping save for empty note (auto-save or new note)');
      return { shouldSave: false, action: 'none' };
    }    // Check for modifications (if not forced)
    if (!isForced && initialNote) {
      const titleChanged = noteData.title !== initialNote.title;
      const contentChanged = noteData.content !== initialNote.content;
      const colorChanged = noteData.color !== initialNote.color;
      
      // Check for image changes
      const initialImages = initialNote.images || [];
      const currentImagesArray = noteData.images || [];
      const imagesChanged = initialImages.length !== currentImagesArray.length ||
        initialImages.some((img, index) => img.id !== currentImagesArray[index]?.id);
      
      if (!titleChanged && !contentChanged && !colorChanged && !imagesChanged) {
        return { shouldSave: false, action: 'none' };
      }
    }

    // Determine if it's create or update
    const action = noteData.id ? 'update' : 'create';
    return { shouldSave: true, action };
  }, [initialNote]);

  /**
   * Main save function
   */
  const _performSave = useCallback(async (noteData, isForced = false) => {
    console.log('[useNoteSaver] _performSave called', { noteData, isForced });

    // Check if we should save
    const { shouldSave, action } = _shouldSave(noteData, isForced);
    
    if (!shouldSave) {
      console.log('[useNoteSaver] No save needed');
      
      // Reset modification state since content matches original
      // This prevents auto-save timer from getting stuck in a loop
      if (isModified) {
        console.log('[useNoteSaver] Resetting isModified flag since no save needed');
        setIsModified(false);
      }
      
      return { success: true, action: 'none' };
    }

    // Prevent concurrent saves
    if (isAutoSaving) {
      console.log('[useNoteSaver] Save already in progress, skipping');
      return { success: false, error: 'Save already in progress' };
    }    try {
      // Set saving state
      setIsAutoSaving(true);
      if (onSaveStart) onSaveStart();

      let result = null;

      if (action === 'delete') {
        // Handle empty note deletion - only happens on forced saves now
        console.log('[useNoteSaver] Deleting empty existing note on forced save:', noteData.id);
        
        await deleteNote(noteData.id, true); // suppressToast=true for empty note cleanup
        if (resetImageState) resetImageState();
        if (onDeleteSuccess) onDeleteSuccess();
        
        // Reset modification state
        setIsModified(false);
        
        result = { success: true, action: 'delete' };
      } else if (action === 'create') {
        // Create new note
        console.log('[useNoteSaver] Creating new note');
        
        const response = await createNote({
          title: noteData.title,
          content: noteData.content,
          color: noteData.color,
        });

        if (response?.note?.id) {
          const newNoteId = response.note.id;
          console.log(`[useNoteSaver] New note created with ID: ${newNoteId}`);
          
          // Upload temporary images
          if (uploadTemporaryImages) {
            await uploadTemporaryImages(newNoteId);
          }
          
          result = { success: true, action: 'create', note: response.note };
        } else {
          throw new Error('Failed to get new note ID after creation');
        }
      } else if (action === 'update') {
        // Update existing note
        console.log('[useNoteSaver] Updating existing note:', noteData.id);
        
        const response = await updateNote(noteData.id, {
          title: noteData.title,
          content: noteData.content,
          color: noteData.color,
        });
        
        result = { success: true, action: 'update', note: response };
      }

      // Handle successful save
      if (result?.success && result.action !== 'none') {
        // Clear unsaved IDs
        if (clearUnsavedIds) clearUnsavedIds();
        
        // Update save time
        setLastSaveTime(Date.now());
        
        // Reset modification state
        setIsModified(false);
        
        // Call success callback
        if (onSaveSuccess) onSaveSuccess(result.note);
      }

      return result;

    } catch (error) {
      console.error('[useNoteSaver] Save failed:', error);
      
      // Handle "payload too large" error
      if (error.message && (
        error.message.includes('payload too large') || 
        error.message.includes('request entity too large')
      )) {
        console.warn('[useNoteSaver] Payload too large, attempting to remove unsaved images');
        
        // TODO: Implement image removal logic if needed
        // This could be moved to the component level or handled via callback
      }
      
      // Call error callback
      if (onSaveError) onSaveError(error);
        return { success: false, error: error.message };
    } finally {
      setIsAutoSaving(false);
    }
  }, [
    _shouldSave,
    isAutoSaving,
    onSaveStart,
    onSaveSuccess,
    onSaveError,
    onDeleteSuccess,
    createNote,
    updateNote,
    deleteNote,
    uploadTemporaryImages,
    clearUnsavedIds,
    resetImageState,
  ]);

  /**
   * Public save function
   */
  const saveNote = useCallback(async (options = {}) => {
    const { forceSave = false, ...overrides } = options;
    
    const noteData = {
      id: initialNote?.id,
      title: currentTitle,
      content: currentContent,
      color: currentColor,
      images: currentImages,
      ...overrides
    };
    
    return await _performSave(noteData, forceSave);
  }, [_performSave, initialNote?.id, currentTitle, currentContent, currentColor, currentImages]);

  /**
   * Auto-save trigger function
   */
  const triggerAutoSave = useCallback(async () => {
    console.log('[useNoteSaver] Auto-save triggered');
    return await saveNote({ forceSave: false });
  }, [saveNote]);
  // Auto-save timer effect
  useEffect(() => {
    if (!autoSaveInterval || autoSaveInterval <= 0) {
      return; // Auto-save disabled
    }

    // Set up auto-save timer
    // Check interval should be responsive - use half the auto-save interval or minimum 500ms
    const checkInterval = Math.max(Math.floor(autoSaveInterval / 2), 500);
    
    autoSaveTimerRef.current = setInterval(() => {
      const timeSinceLastSave = Date.now() - lastSaveTime;
      
      if (timeSinceLastSave >= autoSaveInterval && isModified && !isAutoSaving) {
        console.log('[useNoteSaver] Auto-save conditions met, triggering save');
        triggerAutoSave();
      }
    }, checkInterval);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [autoSaveInterval, lastSaveTime, isModified, isAutoSaving, triggerAutoSave]);

  // Initial note change effect - reset state when note changes
  useEffect(() => {
    if (initialNote?.id !== undefined) {
      console.log('[useNoteSaver] Note changed, resetting state');
      // Reset save time when note changes
      setLastSaveTime(Date.now());
      // Reset modification state
      setIsModified(false);
    }
  }, [initialNote?.id]);

  return {
    saveNote,
    isSaving: isAutoSaving,
    isModified,
    lastSaveTimestamp: lastSaveTime,
    markAsModified, // Function to mark the note as modified
  };
}
