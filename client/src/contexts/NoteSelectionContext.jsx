import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { saveAs } from 'file-saver';
import { notesApi, tagsApi } from '../services/api';
import { useTags } from './TagsContext';
import { useNotes } from './NotesContext';

// Module-level ref — lets NoteCard read selection mode synchronously without subscribing to context
export const selectionModeRef = { current: false };

// Create the context
const NoteSelectionContext = createContext(null);

// Hook to use the context
export const useNoteSelection = () => {
  const context = useContext(NoteSelectionContext);
  if (!context) {
    throw new Error('useNoteSelection must be used within a NoteSelectionProvider');
  }
  return context;
};

// Provider component
export const NoteSelectionProvider = ({ children }) => {
  const notesContext = useNotes();
  // Selection State
  const [selectedNoteIds, setSelectedNoteIds] = useState(new Set());
  const { hiddenTagIds } = useTags();
  
  // Get location for navigation changes
  const location = useLocation();

  // Reference for manual refresh blocking
  const manualRefreshInProgressRef = useRef(false);
  
  // Use ref for notesContext to avoid recreating callbacks when context changes
  const notesContextRef = useRef(notesContext);
  useEffect(() => {
    notesContextRef.current = notesContext;
  }, [notesContext]);

  // Keep selectionModeRef in sync (bulk actions call setSelectedNoteIds directly)
  useEffect(() => {
    selectionModeRef.current = selectedNoteIds.size > 0;
  }, [selectedNoteIds]);

  // Clear selection when navigation changes (pathname or search)
  useEffect(() => {
    if (selectedNoteIds.size > 0) {
      console.log("Navigation detected - clearing selection due to pathname/search change");
      setSelectedNoteIds(new Set());
    }
  }, [location.pathname, location.search]);

  // Clear selection when view changes in notesContext
  useEffect(() => {
    if (selectedNoteIds.size > 0 && notesContext.view) {
      console.log("View change detected - clearing selection");
      setSelectedNoteIds(new Set());
    }
  }, [notesContext.view]);

  // Clear selection when entering/exiting search mode
  useEffect(() => {
    if (selectedNoteIds.size > 0) {
      console.log("Search mode change detected - clearing selection");
      setSelectedNoteIds(new Set());
    }
  }, [notesContext.searchMode]);

  // Clear selection when selected notes are no longer present in the current visible list
  useEffect(() => {
    if (selectedNoteIds.size === 0) return; // No selection to check
    
    // Get the current visible notes list
    const currentNotes = notesContext.searchMode ? notesContext.searchResults : notesContext.notes;
    if (!currentNotes || currentNotes.length === 0) return; // No notes loaded yet
    
    // Check if any selected notes are missing from the current view
    // Logic matches NotesList.jsx to determine visibility
    const isNoteHidden = (note) => {
      if (notesContext.searchMode || notesContext.view === 'trash' || notesContext.view === 'archive' || !hiddenTagIds || hiddenTagIds.size === 0) return false;
      if (note.is_pinned) return false;
      if (!note.tags || !Array.isArray(note.tags) || note.tags.length === 0) return false;
      return note.tags.some(tag => hiddenTagIds.has(tag.id));
    };

    const currentNoteIds = new Set();
    const hiddenNoteIds = new Set();

    currentNotes.forEach(note => {
      if (!isNoteHidden(note)) {
        currentNoteIds.add(note.id);
      } else {
        hiddenNoteIds.add(note.id);
      }
    });

    const missingSelectedNotes = Array.from(selectedNoteIds).filter(id => !currentNoteIds.has(id));
    
    if (missingSelectedNotes.length > 0) {
      console.log(`Selected notes no longer in current view: ${missingSelectedNotes.join(', ')} - clearing selection`);
      setSelectedNoteIds(new Set());

      // Check if any of the missing notes were actually hidden by tags
      const hiddenCount = missingSelectedNotes.filter(id => hiddenNoteIds.has(id)).length;
      
      if (hiddenCount > 0) {
         notesContextRef.current.setOperationCount(hiddenCount);
         notesContextRef.current.setShowHiddenSuccess(true);
      }
    }
  }, [selectedNoteIds, notesContext.searchMode, notesContext.searchResults, notesContext.notes, hiddenTagIds, notesContext.view]);

  // --- Core Selection Functions ---

  const toggleNoteSelection = useCallback((noteId) => {
    setSelectedNoteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(noteId)) newSet.delete(noteId);
      else newSet.add(noteId);
      selectionModeRef.current = newSet.size > 0;
      console.log("Selection changed:", Array.from(newSet));
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    if (selectedNoteIds.size > 0) {
      console.log("Clearing selection");
      setSelectedNoteIds(new Set());
    }
  }, [selectedNoteIds]);

  // --- Bulk Action Handler ---

  const _executeBulkAction = useCallback(async (actionName, apiCall, optimisticUpdateFn) => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    console.log(`${actionName} ${ids.length} notes:`, ids);
    
    // Block socket events to prevent interference
    manualRefreshInProgressRef.current = true;

    // Optimistic UI update
    optimisticUpdateFn(ids);
    const originalSelection = new Set(selectedNoteIds);
    setSelectedNoteIds(new Set()); // Clear selection

    try {
      // Call the API
      await apiCall(ids);
      console.log(`Bulk action ${actionName} successful.`);
      
      // Refresh the current view with extended socket block
      // Use ref to access current notesContext without adding it as a dependency
      const ctx = notesContextRef.current;
      if (ctx.view === 'archive' || ctx.view === 'trash') {
        console.log(`Refreshing ${ctx.view} view after bulk ${actionName} operation`);
        await ctx.loadNotes(true, true);
      }
      
      // Keep socket block active for one second after completion
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log(`Released socket block after bulk ${actionName} operation`);
      }, 1000);
    } catch (error) {
      console.error(`Error bulk ${actionName} notes:`, error);
      notesContextRef.current.setError(`Failed to ${actionName} selected notes.`);
      setSelectedNoteIds(originalSelection);
      notesContextRef.current.loadNotes(true);
      // Make sure to release the socket block on error
      manualRefreshInProgressRef.current = false;
    }
  }, [selectedNoteIds]);

  // --- Bulk Actions ---
  const downloadSelectedNotes = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;

    try {
      console.log(`Downloading ${ids.length} notes...`);
      const blob = await notesApi.bulkDownloadNotes(ids);
      
      // Create a download link and trigger it
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
      saveAs(blob, `keep_notes_${date}_${time}.zip`);
      
      console.log('Download started successfully');
      clearSelection();
      
    } catch (error) {
      console.error("Failed to download notes:", error);
      notesContextRef.current.setError("Failed to download selected notes.");
    }
  }, [selectedNoteIds, clearSelection]);

  const archiveSelectedNotes = useCallback(() => {
    const ids = Array.from(selectedNoteIds);
    // Capture the notes + their positions before removal so undo can re-insert
    // them in place instead of triggering a full refresh.
    const ctx = notesContextRef.current;
    const sourceList = ctx.searchMode ? ctx.searchResults : ctx.notes;
    const archivedEntries = ids
      .map(id => {
        const index = sourceList.findIndex(n => n.id === id);
        return index === -1 ? null : { note: { ...sourceList[index], is_archived: false }, index };
      })
      .filter(Boolean);
    const updateFn = (ids) => {
      ids.forEach(id => notesContextRef.current._updateOrRemoveNoteInState(id));
      // In search mode archived notes stay in the results; keep the cards and
      // just flip their state in place so they show as archived.
      if (ctx.searchMode) {
        notesContextRef.current.setSearchResults(prev =>
          prev.map(n => ids.includes(n.id) ? { ...n, is_archived: true } : n)
        );
      }
    };
    _executeBulkAction('archive', notesApi.bulkArchiveNotes, updateFn).then(() => {
      // Show success toast after successful operation
      notesContextRef.current.setOperationCount(ids.length);
      notesContextRef.current.setLastArchivedNoteIds(ids);
      notesContextRef.current.captureArchivedNotesForUndo(archivedEntries);
      notesContextRef.current.setShowArchiveSuccess(true);
      // Refresh search count if in search mode
      if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
        notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
      }
    });
  }, [_executeBulkAction, selectedNoteIds]);
  const unarchiveSelectedNotes = useCallback(() => {
    const ids = Array.from(selectedNoteIds);
    const updateFn = (ids) => {
      ids.forEach(id => notesContextRef.current._updateOrRemoveNoteInState(id));
    };
    _executeBulkAction('unarchive', notesApi.bulkUnarchiveNotes, updateFn).then(() => {
      // Show success toast after successful operation
      notesContextRef.current.setOperationCount(ids.length);
      notesContextRef.current.setShowUnarchiveSuccess(true);
      // Refresh search count if in search mode
      if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
        notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
      }
    });
  }, [_executeBulkAction, selectedNoteIds]);

  const trashSelectedNotes = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    
    // First, identify any archived notes that need to be unarchived first
    const ctx = notesContextRef.current;
    const sourceList = ctx.searchMode ? ctx.searchResults : ctx.notes;
    const archivedIds = [];
    const nonArchivedIds = [];
    
    ids.forEach(id => {
      const note = sourceList.find(n => n.id === id);
      if (note && note.is_archived) {
        archivedIds.push(id);
      } else {
        nonArchivedIds.push(id);
      }
    });
    
    // Block socket events
    manualRefreshInProgressRef.current = true;
    
    try {
      // First, unarchive any archived notes
      if (archivedIds.length > 0) {
        console.log(`Unarchiving ${archivedIds.length} notes before trashing them`);
        await notesApi.bulkUnarchiveNotes(archivedIds);
      }
      
      // Then trash all selected notes
      const updateFn = (ids) => {
        // Pass an update function instead of just IDs to ensure notes are removed from search results
        ids.forEach(id => {
          const note = sourceList.find(n => n.id === id);
          if (note) {
            // Pass a function that marks the note as deleted
            notesContextRef.current._updateOrRemoveNoteInState(id, (currentNote) => ({
              ...currentNote,
              is_deleted: true
            }));
          } else {
            notesContextRef.current._updateOrRemoveNoteInState(id);
          }
        });
      };
        await _executeBulkAction('trash', notesApi.bulkTrashNotes, updateFn);
      
      // Capture the trashed notes (+ their positions) so undo can restore them
      // in place instead of refetching the whole search.
      const trashedEntries = ids
        .map(id => {
          const index = sourceList.findIndex(n => n.id === id);
          return index === -1 ? null : { note: sourceList[index], index };
        })
        .filter(Boolean);

      // Show success toast after successful operation
      notesContextRef.current.setOperationCount(ids.length);
      notesContextRef.current.setLastTrashedNoteIds(ids);
      notesContextRef.current.captureTrashedNotesForUndo(trashedEntries);
      notesContextRef.current.setShowTrashSuccess(true);
      // Refresh search count if in search mode
      if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
        notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
      }
    } catch (err) {
      console.error('Error during bulk trash operation:', err);
      notesContextRef.current.setError('Failed to trash selected notes');
      notesContextRef.current.loadNotes(true);
    } finally {
      // Make sure we release the block even on error
      setTimeout(() => {
        manualRefreshInProgressRef.current = false;
        console.log("Released socket block after bulk trash operation");
      }, 1000);
    }
  }, [_executeBulkAction, selectedNoteIds]);
  const restoreSelectedNotes = useCallback(() => {
    const ids = Array.from(selectedNoteIds);
    const updateFn = (ids) => {
      ids.forEach(id => notesContextRef.current._updateOrRemoveNoteInState(id));
    };
    _executeBulkAction('restore', notesApi.bulkRestoreNotes, updateFn).then(() => {
      // Show success toast after successful operation
      notesContextRef.current.setOperationCount(ids.length);
      notesContextRef.current.setShowRestoreSuccess(true);
      // Refresh search count if in search mode
      if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
        notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
      }
    });
  }, [_executeBulkAction, selectedNoteIds]);

  const deleteForeverSelectedNotes = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    
    const ctx = notesContextRef.current;
    
    // Check if we're in the archive view - if so, move all to trash instead
    if (ctx.view === 'archive') {
      console.log(`Bulk deletion from archive view - sending ${ids.length} notes to trash instead`);
      return trashSelectedNotes();
    }
    
    // Split notes into archived and non-archived
    const sourceList = ctx.searchMode ? ctx.searchResults : ctx.notes;
    const archivedIds = [];
    const deleteIds = [];
    
    // Check each note's archived status
    for (const id of ids) {
      const note = sourceList.find(n => n.id === id);
      if (note && note.is_archived) {
        archivedIds.push(id);
      } else if (!note) {
        // For notes not in the current view, we'll need to check individually
        try {
          const noteDetails = await notesApi.getNoteById(id);
          if (noteDetails && (noteDetails.note || noteDetails) && 
              (noteDetails.note?.is_archived || noteDetails.is_archived)) {
            archivedIds.push(id);
          } else {
            deleteIds.push(id);
          }
        } catch (err) {
          console.error(`Error checking note status for ID ${id}:`, err);
          // If we can't determine, just add to delete list
          deleteIds.push(id);
        }
      } else {
        deleteIds.push(id);
      }
    }
    
    // Send archived notes to trash
    if (archivedIds.length > 0) {
      console.log(`${archivedIds.length} selected notes are archived - sending to trash instead of deleting`);
      
      // Clear all selections first
      const originalSelection = new Set(selectedNoteIds);
      setSelectedNoteIds(new Set());
      
      try {
        // Block socket events
        manualRefreshInProgressRef.current = true;
        
        // Remove from UI
        archivedIds.forEach(id => notesContextRef.current._updateOrRemoveNoteInState(id));
          // Send to trash via API
        await notesApi.bulkTrashNotes(archivedIds);
        console.log(`Successfully moved ${archivedIds.length} archived notes to trash`);
        
        // Show success toast for trashed archived notes
        notesContextRef.current.setOperationCount(archivedIds.length);
        notesContextRef.current.setLastTrashedNoteIds(archivedIds);
        notesContextRef.current.captureTrashedNotesForUndo([]);
        notesContextRef.current.setShowTrashSuccess(true);
        // Refresh search count if in search mode
        if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
          notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
        }
      } catch (err) {
        console.error('Error sending archived notes to trash:', err);
        notesContextRef.current.setError('Failed to process some archived notes');
        setSelectedNoteIds(originalSelection);
        notesContextRef.current.loadNotes(true);
      } finally {
        manualRefreshInProgressRef.current = false;
      }
    }
    
    // Delete non-archived notes permanently
    if (deleteIds.length > 0) {
      console.log(`Permanently deleting ${deleteIds.length} non-archived notes`);
      
      // Make new selected IDs set with only the notes to delete
      const originalSelection = new Set(selectedNoteIds);
      setSelectedNoteIds(new Set(deleteIds));
      
      const updateFn = (ids) => {
        ids.forEach(id => notesContextRef.current._updateOrRemoveNoteInState(id));
      };
        try {
        await _executeBulkAction('delete permanently', notesApi.bulkDeletePermanently, updateFn);
        
        // Show success toast for permanently deleted notes
        notesContextRef.current.setOperationCount(deleteIds.length);
        notesContextRef.current.setShowDeleteSuccess(true);
        // Refresh search count if in search mode
        if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
          notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
        }
      } catch (err) {
        // _executeBulkAction handles errors, but we need to restore original selection
        setSelectedNoteIds(originalSelection);
      }
    }
  }, [
    _executeBulkAction, 
    selectedNoteIds,
    trashSelectedNotes
  ]);

  const changeColorSelectedNotes = useCallback(async (color) => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0 || !color) return;
    console.log(`Changing color of ${ids.length} notes to ${color}`);

    // Update all selected notes
    ids.forEach(id => {
      notesContextRef.current._updateOrRemoveNoteInState(id, prevNote => ({
        ...prevNote,
        color,
        updated_at: new Date().toISOString()
      }));
    });

    const originalSelection = new Set(selectedNoteIds);
    setSelectedNoteIds(new Set()); // Clear selection

    try {
      await notesApi.bulkChangeColorNotes(ids, color);
      console.log(`Bulk color change successful.`);
    } catch (error) {
      console.error(`Error bulk changing color:`, error);
      notesContextRef.current.setError(`Failed to change color for selected notes.`);
      setSelectedNoteIds(originalSelection);
      notesContextRef.current.loadNotes(true);
    }
  }, [selectedNoteIds]);

  // --- Bulk Tag Actions ---
  const bulkAddTagToNotes = useCallback(async (noteIds, tagId) => {
    if (!noteIds || noteIds.length === 0 || !tagId) return;
    console.log(`[SELECTION_CONTEXT] Bulk adding tag ${tagId} to notes:`, noteIds);
    try {
      const response = await tagsApi.bulkAddTagToNotes(noteIds, tagId);
      console.log(`[SELECTION_CONTEXT] Bulk added tag ${tagId} to notes.`);
      
      // Use the returned complete notes to update the client state
      if (response.data && response.data.notes) {
        console.log(`[SELECTION_CONTEXT] Updating client state with ${response.data.notes.length} complete notes from server`);
        notesContextRef.current.updateNotesFromServer(response.data.notes);
      }
      // Refresh search count if in search mode (tag changes may affect search results)
      if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
        notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
      }
    } catch (error) {
      console.error(`[SELECTION_CONTEXT] Error bulk adding tag ${tagId}:`, error);
      notesContextRef.current.setError(`Failed to add tag #${tagId} to selected notes.`);
    }
  }, []);

  const bulkRemoveTagFromNotes = useCallback(async (noteIds, tagId) => {
    if (!noteIds || noteIds.length === 0 || !tagId) return;
    console.log(`[SELECTION_CONTEXT] Bulk removing tag ${tagId} from notes:`, noteIds);
    try {
      const response = await tagsApi.bulkRemoveTagFromNotes(noteIds, tagId);
      console.log(`[SELECTION_CONTEXT] Bulk removed tag ${tagId} from notes.`);
      
      // Use the returned complete notes to update the client state
      if (response.data && response.data.notes) {
        console.log(`[SELECTION_CONTEXT] Updating client state with ${response.data.notes.length} complete notes from server`);
        notesContextRef.current.updateNotesFromServer(response.data.notes);
      }
      // Refresh search count if in search mode (tag changes may affect search results)
      if (notesContextRef.current.searchMode && notesContextRef.current.searchQuery) {
        notesContextRef.current.refreshSearchCount(notesContextRef.current.searchQuery);
      }
    } catch (error) {
      console.error(`[SELECTION_CONTEXT] Error bulk removing tag ${tagId}:`, error);
      notesContextRef.current.setError(`Failed to remove tag #${tagId} from selected notes.`);
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(() => ({
    // Selection state
    selectedNoteIds,
    setSelectedNoteIds,
    
    // Selection actions
    toggleNoteSelection,
    clearSelection,
    
    // Bulk actions
    downloadSelectedNotes,
    archiveSelectedNotes,
    unarchiveSelectedNotes,
    trashSelectedNotes,
    restoreSelectedNotes,
    deleteForeverSelectedNotes,
    changeColorSelectedNotes,
    
    // Bulk tag actions
    bulkAddTagToNotes,
    bulkRemoveTagFromNotes,
    
    // Internal references
    manualRefreshInProgressRef
  }), [
    selectedNoteIds,
    setSelectedNoteIds,
    toggleNoteSelection,
    clearSelection,
    downloadSelectedNotes,
    archiveSelectedNotes,
    unarchiveSelectedNotes,
    trashSelectedNotes,
    restoreSelectedNotes,
    deleteForeverSelectedNotes,
    changeColorSelectedNotes,
    bulkAddTagToNotes,
    bulkRemoveTagFromNotes,
    manualRefreshInProgressRef
  ]);

  return (
    <NoteSelectionContext.Provider value={value}>
      {children}
    </NoteSelectionContext.Provider>
  );
};

export default NoteSelectionContext;
