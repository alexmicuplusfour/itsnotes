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
    // Auto-save interval (default to 2000ms)
    autoSaveInterval = 2000,
    // Optional: lazy getter for content. When provided, saves read the
    // latest editor HTML from this fn instead of the (possibly debounced)
    // currentContent value param.
    getCurrentContent,
  } = options;

  // Stash callbacks/context fns in a ref. NoteForm passes inline arrows,
  // so reading via deps would rebuild saveNote every render and churn the
  // auto-save timer.
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  // Internal state - now managed entirely by the hook
  const [isModified, setIsModified] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  // lastSaveTime lives in a ref — it's bumped on every modification (debounce)
  // and after each save. Keeping it as state would trigger a re-render and
  // tear down the auto-save interval on every keystroke.
  const lastSaveTimeRef = useRef(Date.now());
  // Mirror isModified so markAsModified can stay completely stable.
  const isModifiedRef = useRef(false);
  isModifiedRef.current = isModified;
  const autoSaveTimerRef = useRef(null);

  // Stash hot-path props in refs so saveNote's identity doesn't change
  // on every keystroke. Reading the latest values via refs at save-time
  // keeps the auto-save interval effect stable.
  const currentTitleRef = useRef(currentTitle);
  const currentContentRef = useRef(currentContent);
  const currentColorRef = useRef(currentColor);
  const currentImagesRef = useRef(currentImages);
  currentTitleRef.current = currentTitle;
  currentContentRef.current = currentContent;
  currentColorRef.current = currentColor;
  currentImagesRef.current = currentImages;
  /**
   * Marks the note as modified
   */
  const markAsModified = useCallback(() => {
    // Bumping the ref on every keystroke is free; setIsModified only fires
    // the first time per typing session, and the callback itself is stable.
    lastSaveTimeRef.current = Date.now();
    if (!isModifiedRef.current) setIsModified(true);
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

    // NoteForm always opens with an already-created note ID (the "+" button
    // and other entry points create the note via context.createNote first),
    // so useNoteSaver only handles updates. If id is missing, skip — callers
    // shouldn't be reaching us in that state.
    if (!noteData.id) {
      console.warn('[useNoteSaver] Skipping save: noteData.id missing — useNoteSaver does not create notes');
      return { shouldSave: false, action: 'none' };
    }
    return { shouldSave: true, action: 'update' };
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
      if (isModifiedRef.current) {
        console.log('[useNoteSaver] Resetting isModified flag since no save needed');
        setIsModified(false);
      }

      return { success: true, action: 'none' };
    }

    // Prevent concurrent saves
    if (isAutoSaving) {
      console.log('[useNoteSaver] Save already in progress, skipping');
      return { success: false, error: 'Save already in progress' };
    }
    const {
      onSaveStart,
      onSaveSuccess,
      onSaveError,
      onDeleteSuccess,
      updateNote,
      deleteNote,
      clearUnsavedIds,
      resetImageState,
    } = callbacksRef.current;
    try {
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
        lastSaveTimeRef.current = Date.now();

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
  }, [_shouldSave, isAutoSaving]);

  /**
   * Public save function
   */
  const saveNote = useCallback(async (options = {}) => {
    const { forceSave = false, ...overrides } = options;

    // Prefer the lazy getter (synced with the editor) over the possibly
    // debounced currentContent value.
    const getContent = callbacksRef.current?.getCurrentContent;
    const liveContent = typeof getContent === 'function'
      ? getContent()
      : currentContentRef.current;

    const noteData = {
      id: initialNote?.id,
      title: currentTitleRef.current,
      content: liveContent,
      color: currentColorRef.current,
      images: currentImagesRef.current,
      ...overrides
    };

    return await _performSave(noteData, forceSave);
  }, [_performSave, initialNote?.id]);

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
      const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;

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
  }, [autoSaveInterval, isModified, isAutoSaving, triggerAutoSave]);

  // Initial note change effect - reset state when note changes
  useEffect(() => {
    if (initialNote?.id !== undefined) {
      console.log('[useNoteSaver] Note changed, resetting state');
      // Reset save time when note changes
      lastSaveTimeRef.current = Date.now();
      // Reset modification state
      setIsModified(false);
    }
  }, [initialNote?.id]);

  return {
    saveNote,
    isSaving: isAutoSaving,
    isModified,
    // lastSaveTimestamp is read off the ref. Consumers can call it; if they
    // ever depend on it for re-render, they'd need to convert it back to state.
    lastSaveTimestamp: lastSaveTimeRef.current,
    markAsModified, // Function to mark the note as modified
  };
}
