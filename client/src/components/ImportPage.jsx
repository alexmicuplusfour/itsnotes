import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import env from '../../env.js';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ImportPage.css';

function ImportPage() {
  const { token } = useAuth();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const eventSourceRef = useRef(null);
  const navigate = useNavigate();

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    if (selectedFile) {
      if (selectedFile.name.endsWith('.zip')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setFile(null);
        setError('Please select a valid Google Takeout zip file (.zip)');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file first');
      return;
    }

    // Check file size for user warning
    if (file.size > 100 * 1024 * 1024) { // Greater than 100MB
      const confirmLargeUpload = window.confirm(
        `You're uploading a large file (${Math.round(file.size / (1024 * 1024))}MB). ` +
        `This may take several minutes to process. Please keep the browser tab open until the import completes. Continue?`
      );
      
      if (!confirmLargeUpload) {
        return;
      }
    }

    // Reset states
    setUploading(true);
    setError(null);
    setSuccess(null);
    setStatus('Preparing upload...');
    setImportResult(null);
    setProgress({ current: 0, total: 0, percent: 0 });

    // Close any existing event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const formData = new FormData();
    formData.append('archive', file);

    try {
      // For large files, we'll use XMLHttpRequest for better control
      const xhr = new XMLHttpRequest();
      const uploadPromise = new Promise((resolve, reject) => {
        // Set timeout to 1 hour
        xhr.timeout = 3600000;
        xhr.open('POST', `${env.API_BASE_URL}/import`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        
        // Set up event listeners for the XHR
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              // First check if we already received an SSE response in xhr.responseText
              if (xhr.responseText && xhr.responseText.includes('data:')) {
                // Process any SSE data received directly
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
              
              // Continue processing server-sent events
              setStatus('Processing notes...');
              resolve();
            } catch (err) {
              console.error('Error processing response', err);
              reject(new Error('Error processing server response'));
            }
          } else {
            // Handle HTTP errors
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
        
        // Add error handling for the 413 entity too large error specifically
        if (xhr.upload) {
          xhr.upload.onerror = function() {
            if (xhr.status === 413) {
              reject(new Error('File too large for server to accept. Please contact the administrator.'));
            }
          };
        }
        
        // Send the file
        xhr.send(formData);
      });
      
      // Helper function to process server events
      const processServerEvent = (data) => {
        console.log('Server event:', data);
        
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
      
      // Wait for upload to complete
      await uploadPromise;
      
      // Set up EventSource for ongoing progress updates
      try {
        // Use a unique URL to avoid caching issues
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
          // Don't set error if we're still processing
          if (uploading) {
            setStatus('Connection to server lost. The import may still be processing in the background.');
          }
        };
      } catch (esError) {
        console.error('Error setting up EventSource:', esError);
        // Continue without live updates if EventSource fails
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
      
      // Add helpful troubleshooting info for specific errors
      if (errorMessage.includes('413') || errorMessage.includes('too large')) {
        errorMessage += `. Try using a smaller file or contact the administrator to increase the file size limit.`;
      }
      
      setError(errorMessage);
      setUploading(false);
    }
  };

  // Close the import panel and go back to the main page
  const handleClose = () => {
    // If an upload is in progress, confirm with the user
    if (uploading) {
      const confirmClose = window.confirm(
        "Import is in progress. Leaving this page will cancel the import. Continue?"
      );
      if (!confirmClose) return;
      
      // Close event source if it's open
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    }
    
    navigate('/');
  };
  
  return (
    <>
      <div className="import-overlay" onClick={handleClose}></div>
      <div className="import-page">
        <div className="import-header">
          <h1>Import from Google Keep</h1>
          <button className="close-button" onClick={handleClose}>×</button>
        </div>
        
        <div className="import-instructions">
          <h2>Instructions</h2>
          <ol>
            <li>Go to <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout</a></li>
            <li>Select only "Keep" from the list of Google products</li>
            <li>Click "Next step" and choose your export preferences</li>
            <li>Click "Create export" and wait for the export to be created</li>
            <li>Download the export file (it will be a .zip file)</li>
            <li>Upload the .zip file below</li>
          </ol>
        </div>
      
      <form onSubmit={handleSubmit} className="import-form">
        <div className="file-input-container">
          <label htmlFor="file-upload" className="file-input-label">
            {file ? file.name : 'Choose File'}
          </label>
          <input
            type="file"
            id="file-upload"
            accept=".zip"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </div>
        
        <button 
          type="submit" 
          className="import-button"
          disabled={!file || uploading}
        >
          {uploading ? 'Importing...' : 'Import Notes'}
        </button>
      </form>
      
      {/* Status and Progress Indicators */}
      {uploading && (
        <div className="import-progress">
          <h3>Import Progress</h3>
          
          {/* Status message */}
          {status && <p className="status-message">{status}</p>}
          
          {/* Progress bar */}
          {progress.total > 0 && (
            <div className="progress-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="progress-text">
                {`${progress.current} of ${progress.total} notes (${progress.percent}%)`}
              </div>
            </div>
          )}
          
          <p className="import-note">Please keep this window open until the import completes. Large imports may take several minutes.</p>
        </div>
      )}
      
      {error && (
        <div className="import-error">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}
      
      {success && (
        <div className="import-success">
          <h3>Success</h3>
          <p>{success}</p>
          
          {importResult && (
            <div className="import-results">
              <h4>Import Summary</h4>
              <ul>
                <li>Total notes processed: {importResult.total}</li>
                <li>Successfully imported: {importResult.successful}</li>
                <li>Tags/labels imported: {importResult.labelsImported}</li>
                <li>Failed imports: {importResult.failed}</li>
              </ul>
              
              {importResult.failures && importResult.failures.length > 0 && (
                <>
                  <h4>Failed Imports</h4>
                  <ul className="failures-list">
                    {importResult.failures.slice(0, 50).map((failure, index) => (
                      <li key={index}>
                        {failure.file}: {failure.error}
                      </li>
                    ))}
                    {importResult.failures.length > 50 && (
                      <li>... and {importResult.failures.length - 50} more failures (check browser console for details)</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}

export default ImportPage;
