import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notesApi } from '../services/api';
import { composeSharedNote } from '../utils/shareToNote';

// Landing page for the PWA share target (/share?title=&text=&url=). Creates the
// note through the normal API and jumps into it. Rendered from App.jsx before
// the main provider tree mounts — it only needs auth and the API client.

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'var(--background-color)',
    color: 'var(--text-color)',
    fontFamily: "'Product Sans', Arial, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    textAlign: 'center',
  },
  headline: {
    fontSize: '18px',
  },
  detail: {
    fontSize: '14px',
    color: 'var(--text-secondary-color)',
  },
  preview: {
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: '40vh',
    overflowY: 'auto',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    fontSize: '14px',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '10px 20px',
    borderRadius: '20px',
    border: 'none',
    background: 'var(--accent-color)',
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: '14px',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '10px 20px',
    borderRadius: '20px',
    border: '1px solid var(--border-color)',
    background: 'transparent',
    color: 'var(--text-color)',
    fontSize: '14px',
    cursor: 'pointer',
  },
};

const SharePage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('saving'); // 'saving' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const startedRef = useRef(false);

  // Read the params once and keep them; retries reuse the same values.
  const sharedRef = useRef(null);
  if (sharedRef.current === null) {
    const params = new URLSearchParams(window.location.search);
    sharedRef.current = {
      title: params.get('title') || '',
      text: params.get('text') || '',
      url: params.get('url') || '',
    };
  }

  const save = useCallback(async () => {
    const { title, content, isEmpty } = composeSharedNote(sharedRef.current);
    if (isEmpty) {
      navigate('/', { replace: true });
      return;
    }
    setStatus('saving');
    try {
      const data = await notesApi.createNote({ title, content });
      const id = data?.note?.id;
      console.log('[SharePage] Created note from share:', id);
      // replace: going back or refreshing from the note must not re-create it
      navigate(id ? `/?note=${id}` : '/', { replace: true });
    } catch (error) {
      console.error('[SharePage] Failed to save shared note:', error);
      setErrorMessage(error?.response?.data?.message || error?.message || '');
      setStatus('error');
    }
  }, [navigate]);

  useEffect(() => {
    if (startedRef.current) return; // StrictMode/re-renders must not double-create
    startedRef.current = true;
    save();
  }, [save]);

  const shared = sharedRef.current;
  const sharedPreview = [shared.title, shared.text, shared.url].filter(Boolean).join('\n');

  return (
    <div style={styles.page}>
      {status === 'saving' ? (
        <div style={styles.card}>
          <div style={styles.headline}>Saving to itsnotes…</div>
        </div>
      ) : (
        <div style={styles.card}>
          <div style={styles.headline}>Couldn't save the shared note</div>
          {errorMessage && <div style={styles.detail}>{errorMessage}</div>}
          {/* Keep the shared content on screen so it can't get lost */}
          {sharedPreview && <div style={styles.preview}>{sharedPreview}</div>}
          <div style={styles.buttonRow}>
            <button style={styles.primaryButton} onClick={save}>Retry</button>
            <button style={styles.secondaryButton} onClick={() => navigate('/', { replace: true })}>
              Open itsnotes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharePage;
