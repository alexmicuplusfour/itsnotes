// Keyboard shortcuts handler for bulk selection mode
import { useEffect, useCallback } from 'react';
import { useNoteSelection } from '../contexts/NoteSelectionContext';
import { useNotes } from '../contexts/NotesContext';

/**
 * Custom hook for handling keyboard shortcuts during bulk selection mode
 * Supports:
 * - Ctrl+A: Select all visible notes when bulk selection is active
 * - Escape: Deselect all notes and exit bulk selection mode
 */
export const useSelectionKeyboardShortcuts = () => {
  const { selectedNoteIds, clearSelection, toggleNoteSelection, trashSelectedNotes } = useNoteSelection();
  const { notes: contextNotes, searchMode, searchResults } = useNotes();

  // Get the currently visible notes (search results or main notes)
  const visibleNotes = searchMode ? searchResults : contextNotes;

  const handleSelectAll = useCallback(() => {
    if (!visibleNotes || visibleNotes.length === 0) return;
    
    console.log('Keyboard shortcut: Selecting all visible notes');
    // Select all visible notes
    visibleNotes.forEach(note => {
      if (!selectedNoteIds.has(note.id)) {
        toggleNoteSelection(note.id);
      }
    });
  }, [visibleNotes, selectedNoteIds, toggleNoteSelection]);

  const handleDeselectAll = useCallback(() => {
    console.log('Keyboard shortcut: Clearing selection and exiting bulk mode');
    clearSelection();
  }, [clearSelection]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    trashSelectedNotes();
  }, [selectedNoteIds.size, trashSelectedNotes]);

  const handleKeyDown = useCallback((event) => {
    // Only handle shortcuts when bulk selection mode is active
    if (selectedNoteIds.size === 0) return;

    // Check if user is typing in an input field or textarea
    const activeElement = document.activeElement;
    const isTyping = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.contentEditable === 'true' ||
      activeElement.isContentEditable
    );

    // Don't interfere with typing
    if (isTyping) return;

    switch (event.key) {
      case 'a':
      case 'A':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleSelectAll();
        }
        break;
      
      case 'Escape':
        event.preventDefault();
        handleDeselectAll();
        break;

      case 'Delete':
        event.preventDefault();
        handleDeleteSelected();
        break;

      default:
        break;
    }
  }, [selectedNoteIds.size, handleSelectAll, handleDeselectAll, handleDeleteSelected]);

  useEffect(() => {
    // Only add event listener when bulk selection is active
    if (selectedNoteIds.size > 0) {
      document.addEventListener('keydown', handleKeyDown);
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [selectedNoteIds.size, handleKeyDown]);

  // Return the handler functions in case components need direct access
  return {
    handleSelectAll,
    handleDeselectAll,
    handleDeleteSelected,
    isSelectionModeActive: selectedNoteIds.size > 0
  };
};

export default useSelectionKeyboardShortcuts;
