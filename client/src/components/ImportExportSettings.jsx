import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import Icon from './Icons';
import ThemeManager from '../utils/ThemeManager';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Section = styled.div`
  margin-bottom: 20px;
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  margin-bottom: 10px;
  padding-bottom: 10px;
`;

const Instructions = styled.div`
  border-radius: 6px;
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background-color: ${props => props.$isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'};
  margin-bottom: 12px;

  ol {
    padding-left: 16px;
    margin: 10px 0 0 0;
  }

  li {
    margin-bottom: 6px;
  }

  li::marker {
    color: var(--text-secondary-color);
  }

  a {
    color: var(--link);
    text-decoration: none;
    font-weight: 500;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 6px;
  border: 1px solid var(--foreground-color);
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--menu-item-hover);
    border-color: var(--border-hover-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ProgressBarContainer = styled.div`
  margin-top: 20px;
  background-color: var(--secondary-bg-color);
  border-radius: 4px;
  height: 20px;
  overflow: hidden;
`;

const ProgressBarFill = styled.div`
  height: 100%;
  background-color: var(--primary-color);
  transition: width 0.3s ease;
`;

const StatusMessage = styled.div`
  margin-top: 10px;
  font-size: 14px;
  color: var(--text-secondary-color);
`;

const ErrorMessage = styled.div`
  margin-top: 16px;
  padding: 12px;
  background-color: rgba(255, 0, 0, 0.1);
  border: 1px solid rgba(255, 0, 0, 0.2);
  border-radius: 4px;
  color: #d32f2f;
  font-size: 14px;
`;

const SuccessMessage = styled.div`
  margin-top: 16px;
  padding: 12px;
  background-color: rgba(0, 255, 0, 0.1);
  border: 1px solid rgba(0, 255, 0, 0.2);
  border-radius: 4px;
  color: #2e7d32;
  font-size: 14px;
`;

const ResultsList = styled.ul`
  margin-top: 10px;
  padding-left: 20px;
  font-size: 13px;
