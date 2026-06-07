import React, { useState, useEffect } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import styled, { keyframes } from 'styled-components';
import Icon from './Icons';
import env from '../../env.js';

const CardContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: var(--fill-subtle);
  border: 1px solid var(--border-transparent);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 8px 0;
  width: calc(100% - 8px);
  cursor: pointer;
  transition: background-color 0.2s;
  position: relative;
  overflow: hidden;

  &:hover {
    background-color: var(--button-bg);
  }
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: var(--text-color, #e8eaed);
`;

const InfoWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0; /* For text truncation */
`;

const FileName = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color, #e8eaed);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
`;

const FileSize = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color, #9aa0a6);
`;

const ProgressBar = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background-color: var(--link);
  transform-origin: left;
  transform: scaleX(${props => (props.$progress || 0) / 100});
  transition: transform 0.2s ease;
  z-index: 10;
`;

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const DeleteButton = styled.button.attrs({ type: 'button' })`
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary-color, #9aa0a6);
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s, background-color 0.2s;
  margin-left: 8px;

  ${CardContainer}:hover & {
    opacity: 1;
  }

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: var(--text-color, #e8eaed);
  }
`;

const AttachmentCard = (props) => {
  const { node, updateAttributes, deleteNode } = props;
  const { filename, size, mimeType, id, uploading, progress } = node.attrs;

  const handleDelete = async (e) => {
    e.preventDefault(); // Prevent form submission
    e.stopPropagation(); // Prevent download
    
    if (uploading) {
        deleteNode();
        return;
    }

    if (window.confirm('Delete this attachment?')) {
        try {
            const token = localStorage.getItem('authToken');
            const baseUrl = env.SERVER_BASE_URL || env.API_BASE_URL || '';
            
            // Only attempt server delete if we have a valid ID (not a temp one)
            if (id && !id.toString().startsWith('temp-')) {
                await fetch(`${baseUrl}/api/attachments/${id}`, {
                    method: 'DELETE',
                    headers: { 
                        'Authorization': token ? `Bearer ${token}` : ''
                    }
                });
            }
            deleteNode();
        } catch (error) {
            console.error('Failed to delete attachment', error);
            alert('Failed to delete attachment');
        }
    }
  };

  const handleClick = async (e) => {
    if (uploading) return;
    e.preventDefault();
    
    // Construct download URL
    // Use API_BASE_URL which already includes /api
    const downloadUrl = `${env.API_BASE_URL}/attachments/${id}`;
    
    // If we have a token, we need to fetch with auth headers and create a blob URL
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        const response = await fetch(downloadUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename; // Use the filename from props
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (error) {
        console.error('Error downloading file:', error);
        // Fallback to direct open if fetch fails (might still fail if auth required)
        window.open(downloadUrl, '_blank');
      }
    } else {
      // No token, try direct open
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <NodeViewWrapper className="attachment-component">
      <CardContainer 
        onClick={handleClick} 
        contentEditable={false}
        onMouseDown={(e) => {
            // Prevent editor focus when clicking the card
            e.preventDefault();
        }}
      >
        <IconWrapper>
          <Icon name="attachment" size={24} />
        </IconWrapper>
        <InfoWrapper>
          <FileName title={filename}>{filename}</FileName>
          <FileSize>
            {uploading ? 'Uploading...' : (() => {
              const ext = filename && filename.includes('.') ? filename.split('.').pop().toUpperCase() : null;
              return ext ? `${ext} · ${formatBytes(size)}` : formatBytes(size);
            })()}
          </FileSize>
        </InfoWrapper>
        {!uploading && (
          <DeleteButton onClick={handleDelete} title="Delete attachment">
            <Icon name="trash" size={18} />
          </DeleteButton>
        )}
        {uploading && <ProgressBar $progress={progress || 0} />}
      </CardContainer>
    </NodeViewWrapper>
  );
};

export default AttachmentCard;
