import { createContext, useContext, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNotes } from './NotesContext';
import { useNavigation } from '../navigation';

/**
 * NoteActionsContext provides stable references to note action functions.
 * 
 * This context exists to solve a performance problem: when NoteCard components
 * consume the full NotesContext via useNotes(), they re-render whenever ANY
 * part of the context changes (including openedNote). Even though NoteCard
 * uses React.memo, the memo comparison only prevents re-renders from prop
 * changes, not from context changes.
 * 
 * By extracting the stable action functions into a separate context with a
 * memoized value, NoteCard can consume just the actions it needs without
 * being affected by frequent state changes like openedNote.
 * 
 * The functions in this context are already memoized with useCallback in
 * NotesContext, so they maintain stable references across renders.
 * 
 * NOTE: savingNotes and recentlyEditedNoteId are intentionally NOT included
 * here because they change frequently and would defeat the purpose of this
 * optimization. NoteCard components that need these should either:
 * 1. Accept them as props (which allows React.memo to work properly)
 * 2. Use a separate subscription pattern
 */
const NoteActionsContext = createContext(null);

export const useNoteActions = () => {
  const context = useContext(NoteActionsContext);
  if (!context) {
    throw new Error('useNoteActions must be used within a NoteActionsProvider (and NotesProvider must be initialized)');
  }
  return context;
};
 
export const NoteActionsProvider = ({ children }) => {
  // Get navigation functions - we'll wrap them to make them stable
  const navigation = useNavigation();
  const navigationRef = useRef(navigation);

  // Keep navigation ref updated
  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  // Stable wrappers for navigation functions - using refs to avoid dependency on navigation context
  const openNote = useCallback((noteId, context, options) => {
    return navigationRef.current.openNote(noteId, context, options);
  }, []);

  const openReferencedNote = useCallback((noteId, scrollPosition, options) => {
    return navigationRef.current.openReferencedNote(noteId, scrollPosition, options);
  }, []);

  const navigateToSearch = useCallback((query, options) => {
    return navigationRef.current.navigateToSearch(query, options);
  }, []);

  const clearSearch = useCallback(() => {
    return navigationRef.current.clearSearch();
  }, []);

  // Destructure directly from NotesContext - these functions are stable (memoized with useCallback)
  const {
    // Note action functions - these are stable (memoized with useCallback)
    togglePin,
    archiveNote,
    unarchiveNote,
    trashNote,
    restoreNote,
    deleteNote,
    changeNoteColor,
    updateNote,
    openNoteById,

    // Search functions - stable
    searchByTag,
    searchByColor,
    searchByBook,
    searchById,

    // State that NoteCard needs and changes infrequently
    view,
    searchMode,
  } = useNotes();

  // Memoize the context value to prevent unnecessary re-renders
  // IMPORTANT: Only include stable function references and infrequently-changing state
  // Do NOT include savingNotes or recentlyEditedNoteId - they change too often
  // Do NOT include the notesContext object itself - that would cause rerenders whenever openedNote changes
  // Do NOT include the navigation object itself - use stable wrappers instead
  const value = useMemo(() => {
    return {
      // Actions
      togglePin,
      archiveNote,
      unarchiveNote,
      trashNote,
      restoreNote,
      deleteNote,
      changeNoteColor,
      updateNote,
      openNoteById,
      openNote, // NEW: Stable wrapper for new navigation system
      openReferencedNote, // NEW: Stable wrapper for new navigation system

      // Search (old functions from NotesContext - still work)
      searchByTag,
      searchByColor,
      searchByBook,
      searchById,

      // Search (new navigation system functions)
      navigateToSearch, // NEW: Stable wrapper for new navigation system
      clearSearch, // NEW: Stable wrapper for new navigation system

      // State (only infrequently changing)
      view,
      searchMode,
    };
  }, [
    // Functions - these should be stable references (all have empty dependency arrays)
    togglePin,
    archiveNote,
    unarchiveNote,
    trashNote,
    restoreNote,
    deleteNote,
    changeNoteColor,
    updateNote,
    openNoteById,
    openNote,
    openReferencedNote,
    searchByTag,
    searchByColor,
    searchByBook,
    searchById,
    navigateToSearch,
    clearSearch,
    // State values (only infrequently changing)
    view,
    searchMode,
  ]);

  return (
    <NoteActionsContext.Provider value={value}>
      {children}
    </NoteActionsContext.Provider>
  );
};

export default NoteActionsContext;