`;

const ImportExportSettings = () => {
  const { token, isDemoMode } = useAuth();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const eventSourceRef = useRef(null);
  const [isDarkTheme, setIsDarkTheme] = useState(ThemeManager.getTheme());

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    // Reset file input for future selections
    e.target.value = '';
    
    if (!selectedFile.name.endsWith('.zip')) {
      setError('Please select a valid Google Takeout zip file (.zip)');
      return;
    }

    if (selectedFile.size > 100 * 1024 * 1024) {
      const confirmLargeUpload = window.confirm(
        `You're uploading a large file (${Math.round(selectedFile.size / (1024 * 1024))}MB). ` +
        `This may take several minutes to process. Please keep the browser tab open until the import completes. Continue?`
      );
      
      if (!confirmLargeUpload) {
        return;
      }
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setStatus('Preparing upload...');
    setImportResult(null);
    setProgress({ current: 0, total: 0, percent: 0 });

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const formData = new FormData();
    formData.append('archive', selectedFile);

    try {
      const xhr = new XMLHttpRequest();
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.timeout = 3600000; // 1 hour
        xhr.open('POST', '/api/import', true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              if (xhr.responseText && xhr.responseText.includes('data:')) {
                const lines = xhr.responseText.split('\n\n');
                for (const line of lines) {
                  if (line.startsWith('data:')) {
                    try {
                      const jsonData = JSON.parse(line.substring(5));
                      processServerEvent(jsonData);
                    } catch (e) {
                      console.error('Error parsing SSE data', e);
                    }
                  }
                }
              }
              setStatus('Processing notes...');
              resolve();
            } catch (err) {
              console.error('Error processing response', err);
              reject(new Error('Error processing server response'));
            }
          } else {
            const errorMsg = xhr.statusText || `Server responded with status: ${xhr.status}`;
            reject(new Error(errorMsg));
          }
        };
        
        xhr.onerror = function() {
          reject(new Error('Network error occurred'));
        };
        
        xhr.ontimeout = function() {
          reject(new Error('Request timed out. The server might still be processing the import.'));
        };
        
        xhr.upload.onprogress = function(event) {
          if (event.lengthComputable) {
            const uploadPercent = Math.round((event.loaded / event.total) * 100);
            setStatus(`Uploading: ${uploadPercent}%`);
          }
        };
        
        if (xhr.upload) {
          xhr.upload.onerror = function() {
            if (xhr.status === 413) {
              reject(new Error('File too large for server to accept. Please contact the administrator.'));
            }
          };
        }
        
        xhr.send(formData);
      });
      
      const processServerEvent = (data) => {
        switch(data.event) {
          case 'status':
            setStatus(data.data.message);
            break;
          case 'progress':
            setProgress(data.data);
            break;
          case 'complete':
            setSuccess(data.data.message);
            setImportResult(data.data.result);
            setUploading(false);
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
            }
            break;
          case 'error':
            setError(data.data.message);
            setUploading(false);
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
            }
            break;
          default:
            console.log('Unknown event type:', data.event);
        }
      };
      
      await uploadPromise;
      
      try {
        const es = new EventSource(`/api/import/stream?t=${Date.now()}`);
        eventSourceRef.current = es;
        
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            processServerEvent(data);
          } catch (e) {
            console.error('Error parsing SSE message', e);
          }
        };
        
        es.onerror = (err) => {
          console.error('EventSource error:', err);
          if (uploading) {
            setStatus('Connection to server lost. The import may still be processing in the background.');
          }
        };
      } catch (esError) {
        console.error('Error setting up EventSource:', esError);
        setStatus('Processing import (live updates unavailable)...');
      }
      
    } catch (err) {
      console.error('Import error:', err);
      let errorMessage = 'An error occurred during import';
      
      if (err.response && err.response.data && err.response.data.error) {
        errorMessage = err.response.data.error;
        if (err.response.data.details) {
          errorMessage += `: ${err.response.data.details}`;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      if (errorMessage.includes('413') || errorMessage.includes('too large')) {
        errorMessage += `. Try using a smaller file or contact the administrator to increase the file size limit.`;
      }
      
      setError(errorMessage);
      setUploading(false);
    }
  };

  return (
    <Container>
      <Section>
        <SectionTitle>Import from Google Keep</SectionTitle>
        <Instructions $isDark={isDarkTheme}>
          <strong>Instructions:</strong>
          <ol>
            <li>Go to <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout</a></li>
            <li>Select only "Keep" from the list of Google products</li>
            <li>Click "Next step" and choose your export preferences</li>
            <li>Click "Create export" and wait for the export to be created</li>
            <li>Download the export file (it will be a .zip file)</li>
            <li>Click "Import from Takeout" below and select the .zip file</li>
          </ol>
        </Instructions>

        <HiddenInput
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          disabled={uploading}
        />
        
        <ButtonGroup>
          <Button 
            type="button"
            onClick={handleImportClick}
            disabled={isDemoMode || uploading}
          >
            {uploading ? 'Importing...' : 'Import from Takeout ...'}
          </Button>
        </ButtonGroup>

        {uploading && (
          <div>
            <StatusMessage>{status}</StatusMessage>
            {progress.total > 0 && (
              <>
                <ProgressBarContainer>
                  <ProgressBarFill style={{ width: `${progress.percent}%` }} />
                </ProgressBarContainer>
                <StatusMessage>
                  {`${progress.current} of ${progress.total} notes (${progress.percent}%)`}
                </StatusMessage>
              </>
            )}
            <StatusMessage style={{ fontSize: '12px', marginTop: '5px' }}>
              Please keep this window open until the import completes. Large imports may take several minutes.
            </StatusMessage>
          </div>
        )}

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {success && (
          <SuccessMessage>
            <strong>{success}</strong>
            {importResult && (
              <ResultsList>
                <li>Total notes processed: {importResult.total}</li>
                <li>Successfully imported: {importResult.successful}</li>
                <li>Tags/labels imported: {importResult.labelsImported}</li>
                <li>Failed imports: {importResult.failed}</li>
              </ResultsList>
            )}
          </SuccessMessage>
        )}
      </Section>
    </Container>
  );
};

export default ImportExportSettings;
