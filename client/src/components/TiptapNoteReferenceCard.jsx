import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { notesApi } from '../services/api';
import Icon from './Icons';

// Cache for note data to prevent re-fetching on re-renders
const noteCache = new Map();

// Event emitter for cache updates
const cacheUpdateListeners = new Map(); // noteId -> Set of listener functions

// Export function to update the cache when a note changes
export const updateNoteInCache = (noteId, noteData) => {
  if (noteId && noteData) {
    console.log('[TiptapNoteReferenceCard] Updating cache for note:', noteId);
    noteCache.set(noteId, noteData);
    
    // Notify all listeners for this noteId
    const listeners = cacheUpdateListeners.get(noteId);
    if (listeners) {
      listeners.forEach(listener => listener(noteData));
    }
  }
};

// Export function to invalidate cache (force re-fetch)
export const invalidateNoteCache = (noteId) => {
  if (noteId) {
    console.log('[TiptapNoteReferenceCard] Invalidating cache for note:', noteId);
    noteCache.delete(noteId);
    
    // Notify all listeners to refetch
    const listeners = cacheUpdateListeners.get(noteId);
    if (listeners) {
      listeners.forEach(listener => listener(null)); // null signals to refetch
    }
  }
};

const PreviewCard = styled.div`
  position: relative;
  width: calc(100% - 8px);
  max-height: 80px;
  background-color: ${props => {
    if (props.$color && props.$color !== 'default') {
      return `var(--note-color-${props.$color})`;
    }
    return 'var(--note-bg-color)';
  }};
  outline: 1px solid var(--border-transparent);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0;
  margin-top: 8px;
  margin-left: 1px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: row; /* Changed to row */
  align-items: center; /* Vertically align icon and text */
  /* gap: 12px;  Add space between icon and text */
  position: relative;
  overflow: visible;
  user-select: none;
  box-sizing: border-box;

  @media (max-width: 600px) {
    width: calc(100% - 5px);
    background-color: ${props => {
      if (props.$color && props.$color !== 'default') {
        return `var(--note-color-${props.$color})`;
      }
      return 'var(--mobile-note-bg-color)';
    }};
  }

  &:hover {
    box-shadow: 0 2px 12px var(--shadow-color);
  }
`;

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  margin-right: 12px;
  flex-shrink: 0;
  opacity: 0.8;
