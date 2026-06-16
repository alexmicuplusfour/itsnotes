import React, { useCallback, forwardRef } from 'react';
import styled from 'styled-components';
import { format, formatDistanceToNow } from 'date-fns';
import { notesApi } from '../services/api';
import Icon from './Icons';
import { useAuth } from '../contexts/AuthContext';
import Modal from './Modal';

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


  const modalProps = {
    ref,
    title: 'Note History',
    onClose,
    position: 'absolute',
    zIndex: 1200,
    width: 'calc(100% - 32px)',
    maxWidth: '600px',
    maxHeight: 'calc(100vh - 80px)',
    guardDragSelection: true,
    overlayClassName: 'note-history-modal-overlay',
  };

  if (isLoading) {
    return (
      <Modal {...modalProps}>
        <ModalContent>
          <LoadingMessage>Loading history...</LoadingMessage>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal {...modalProps}>
      <ModalContent>
        {note && note.created_at && (
          <VersionItem style={{width: '100%'}}>
            <VersionTimestamp title={new Date(note.created_at).toLocaleString()} style={{marginLeft: 'auto', marginRight: 'auto', fontSize: '16px'}}>
              Created: {
                  `${new Date(note.created_at).toLocaleString('en-US', {month: 'long'})} ${new Date(note.created_at).getDate()} ${new Date(note.created_at).getFullYear()}, ${new Date(note.created_at).toLocaleString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true})}`
                }
            </VersionTimestamp>
          </VersionItem>
        )}

        {versions && versions.length > 0 ? (
          <VersionList>
            {versions.map(version => {
              const date = new Date(version.created_at);
              const isCurrentYear = date.getFullYear() === new Date().getFullYear();

              return (
                <VersionItem key={version.id}>
                  <VersionTimestamp title={date.toLocaleString()}>
                    <Icon name="notes" size={18} style={{marginRight: '12px'}}/>
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
      </ModalContent>
    </Modal>
  );
});

export default NoteHistoryModal;