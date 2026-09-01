import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import ThemeManager from '../utils/ThemeManager';
import { Button } from './settings/styles';
import { useToast } from '../contexts/ToastContext';
import env from '../../env.js';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Section = styled.div``;

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

const LoadingSpinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-color);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
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
  const { showToast, hideToast } = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [isDarkTheme] = useState(ThemeManager.getTheme());

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    e.target.value = '';

    if (!selectedFile.name.endsWith('.zip')) {
      setError('Please select a valid Google Takeout zip file (.zip)');
      return;
    }

    if (selectedFile.size > 100 * 1024 * 1024) {
      const ok = window.confirm(
        `You're uploading a large file (${Math.round(selectedFile.size / (1024 * 1024))}MB). ` +
        `This may take several minutes to process. Please keep the browser tab open until the import completes. Continue?`
      );
      if (!ok) return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setStatus('Preparing upload...');
    setImportResult(null);
    setProgress({ current: 0, total: 0, percent: 0 });

    const TOAST_ID = 'keep-import';
    showToast('Importing from Google Keep…', { id: TOAST_ID, loading: true });

    const processServerEvent = (data) => {
      switch (data.event) {
        case 'status':
          setStatus(data.data.message);
          break;
        case 'progress':
          setProgress(data.data);
          showToast(`Importing… ${data.data.percent}%`, { id: TOAST_ID, loading: true });
          break;
        case 'complete': {
          const r = data.data.result;
          const summary = r ? `${r.successful} note${r.successful !== 1 ? 's' : ''} imported` : 'Import complete';
          showToast(summary, { id: TOAST_ID, variant: 'success', duration: 'long' });
          setSuccess(data.data.message);
          setImportResult(r);
          setUploading(false);
          setTimeout(() => window.location.reload(), 2000);
          break;
        }
        case 'error':
          showToast(data.data.message, { id: TOAST_ID, variant: 'error', duration: 'long' });
          setError(data.data.message);
          setUploading(false);
          break;
      }
    };

    const parseChunk = (chunk) => {
      for (const eventStr of chunk.split('\n\n')) {
        const trimmed = eventStr.trim();
        if (trimmed.startsWith('data:')) {
          try {
            processServerEvent(JSON.parse(trimmed.slice(5).trim()));
          } catch (_) {}
        }
      }
    };

    const formData = new FormData();
    formData.append('archive', selectedFile);

    try {
      await new Promise((resolve, reject) => {
        let lastIndex = 0;
        const xhr = new XMLHttpRequest();
        xhr.timeout = 3600000;
        xhr.open('POST', `${env.API_BASE_URL}/import`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.onprogress = function () {
          const chunk = xhr.responseText.slice(lastIndex);
          lastIndex = xhr.responseText.length;
          parseChunk(chunk);
        };

        xhr.onload = function () {
          const remaining = xhr.responseText.slice(lastIndex);
          if (remaining) parseChunk(remaining);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(xhr.statusText || `Server error: ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network error occurred'));
        xhr.ontimeout = () => reject(new Error('Request timed out. The server might still be processing the import.'));

        xhr.upload.onprogress = function (event) {
          if (event.lengthComputable) {
            setStatus(`Uploading: ${Math.round((event.loaded / event.total) * 100)}%`);
          }
        };

        xhr.send(formData);
      });
    } catch (err) {
      let errorMessage = err.message || 'An error occurred during import';
      if (errorMessage.includes('413') || errorMessage.includes('too large')) {
        errorMessage += '. Try using a smaller file or contact the administrator to increase the file size limit.';
      }
      showToast(errorMessage, { id: 'keep-import', variant: 'error', duration: 'long' });
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
            {uploading ? (
              <>
                <LoadingSpinner />
                Importing...
              </>
            ) : (
              'Import from Takeout ...'
            )}
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
                  {progress.current} of {progress.total} notes ({progress.percent}%)
                </StatusMessage>
              </>
            )}
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
                {importResult.imagesImported > 0 && (
                  <li>Images imported: {importResult.imagesImported}</li>
                )}
                {importResult.attachmentsImported > 0 && (
                  <li>Other attachments imported: {importResult.attachmentsImported}</li>
                )}
                <li>Failed imports: {importResult.failed}</li>
              </ResultsList>
            )}
            <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.8 }}>
              Reloading in a few seconds to show your imported notes...
            </div>
          </SuccessMessage>
        )}
      </Section>
    </Container>
  );
};

export default ImportExportSettings;
