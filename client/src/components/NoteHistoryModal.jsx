import React, { useCallback, forwardRef } from 'react'; // Import forwardRef
import styled, { keyframes } from 'styled-components';
import { format, formatDistanceToNow } from 'date-fns';
import { notesApi } from '../services/api'; // Import notesApi
import Icon from './Icons'; // Import Icon component
import { useAuth } from '../contexts/AuthContext'; // Import useAuth

// --- Styled Components (similar to TagsModal) ---

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const scaleIn = keyframes`
  from { transform: scale(0.95); }
  to { transform: scale(1); }
`;

const ModalOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1200;

  @media (max-width: 768px) {
    background-color: var(--note-bg-color);
  }
`;

const ModalContainer = styled.div`
  position: relative;
  background-color: var(--note-bg-color);
  border: ${props => props.theme === 'dark' ? 'none' : '1px solid var(--note-border-color)'};
  border-radius: 8px;
  box-shadow: 0 3px 10px var(--shadow-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;

  /* Desktop: match note width minus 16px on each side */
  width: calc(100% - 32px);
  max-width: 600px;
  height: auto;
  max-height: calc(100vh - 80px);

  /* Mobile: full screen */
  @media (max-width: 768px) {
    width: 100%;
    max-width: 100%;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
  }
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  box-shadow: 1px 3px 9px 0px rgba(0,0,0,0.2);
  -webkit-box-shadow: 1px 3px 9px 0px rgba(0,0,0,0.2);
  -moz-box-shadow: 1px 3px 9px 0px rgba(0,0,0,0.2);
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 500;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  opacity: 0.8;
  cursor: pointer;

  &:hover {
    opacity: 1;
  }
`;

const ModalContent = styled.div`
  padding: 20px 20px 20px 20px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;

  /* Scrollbar styling at modal edge */
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 20px;
  }
  .dark-theme & ::-webkit-scrollbar-thumb {
    background-color: rgba(255, 255, 255, 0.2);
  }

  /* Add right padding to child elements instead of scrollable container */
  & > * {
    padding-right: 20px;
    width: 100%;
    box-sizing: border-box;
  }
`;

const VersionList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  min-height: 0;
`;

const VersionItem = styled.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 8px;
  border-bottom: 1px solid var(--menu-item-separator-dark);
  font-size: 15px;
  color: var(--text-color);
  font-weight: 400;

  &:hover {
    background-color: var(--button-hover-color);
  }

  &:last-child {
    border-bottom: none;
  }
`;

const VersionTimestamp = styled.span`
  display: flex;
  align-items: center;
