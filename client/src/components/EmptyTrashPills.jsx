import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNotes } from '../contexts/NotesContext';
import { useNoteSelection } from '../contexts/NoteSelectionContext'; // Import useNoteSelection
import { notesApi } from '../services/api';
import socketService from '../services/socket';
import Icon from './Icons';

const EmptyTrashPills = ({ title }) => {
  const { notes, loadNotes, setError, view } = useNotes();
  const { setSelectedNoteIds } = useNoteSelection(); // Get selection function from selection context
  const [isDarkTheme, setIsDarkTheme] = useState(() => 
    !document.documentElement.classList.contains('light-theme')
  );  const [totalTrashedCount, setTotalTrashedCount] = useState(null);
  
  // Check if we're in trash view (either via title prop or view context)
  const isTrashView = title === 'Trash' || view === 'trash';
  
  // Fetch the actual count of all trashed notes when component mounts
  useEffect(() => {
    const fetchTrashedCount = async () => {
      if (isTrashView) {
        try {
          const response = await notesApi.getAllTrashedNotes();
          setTotalTrashedCount(response.count || 0);
        } catch (error) {
          console.error('Error fetching trashed count:', error);
          setTotalTrashedCount(notes?.length || 0); // Fallback to current page count
        }
      }
    };
    fetchTrashedCount();
  }, [isTrashView, notes]);

  // Set up socket listeners for real-time count updates
  useEffect(() => {
    if (!isTrashView) return;

    const handleNoteUpdated = (note) => {
      if (!note || !note.id) return;
      
      console.log('[EmptyTrashPills] Received note_updated:', note.id, 'is_deleted:', note.is_deleted);
      
      // Update count based on note's deleted status
      setTotalTrashedCount(prevCount => {
        if (note.is_deleted) {
          // Note was moved to trash
          console.log('[EmptyTrashPills] Note moved to trash, incrementing count');
          return (prevCount || 0) + 1;
        } else {
          // Note was restored from trash
          console.log('[EmptyTrashPills] Note restored from trash, decrementing count');
          return Math.max((prevCount || 1) - 1, 0);
        }
      });
    };
 
    const handleNoteDeleted = (noteId) => {
      console.log('[EmptyTrashPills] Received note_deleted (permanently deleted):', noteId);
      
      // Note was permanently deleted from trash
      setTotalTrashedCount(prevCount => {
        console.log('[EmptyTrashPills] Note permanently deleted, decrementing count');
        return Math.max((prevCount || 1) - 1, 0);
      });
    };

    // Bulk routes emit a single batched event; fan it out to the per-note handlers.
    const handleNotesBulkUpdated = ({ notes } = {}) => {
      if (!Array.isArray(notes)) return;
      notes.forEach(handleNoteUpdated);
    };

    const handleNotesBulkDeleted = ({ noteIds } = {}) => {
      if (!Array.isArray(noteIds)) return;
      noteIds.forEach(handleNoteDeleted);
    };

    // Register socket listeners
    console.log('[EmptyTrashPills] Setting up socket listeners for trash count updates');
    socketService.on('note_updated', handleNoteUpdated);
    socketService.on('note_deleted', handleNoteDeleted);
    socketService.on('notes_bulk_updated', handleNotesBulkUpdated);
    socketService.on('notes_bulk_deleted', handleNotesBulkDeleted);

    // Cleanup function
    return () => {
      console.log('[EmptyTrashPills] Cleaning up socket listeners');
      socketService.off('note_updated', handleNoteUpdated);
      socketService.off('note_deleted', handleNoteDeleted);
      socketService.off('notes_bulk_updated', handleNotesBulkUpdated);
      socketService.off('notes_bulk_deleted', handleNotesBulkDeleted);
    };
  }, [isTrashView]);
  
  // Update theme state when the theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Only show the pill if we're in trash and there are notes to delete
  const displayCount = totalTrashedCount !== null ? totalTrashedCount : (notes?.length || 0);
  if (!isTrashView || displayCount === 0) {
    return null;
  }
  const handleEmptyTrash = async () => {
    try {
      // First, get all trashed notes from the database
      console.log('Fetching all trashed notes from database...');
      const response = await notesApi.getAllTrashedNotes();
      
      if (!response || !response.noteIds || response.noteIds.length === 0) {
        console.log('No trashed notes found in database');
        return;
      }
      
      const trashedCount = response.count;
      
      if (confirm(`Delete all ${trashedCount} notes permanently? This action cannot be undone.`)) {
        console.log(`Emptying trash: deleting ${trashedCount} notes`);
        
        // Call the bulk delete API with all trashed note IDs
        await notesApi.bulkDeletePermanently(response.noteIds);
        
        // Clear any selection
        setSelectedNoteIds(new Set());
          // Refresh the trash view to reflect the changes
        await loadNotes(true);
        
        // Update the local count
        setTotalTrashedCount(0);
        
        console.log(`Successfully emptied trash: deleted ${trashedCount} notes`);
      }
    } catch (error) {
      console.error('Error emptying trash:', error);
      setError('Failed to empty trash. Please try again.');
    }
  };
  
  return (
    <PillsContainer>
      <PillsWrapper>
        <EmptyTrashPill
          theme={isDarkTheme ? 'dark' : 'light'}
          onClick={handleEmptyTrash}
          title={`Permanently delete all ${displayCount} notes in trash`}
        >
          <Icon name="deleteForever" size={16} />
          <PillLabel>Empty Trash ({displayCount})</PillLabel>
        </EmptyTrashPill>
      </PillsWrapper>
    </PillsContainer>
  );
};

// Styled components (consistent with other pill components)
const PillsContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 8px;
  margin-top: 0px;
  margin-bottom: 8px;
`;

const PillsWrapper = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  padding-left: 8px;
  justify-content: center;
  padding-left: 0;
`;

const EmptyTrashPill = styled.div`
  display: inline-flex;
  align-items: center;
  background-color: ${props => props.theme === 'dark' 
    ? 'rgba(220, 53, 69, 0.2)' 
    : 'rgba(220, 53, 69, 0.15)'};
  color: ${props => props.theme === 'dark' 
    ? 'rgb(248, 215, 218)' 
    : 'rgb(132, 32, 41)'};
  opacity: 0.9;
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 13px;
  cursor: pointer;
  gap: 6px;
  border: 1px solid ${props => props.theme === 'dark' 
    ? 'rgba(220, 53, 69, 0.3)' 
    : 'rgba(220, 53, 69, 0.25)'};
  transition: all 0.2s ease;
  
  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark' 
      ? 'rgba(220, 53, 69, 0.3)' 
      : 'rgba(220, 53, 69, 0.2)'};
    border-color: ${props => props.theme === 'dark' 
      ? 'rgba(220, 53, 69, 0.4)' 
      : 'rgba(220, 53, 69, 0.35)'};
  }
  
  &:active {
    transform: translateY(1px);
  }
`;

const PillLabel = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
`;

export default EmptyTrashPills;