`;

const TrashBadge = styled.div`
  position: absolute;
  top: 6px;
  right: 6px;
  background-color: var(--error-color, #d93025);
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 3px;
  z-index: 1;
`;

const DeleteButton = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  background-color: var(--error-color, #525252c4);
  color: white;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, background-color 0.2s ease;
  z-index: 2;
  padding: 0;

  ${PreviewCard}:hover & {
    opacity: 1;
  }

  &:hover {
    background-color: var(--error-hover-color, #b71c1c);
  }

  &:active {
    transform: translateY(-50%) scale(0.95);
  }
`;

const ContentContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden; /* Ensures text-overflow works */
`;

const EmptyNoteMessage = styled.div`
  font-size: 13px;
  color: var(--text-color);
  opacity: 0.5;
  text-align: center;
  width: 100%;
`;

const PreviewTitle = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PreviewContent = styled.div`
  font-size: 13px;
  color: var(--text-color);
  opacity: 0.8;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-overflow: ellipsis;

  /* Remove HTML tags for plain text preview */
  & * {
    display: inline;
    margin: 0;
    padding: 0;
  }
`;

const LoadingCard = styled(PreviewCard)`
  background-color: transparent;
  border: 1px var(--border-transparent);
`;

const LoadingText = styled.div`
  width: 100%;
  text-align: center;
  font-size: 13px;
  color: var(--text-color);
  opacity: 0.6;
`;

const ErrorCard = styled(PreviewCard)`
  background-color: transparent;
  border: 1px dashed rgba(237, 137, 0, 0.3);
  outline: none;
  text-align: center;
  pointer-events: none;
`;

const ErrorText = styled.div`
  font-size: 12px;
  text-align: center;
  color: rgb(240, 139, 0);
  width:100%;
`;

// Helper function to strip HTML tags and get plain text
const getPlainTextContent = (htmlContent) => {
  if (!htmlContent) return '';
  
  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  
  // Replace block-level elements with dot separator before getting text content
  // This prevents paragraphs from merging together and adds visual separation
  const blockTags = temp.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6, blockquote, tr');
  blockTags.forEach(el => {
    el.insertAdjacentText('beforebegin', ' · ');
  });
  
  // Get text content and clean it up
  let text = temp.textContent || temp.innerText || '';
  text = text.trim().replace(/\s+/g, ' ');
  // Remove leading dot and collapse multiple dots
  text = text.replace(/^·\s*/, '').replace(/(\s*·\s*)+/g, ' · ');
  return text;
};

// Helper function to truncate text
const truncateText = (text, maxLength = 200) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

const TiptapNoteReferenceCard = ({ noteId, onClick, onDelete }) => {
  const initialNote = noteCache.get(noteId) || null;
  const [note, setNote] = useState(initialNote);
  const [loading, setLoading] = useState(!initialNote);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNote = async () => {
      if (!noteId) {
        setError('Invalid note ID');
        setLoading(false);
        return;
      }

      // Check cache first
      const cachedNote = noteCache.get(noteId);
      if (cachedNote) {
        setNote(cachedNote);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // Fetch the note with basic details
        const fetchedNote = await notesApi.getNote(noteId, true);
        noteCache.set(noteId, fetchedNote); // Cache the fetched note
        setNote(fetchedNote);
      } catch (err) {
        console.error('Error fetching note for preview:', err);
        setError('Note not found');
      } finally {
        setLoading(false);
      }
    };

    fetchNote();
    
    // Set up listener for cache updates
    const handleCacheUpdate = (updatedNote) => {
      if (updatedNote === null) {
        // null means invalidated - refetch
        setNote(null);
        setLoading(true);
        fetchNote();
      } else {
        // Update with new data
        setNote(updatedNote);
      }
    };
    
    // Register listener
    if (!cacheUpdateListeners.has(noteId)) {
      cacheUpdateListeners.set(noteId, new Set());
    }
    cacheUpdateListeners.get(noteId).add(handleCacheUpdate);
    
    // Cleanup listener on unmount
    return () => {
      const listeners = cacheUpdateListeners.get(noteId);
      if (listeners) {
        listeners.delete(handleCacheUpdate);
        if (listeners.size === 0) {
          cacheUpdateListeners.delete(noteId);
        }
      }
    };
  }, [noteId]);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick && note) {
      onClick(noteId);
    }
  };

  const handleDelete = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete(noteId);
    }
  };

  if (loading) {
    return (
      <LoadingCard>
        <LoadingText>Loading note preview...</LoadingText>
      </LoadingCard>
    );
  }

  if (error || !note) {
    return (
      <ErrorCard>
        <ErrorText>{error || 'Failed to load note'}</ErrorText>
      </ErrorCard>
    );
  }

  const plainTextContent = getPlainTextContent(note.content);
  const truncatedContent = truncateText(plainTextContent);
  const isDeleted = note.is_deleted === true;
  const isEmpty = !note.title?.trim() && !truncatedContent?.trim();
  
  return (
    <PreviewCard 
      $color={note.color || 'default'} 
      onClick={handleClick}
      title={`Open note: ${note.title || 'Note'}${isDeleted ? ' (In Trash)' : ''}`}
    >
      {isDeleted && (
        <TrashBadge>
          {/* <Icon name="trash" size={12} strokeWidth="3"/> */}
          Trashed
        </TrashBadge>
      )}
      <DeleteButton onClick={handleDelete} title="Remove reference">
        <Icon name="trash" size={16} strokeWidth="2.5"/>
      </DeleteButton>
      <IconContainer>
        <Icon name="notes" size={20} strokeWidth="2"/>
      </IconContainer>
      <ContentContainer>
        {isEmpty ? (
          <EmptyNoteMessage>This note is empty</EmptyNoteMessage>
        ) : (
          <>
            {note.title && (
              <PreviewTitle>
                {note.title}
              </PreviewTitle>
            )}
            {truncatedContent && (
              <PreviewContent>
                {truncatedContent}
              </PreviewContent>
            )}
          </>
        )}
      </ContentContainer>
    </PreviewCard>
  );
};

export default TiptapNoteReferenceCard;