`;

const ActionButton = styled.button`
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
  margin-left: 8px;

  &:hover {
    background-color: var(--button-hover-color);
    color: var(--text-color);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const LoadingMessage = styled.p`
  text-align: center;
  color: var(--text-secondary-color);
`;

const NoVersionsMessage = styled.p`
  text-align: center;
  color: var(--text-secondary-color);
  margin-top: 20px;
`;

// --- Component ---

const NoteHistoryModal = forwardRef(({ noteId, note, versions, isLoading, onClose, onRestore }, ref) => { // Add onRestore prop
  const handleDownloadVersion = useCallback(async (versionId) => {

    // Get token directly from localStorage for this action
    const currentToken = localStorage.getItem('authToken');

    if (!noteId || !versionId || !currentToken) {
      console.error('[NoteHistoryModal] Download prerequisites not met: noteId, versionId, or currentToken is missing.');
      alert('Failed to download: Missing required information or not authenticated. Please try again.');
      return;
    }

    try {
      // Add format=html query parameter to get HTML version
      const downloadUrl = `${notesApi.getNoteVersionDownloadUrl(noteId, versionId)}?format=html`;

      const response = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Download failed' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      let filename;

      // Attempt to construct the preferred filename
      const version = versions && Array.isArray(versions) ? versions.find(v => {
        return v.id === versionId;
      }) : undefined;

      if (noteId && version && version.created_at) {
        const date = new Date(version.created_at);
        if (isNaN(date.getTime())) {
          console.error('[NoteHistoryModal] Invalid date created from version.created_at:', version.created_at);
          filename = null;
        } else {
          const isoTimestamp = date.toISOString();
          const formattedTimestamp = isoTimestamp.replace(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/, '$1-$2-$3-$4');
          filename = `note_${noteId}_version_${formattedTimestamp}.html`;
        }
      } else {
        console.log('[NoteHistoryModal] Conditions for preferred filename NOT met.');
      }

      // If preferred filename couldn't be constructed or was invalid, try contentDisposition
      if (!filename) {
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
          if (filenameMatch && filenameMatch.length > 1) {
            filename = filenameMatch[1];
          }
        }
      }

      // Final fallback if no filename could be determined
      if (!filename) {
        filename = `note_version_${versionId}.html`;
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error downloading note version:', error);
      alert(`Failed to download version: ${error.message}`);
    }
  }, [noteId, versions]);


  // --- MOUSE DOWN Propagation Handlers ---
  const handleOverlayMouseDown = (e) => {
    // Stop propagation if mousedown is directly on the overlay
    if (e.target === e.currentTarget) {
      e.stopPropagation();
    }
  };

  const handleContainerMouseDown = (e) => {
    // Stop propagation if mousedown is on the container itself (not its children)
    // This helps if you have scrollable content inside the container
    // and want to allow text selection/interaction without closing the modal.
    e.stopPropagation();
  };


  if (isLoading) {
    return (
      <ModalOverlay className="note-history-modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={onClose} ref={ref}>
        <ModalContainer onMouseDown={handleContainerMouseDown} onClick={(e) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>Note History</ModalTitle>
            <CloseButton
              onClick={onClose} // Simplified: directly use onClose for click
              aria-label="Close history modal"
            >
              <Icon name="close" size={20} />
            </CloseButton>
          </ModalHeader>
          <ModalContent>
            <LoadingMessage>Loading history...</LoadingMessage>
          </ModalContent>
        </ModalContainer>
      </ModalOverlay>
    );
  }
 
  return (
    <ModalOverlay className="note-history-modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={onClose} ref={ref}> {/* Assign ref to ModalOverlay */}
      <ModalContainer onMouseDown={handleContainerMouseDown} onClick={(e) => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Note History</ModalTitle>
          <CloseButton
            onClick={onClose} // Use onClose directly
            aria-label="Close history modal"
          >
            <Icon name="close" size={20} />
          </CloseButton>
        </ModalHeader>
        <ModalContent>
          {isLoading ? (
            <LoadingMessage>Loading history...</LoadingMessage>
          ) : (
            <>
              {/* Always show creation date if available */}
              {note && note.created_at && (
                <VersionItem style={{width: '100%', }}>
                  <VersionTimestamp title={new Date(note.created_at).toLocaleString()} style={{marginLeft: 'auto', marginRight: 'auto', fontSize: '16px'}}>
                    Created: {
                        `${new Date(note.created_at).toLocaleString('en-US', {month: 'long'})} ${new Date(note.created_at).getDate()} ${new Date(note.created_at).getFullYear()}, ${new Date(note.created_at).toLocaleString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true})}`
                      }
                  </VersionTimestamp>
                </VersionItem>
              )}
              
              {/* Show versions if available */}
              {versions && versions.length > 0 ? (
                <VersionList>
                  {versions.map(version => {
                    // 1. Create a date object once to avoid repetition
                    const date = new Date(version.created_at);
                    
                    // 2. Check if the version year is the same as the current year
                    const isCurrentYear = date.getFullYear() === new Date().getFullYear();

                    return (
                      <VersionItem key={version.id}>
                        <VersionTimestamp title={date.toLocaleString()}>
                          <Icon name="notes" size={18} style={{marginRight: '12px'}}/>
                          {/* 3. Use ternary to choose the format pattern */}
                          {format(date, isCurrentYear ? 'MMM d, h:mm a' : 'MMM d yyyy, h:mm a')}

                        </VersionTimestamp>
                        <ButtonGroup>
                          <ActionButton
                            onClick={() => onRestore && onRestore(version.id)}
                            title={`Restore version from ${date.toLocaleString()}`}
                            aria-label="Restore version"
                          >
                            <Icon name="restore" size={18} />
                          </ActionButton>
                          <ActionButton
                            onClick={() => handleDownloadVersion(version.id)}
                            title={`Download version from ${date.toLocaleString()}`}
                            aria-label="Download version"
                          >
                            <Icon name="download" size={18} />
                          </ActionButton>
                        </ButtonGroup>
                      </VersionItem>
                    );
                  })}
                </VersionList>
              ) : (
                <NoVersionsMessage>No previous versions found for this note.</NoVersionsMessage>
              )}
            </>
          )}
        </ModalContent>
      </ModalContainer>
    </ModalOverlay>
  );
});

export default NoteHistoryModal;