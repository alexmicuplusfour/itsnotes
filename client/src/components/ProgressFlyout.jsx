import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import { objectsApi, foxitApi, tagsApi } from '../services/api';
import { useAutoTagging, AUTO_TAG_FEATURES } from '../contexts/AutoTaggingContext';
import { useTags } from '../contexts/TagsContext';
import { useToast } from '../contexts/ToastContext';
import Icon from './Icons';

const FlyoutContainer = styled.div`
  position: fixed;
  background: var(--note-bg-color);
  border: 1px solid var(--note-border-color);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FlyoutHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const FetchButton = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s, color 0.2s;
  
  &:hover {
    background-color: var(--button-hover-color);
    color: var(--text-color);
  }
  
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const FetchIcon = styled.span`
  font-size: 12px;
`;

const FlyoutInput = styled.input`
  background: var(--input-bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 14px;
  width: 60px;

  &:focus {
    outline: 2px solid #8ab4f8;
    border-color: transparent;
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

const FlyoutButton = styled.button`
  background: none;
  border: none;
  color: var(--link);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  font-weight: 500;
  text-align: left;

  &:hover {
    text-decoration: underline;
  }
`;

const FlyoutButtonRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
`;

const FlyoutButtonGroup = styled.div`
  display: flex;
  gap: 12px;
`;

const FlyoutInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FlyoutLabel = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
  margin-bottom: 2px;
`;

const ProgressFlyout = React.forwardRef(({
  object,
  position,
  chipElement,
  onClose,
  tempPage,
  setTempPage,
  noteId, // ID of the note containing this book
}, ref) => {
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const totalPages = object?.metadata?.source?.page_count || 0;
  const status = object?.metadata?.user?.status;
  const isFinished = status === 'finished';

  // Auto-tagging hooks
  const { shouldAutoApply, getFeatureSettings } = useAutoTagging();
  const { tags } = useTags();
  const { showToast } = useToast();

  // Foxit enabled state - read from localStorage (synced from server settings)
  const [foxitEnabled, setFoxitEnabled] = useState(() => {
    return localStorage.getItem('foxitEnabled') === 'true';
  });

  // Re-check localStorage on mount (in case settings changed on another device)
  useEffect(() => {
    setFoxitEnabled(localStorage.getItem('foxitEnabled') === 'true');
  }, []);

  // Foxit snooper state
  const [foxitInfo, setFoxitInfo] = useState(null);
  const [foxitLoading, setFoxitLoading] = useState(false);
  const [foxitAvailable, setFoxitAvailable] = useState(false);

  // Calculate smart position to keep flyout in viewport
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  // Function to calculate and adjust position
  const calculatePosition = React.useCallback(() => {
    if (!containerRef.current || !chipElement) return;

    const flyout = containerRef.current;
    const flyoutRect = flyout.getBoundingClientRect();
    const chipRect = chipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Position flyout above the chip (estimate flyout height)
    const flyoutHeight = flyoutRect.height || 120;
    let top = chipRect.top - flyoutHeight - 4;
    let left = chipRect.left;

    // Adjust horizontal position if cut off on right
    if (left + flyoutRect.width > viewportWidth) {
      left = viewportWidth - flyoutRect.width - 8; // 8px padding from edge
    }

    // Adjust horizontal position if cut off on left
    if (left < 8) {
      left = 8;
    }

    // Adjust vertical position if cut off on top
    if (top < 8) {
      top = 8;
    }

    // Adjust vertical position if cut off on bottom
    if (top + flyoutRect.height > viewportHeight) {
      top = viewportHeight - flyoutRect.height - 8;
    }

    setAdjustedPosition({ top, left });
  }, [chipElement]);

  // Initial position calculation
  useEffect(() => {
    calculatePosition();
  }, [position, calculatePosition]);

  // Track scroll events to update position
  useEffect(() => {
    if (!chipElement) return;

    const handleScroll = () => {
      calculatePosition();
    };

    // Listen to scroll on window and all scrollable parent elements
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [chipElement, calculatePosition]);

  // Select text when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  }, []);

  // Check for Foxit snooper availability and get page for this book on mount
  useEffect(() => {
    if (!foxitEnabled) {
      setFoxitAvailable(false);
      return;
    }
    
    const checkFoxit = async () => {
      try {
        // First check if snooper is available
        const health = await foxitApi.checkHealth();
        setFoxitAvailable(health.snooper_available);
        
        if (health.snooper_available) {
          // Try to get page for this specific book (via mapping)
          const pageInfo = await foxitApi.getPageForObject(object.id);
          if (pageInfo.found && pageInfo.current_page) {
            setFoxitInfo(pageInfo);
          }
        }
      } catch (err) {
        setFoxitAvailable(false);
      }
    };
    checkFoxit();
  }, [object.id, foxitEnabled]);

  // Fetch page from Foxit snooper for this book
  const handleFetchFromFoxit = async () => {
    setFoxitLoading(true);
    try {
      // Try to get page for this specific book (via mapping)
      const pageInfo = await foxitApi.getPageForObject(object.id);
      
      if (pageInfo.found && pageInfo.current_page) {
        setTempPage(pageInfo.current_page.toString());
        setFoxitInfo(pageInfo);
      } else {
        // No mapping exists - show a message
        console.log('No Foxit mapping found for this book. Use the Foxit Snooper tray app to create a mapping.');
        // Could show a tooltip/toast here
      }
    } catch (err) {
      console.error('Error fetching from Foxit:', err);
    } finally {
      setFoxitLoading(false);
    }
  };

  const handleSave = async () => {
    const newCurrent = Math.max(0, parseInt(tempPage) || 0);
    const percent = totalPages > 0 ? Math.min(100, Math.round((newCurrent / totalPages) * 100)) : 0;
    const isNowFinished = newCurrent >= totalPages && totalPages > 0;

    try {
      await objectsApi.updateUserState(object.id, {
        status: isNowFinished ? 'finished' : 'reading',
        progress: { current_page: newCurrent, percent }
      });
      
      // Auto-apply tags if book just became finished and auto-tagging is enabled
      if (isNowFinished && noteId && shouldAutoApply(AUTO_TAG_FEATURES.BOOK_FINISHED)) {
        const featureSettings = getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED);
        const tagIds = featureSettings.tagIds || [];
        const appliedTagNames = [];
        for (const tagId of tagIds) {
          const actualTag = tags.find(t => t.id === tagId);
          if (actualTag) {
            try {
              await tagsApi.addTagToNote(noteId, actualTag.id);
              appliedTagNames.push(actualTag.name);
            } catch (tagErr) {
              console.log('[ProgressFlyout] Could not add tag (may already exist):', tagErr);
            }
          }
        }
        if (appliedTagNames.length > 0) {
          console.log('[ProgressFlyout] Auto-applied book finished tags:', appliedTagNames.join(', '));
          showToast(`Tagged with ${appliedTagNames.join(', ')}`);
        }
      }
      
      onClose();
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  };

  const handleMarkFinished = async () => {
    try {
      await objectsApi.updateUserState(object.id, {
        status: 'finished',
        progress: { current_page: totalPages, percent: 100 }
      });
      
      // Auto-apply tags if enabled (ProgressFlyout only supports auto-apply since note is closed)
      if (noteId && shouldAutoApply(AUTO_TAG_FEATURES.BOOK_FINISHED)) {
        const featureSettings = getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED);
        const tagIds = featureSettings.tagIds || [];
        const appliedTagNames = [];
        for (const tagId of tagIds) {
          const actualTag = tags.find(t => t.id === tagId);
          if (actualTag) {
            try {
              await tagsApi.addTagToNote(noteId, actualTag.id);
              appliedTagNames.push(actualTag.name);
            } catch (tagErr) {
              // Tag might already exist on the note, that's fine
              console.log('[ProgressFlyout] Could not add tag (may already exist):', tagErr);
            }
          }
        }
        if (appliedTagNames.length > 0) {
          console.log('[ProgressFlyout] Auto-applied book finished tags:', appliedTagNames.join(', '));
          showToast(`Tagged with ${appliedTagNames.join(', ')}`);
        }
      }
      
      onClose();
    } catch (err) {
      console.error('Error marking as finished:', err);
    }
  };

  return ReactDOM.createPortal(
    <FlyoutContainer
      ref={(el) => {
        containerRef.current = el;
        if (typeof ref === 'function') {
          ref(el);
        } else if (ref) {
          ref.current = el;
        }
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        top: `${adjustedPosition.top}px`,
        left: `${adjustedPosition.left}px`
      }}
    >
      <FlyoutHeader>
        <FlyoutLabel style={{ marginBottom: 0 }}>Current Page</FlyoutLabel>
      </FlyoutHeader>
      <FlyoutInputRow>
        <FlyoutInput
          ref={inputRef}
          type="number"
          value={tempPage}
          onChange={(e) => setTempPage(e.target.value)}
          placeholder="#"
          min="0"
          max={totalPages}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSave();
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          autoFocus
        />
        {foxitEnabled && foxitAvailable && (
          <FetchButton 
            onClick={handleFetchFromFoxit} 
            disabled={foxitLoading}
            title="Fetch page from Foxit Reader"
          >
            {foxitLoading ? (
              <FetchIcon>⏳</FetchIcon>
            ) : (
              <Icon name="refresh" size={16} />
            )}
          </FetchButton>
        )}
        {totalPages > 0 && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary-color)', whiteSpace: 'nowrap' }}>
            of {totalPages}
          </div>
        )}
      </FlyoutInputRow>
      <FlyoutButtonRow>
        {!isFinished && (
          <FlyoutButton onClick={handleMarkFinished}>
            I'm Finished
          </FlyoutButton>
        )}
        <FlyoutButtonGroup>
          <FlyoutButton onClick={handleSave}>
            Save
          </FlyoutButton>
          <FlyoutButton onClick={onClose} style={{ color: 'var(--text-secondary-color)' }}>
            Cancel
          </FlyoutButton>
        </FlyoutButtonGroup>
      </FlyoutButtonRow>
    </FlyoutContainer>,
    document.body
  );
});

ProgressFlyout.displayName = 'ProgressFlyout';

export default ProgressFlyout;
