import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import api, { API_URL } from '../services/api';
import Icon from './Icons';
import Switch from './Switch';
import { Button, SectionTitle, Select as BaseSelect } from './settings/styles';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNotes } from '../contexts/NotesContext';

// ---- Obsidian import styled components ----
const ProgressBar = styled.div`
  height: 6px;
  border-radius: 3px;
  background-color: var(--border-color);
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  border-radius: 3px;
  background-color: var(--accent-color, #4caf50);
  transition: width 0.3s ease;
  width: ${props => props.$percent || 0}%;
`;

const ProgressText = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
  margin-top: 4px;
`;

const SummaryList = styled.ul`
  margin: 8px 0 0;
  padding: 0 0 0 18px;
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.8;
`;

const FileInputRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const FileChip = styled.span`
  font-size: 13px;
  color: var(--text-secondary-color);
  padding: 3px 10px;
  border-radius: 12px;
  background-color: var(--search-bg-color);
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const Description = styled.p`
  font-size: 14px;
  color: var(--text-secondary-color);
  margin: 0;
  line-height: 1.5;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const DemoNotice = styled.div`
  padding: 12px 16px;
  border-radius: 6px;
  background-color: rgba(33, 150, 243, 0.08);
  border: 1px solid rgba(33, 150, 243, 0.3);
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const DemoNoticeIcon = styled.div`
  color: #2196f3;
  flex-shrink: 0;
  margin-top: 2px;
`;

const WarningBox = styled.div`
  padding: 12px 16px;
  border-radius: 6px;
  background-color: ${props => props.$isDark ? 'rgba(255, 193, 7, 0.1)' : 'rgba(255, 193, 7, 0.1)'};
  border: 1px solid rgba(255, 193, 7, 0.3);
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const WarningIcon = styled.div`
  color: #ffc107;
  flex-shrink: 0;
  margin-top: 2px;
`;

const StatusMessage = styled.div`
  padding: 10px 14px;
  border-radius: 6px;
  background-color: ${props => props.$error ? 'rgba(244, 67, 54, 0.1)' : 'rgba(76, 175, 80, 0.1)'};
  border: 1px solid ${props => props.$error ? 'rgba(244, 67, 54, 0.3)' : 'rgba(76, 175, 80, 0.3)'};
  color: var(--text-color);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
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

const Divider = styled.div`
  height: 1px;
  background-color: var(--border-color);
`;

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
`;

const ToggleLabel = styled.span`
  font-size: 14px;
  color: var(--text-color);
`;

const ConfigGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ConfigRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const ConfigLabel = styled.label`
  font-size: 14px;
  color: var(--text-secondary-color);
  min-width: 70px;
`;

const Select = styled(BaseSelect)`
  flex: 1;
  width: auto;
`;

const PathRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary-color);
`;

const PathValue = styled.code`
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  background-color: var(--search-bg-color);
  color: var(--text-color);
  word-break: break-all;
`;

const FileListHeader = styled.div`
  font-size: 13px;
  color: var(--text-secondary-color);
  font-weight: 500;
`;

const FileList = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
`;

const FileRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  gap: 12px;

  & + & {
    border-top: 1px solid var(--border-color);
  }
`;

const FileInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const FileName = styled.span`
  font-size: 13px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FileMeta = styled.span`
  font-size: 12px;
  color: var(--text-secondary-color);
`;

const FileActions = styled.div`
  display: flex;
  gap: 6px;
  flex-shrink: 0;
`;

const EmptyFiles = styled.div`
  font-size: 13px;
  color: var(--text-secondary-color);
  padding: 12px 0;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const RestoreLink = styled.button`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--text-secondary-color);
  cursor: pointer;
  text-decoration: underline;

  &:hover:not(:disabled) {
    color: var(--text-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (isoString) => new Date(isoString).toLocaleString();

const BackupRestore = ({ isDarkTheme }) => {
  const { isDemoMode, logout } = useAuth();
  const { showToast, hideToast } = useToast();
  const { loadNotes } = useNotes();
  const [restoring, setRestoring] = useState(false);
  const [restoringFile, setRestoringFile] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);

  const [autoConfig, setAutoConfig] = useState({ enabled: false, intervalHours: '24', retentionCount: '5' });
  const [autoFiles, setAutoFiles] = useState([]);
  const [autoBackupPath, setAutoBackupPath] = useState('');
  const [backingUpNow, setBackingUpNow] = useState(false);
  const fileInputRef = useRef(null);

  // Obsidian import state
  const [obsidianFiles, setObsidianFiles] = useState([]);
  const [obsidianImporting, setObsidianImporting] = useState(false);
  const [obsidianStatusMsg, setObsidianStatusMsg] = useState('');
  const [obsidianProgress, setObsidianProgress] = useState(null); // { current, total, percent }
  const [obsidianResult, setObsidianResult] = useState(null); // success result
  const [obsidianError, setObsidianError] = useState(null);
  const obsidianInputRef = useRef(null);

  useEffect(() => {
    fetchSystemInfo();
    fetchAutoConfig();
    fetchAutoFiles();
  }, []);

  const fetchSystemInfo = async () => {
    try {
      const response = await api.get('/backup/info');
      setSystemInfo(response.data);
    } catch (error) {
      console.error('Error fetching backup system info:', error);
    }
  };

  const fetchAutoConfig = async () => {
    try {
      const response = await api.get('/settings');
      const s = response.data;
      setAutoConfig({
        enabled: s.AUTO_BACKUP_ENABLED === 'true',
        intervalHours: s.AUTO_BACKUP_INTERVAL_HOURS || '24',
        retentionCount: s.AUTO_BACKUP_RETENTION_COUNT || '5'
      });
    } catch (error) {
      console.error('Error fetching auto-backup config:', error);
    }
  };

  const fetchAutoFiles = async () => {
    try {
      const response = await api.get('/backup/auto/files');
      setAutoFiles(response.data.files || []);
      setAutoBackupPath(response.data.path || '');
    } catch (error) {
      console.error('Error fetching auto-backup files:', error);
    }
  };

  const saveAutoConfig = async (newConfig) => {
    try {
      await api.post('/settings', {
        AUTO_BACKUP_ENABLED: newConfig.enabled ? 'true' : 'false',
        AUTO_BACKUP_INTERVAL_HOURS: newConfig.intervalHours,
        AUTO_BACKUP_RETENTION_COUNT: newConfig.retentionCount
      });
      setAutoConfig(newConfig);
    } catch (error) {
      console.error('Error saving auto-backup config:', error);
      setStatus({ type: 'error', message: 'Failed to save auto-backup settings' });
    }
  };

  const handleAutoToggle = () => saveAutoConfig({ ...autoConfig, enabled: !autoConfig.enabled });

  const handleIntervalChange = (e) => saveAutoConfig({ ...autoConfig, intervalHours: e.target.value });

  const handleRetentionChange = (e) => saveAutoConfig({ ...autoConfig, retentionCount: e.target.value });

  const handleBackupNow = async () => {
    setBackingUpNow(true);
    setStatus(null);
    try {
      await api.post('/backup/auto/now');
      setStatus({ type: 'success', message: 'Backup complete!' });
      await fetchAutoFiles();
    } catch (error) {
      setStatus({ type: 'error', message: error.response?.data?.error || 'Backup failed' });
    } finally {
      setBackingUpNow(false);
    }
  };

  const handleDownloadAutoBackup = async (filename) => {
    try {
      const response = await api.get(`/backup/auto/download/${encodeURIComponent(filename)}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to download backup' });
    }
  };

  const handleDeleteAutoBackup = async (filename) => {
    if (!window.confirm(`Delete backup ${filename}?`)) return;
    try {
      await api.delete(`/backup/auto/files/${encodeURIComponent(filename)}`);
      await fetchAutoFiles();
    } catch (error) {
      setStatus({ type: 'error', message: 'Failed to delete backup' });
    }
  };

  // Drive a restore request to completion. The server streams whitespace
  // heartbeats while the (potentially long) restore runs, then ends with a
  // single JSON object. We read the stream and apply an idle timeout — abort
  // only if no bytes arrive for a while — rather than a blind total-request
  // timeout that would either give up too early or hang forever.
  const runRestore = async (url, requestBody) => {
    setRestoring(true);
    setStatus(null);
    try {
      const IDLE_TIMEOUT_MS = 120000;
      const controller = new AbortController();
      let idleTimer;
      const resetIdle = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
      };

      let body;
      try {
        const token = localStorage.getItem('authToken');
        resetIdle();
        const response = await fetch(url, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: requestBody,
          signal: controller.signal
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetIdle();
          text += decoder.decode(value, { stream: true });
        }
        body = JSON.parse(text.trim());
      } finally {
        clearTimeout(idleTimer);
      }

      if (!body.ok) {
        throw new Error(body.details || body.error || 'Failed to restore backup');
      }

      setStatus({ type: 'success', message: 'Backup restored successfully! Please refresh the page.' });
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error restoring backup:', error);
      const message = error.name === 'AbortError'
        ? 'Restore timed out — the server stopped responding. Check the server logs; the restore may have partially completed.'
        : error.message || 'Failed to restore backup';
      setStatus({ type: 'error', message });
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreAutoBackup = async (filename) => {
    const confirmed = window.confirm(
      `⚠️ WARNING: This will replace ALL data in your database and uploads folder with the backup "${filename}".\n\n` +
      'This action cannot be undone. Make sure you have a current backup before proceeding.\n\n' +
      'Do you want to continue?'
    );
    if (!confirmed) return;

    setRestoringFile(filename);
    try {
      await runRestore(`${API_URL}/backup/auto/restore/${encodeURIComponent(filename)}`);
    } finally {
      setRestoringFile(null);
    }
  };

  const handleImportBackup = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      setStatus({ type: 'error', message: 'Please select a .zip backup file' });
      event.target.value = '';
      return;
    }

    const confirmed = window.confirm(
      '⚠️ WARNING: This will replace ALL data in your database and uploads folder with the backup.\n\n' +
      'This action cannot be undone. Make sure you have a current backup before proceeding.\n\n' +
      'Do you want to continue?'
    );
    if (!confirmed) {
      event.target.value = '';
      return;
    }

    setRestoringFile('__upload__');
    try {
      const formData = new FormData();
      formData.append('backup', file);
      await runRestore(`${API_URL}/backup/restore`, formData);
    } finally {
      setRestoringFile(null);
      event.target.value = '';
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      '⚠️ WARNING: This will permanently delete ALL data in your database and uploads folder.\n\n' +
      'This action cannot be undone. Export a backup first if you want to keep your data.\n\n' +
      'Are you absolutely sure?'
    );
    if (!confirmed) return;

    setResetting(true);
    setStatus(null);

    try {
      await api.post('/backup/reset');
      setStatus({ type: 'success', message: 'Reset complete. Reloading...', section: 'reset' });
      // The reset wiped the user account and rotated the JWT secret, so this
      // session is dead — drop the stored token before reloading so we land on
      // the setup screen instead of a broken authenticated state.
      await logout();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error resetting:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to reset',
        section: 'reset'
      });
    } finally {
      setResetting(false);
    }
  };

  const handleObsidianFileChange = (e) => {
    const selected = [...(e.target.files || [])];
    setObsidianFiles(selected);
    setObsidianResult(null);
    setObsidianError(null);
    e.target.value = '';
  };

  const handleObsidianImport = async () => {
    if (!obsidianFiles.length) return;
    setObsidianImporting(true);
    setObsidianStatusMsg('Uploading...');
    setObsidianProgress(null);
    setObsidianResult(null);
    setObsidianError(null);

    const toastId = showToast('Importing from Obsidian…', { sticky: true, loading: true, id: 'obsidian-import' });

    try {
      const formData = new FormData();
      const isZip = obsidianFiles.length === 1 && obsidianFiles[0].name.endsWith('.zip');
      if (isZip) {
        formData.append('archive', obsidianFiles[0]);
      } else {
        for (const f of obsidianFiles) formData.append('files', f);
      }

      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/import-obsidian`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const { event, data } = JSON.parse(line.slice(5));
            if (event === 'status') {
              setObsidianStatusMsg(data.message);
            } else if (event === 'progress') {
              setObsidianProgress(data);
              showToast(`Importing… ${data.current} of ${data.total} notes`, { sticky: true, loading: true, id: toastId });
            } else if (event === 'complete') {
              setObsidianResult(data.result);
              setObsidianStatusMsg('');
              hideToast(toastId);
              const r = data.result;
              const summary = `${r.successful} note${r.successful !== 1 ? 's' : ''} imported from Obsidian`;
              showToast(summary, { variant: 'success', duration: 'long' });
              loadNotes(true);
            } else if (event === 'error') {
              setObsidianError(data.message);
              setObsidianStatusMsg('');
              hideToast(toastId);
              showToast(`Import failed: ${data.message}`, { variant: 'error', duration: 'long' });
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      setObsidianError(e.message || 'Import failed');
      hideToast(toastId);
      showToast(`Import failed: ${e.message || 'unknown error'}`, { variant: 'error', duration: 'long' });
    } finally {
      setObsidianImporting(false);
    }
  };

  // While a backup, restore, or reset is in flight, lock down every action in
  // the backup section so the user can't kick off a conflicting operation.
  const busy = restoring || backingUpNow || resetting;
  const unavailable = systemInfo && !systemInfo.available;

  return (
    <Container>
      {isDemoMode && (
        <DemoNotice>
          <DemoNoticeIcon>
            <Icon name="help" size={20} />
          </DemoNoticeIcon>
          <div>
            <strong>Backup features are disabled in demo mode.</strong> The demo resets periodically,
            so backups, restores, and manual resets are not available.
          </div>
        </DemoNotice>
      )}

      {/* Backup */}
      <Section>
        <SectionTitle>Backup</SectionTitle>
        <Description>
          Automatically back up your database and uploads on a schedule. Old backups beyond the retention limit are deleted automatically.
        </Description>

        {systemInfo && !systemInfo.available && (
          <WarningBox $isDark={isDarkTheme}>
            <WarningIcon>
              <Icon name="help" size={20} />
            </WarningIcon>
            <div>
              <strong>PostgreSQL tools not available.</strong> Backup and restore require
              <code style={{ margin: '0 4px', padding: '2px 6px', backgroundColor: 'var(--search-bg-color)', borderRadius: '4px' }}>
                pg_dump
              </code>
              and
              <code style={{ margin: '0 4px', padding: '2px 6px', backgroundColor: 'var(--search-bg-color)', borderRadius: '4px' }}>
                psql
              </code>
              to be installed on the server.
            </div>
          </WarningBox>
        )}

        <ToggleRow>
          <ToggleLabel>Enable Auto Backup</ToggleLabel>
          <Switch
            checked={autoConfig.enabled}
            onChange={handleAutoToggle}
            disabled={isDemoMode || busy}
          />
        </ToggleRow>

        {autoConfig.enabled && (
          <ConfigGrid>
            <ConfigRow>
              <ConfigLabel>Interval</ConfigLabel>
              <Select value={autoConfig.intervalHours} onChange={handleIntervalChange} disabled={isDemoMode || busy}>
                <option value="6">Every 6 hours</option>
                <option value="12">Every 12 hours</option>
                <option value="24">Daily</option>
                <option value="48">Every 2 days</option>
                <option value="168">Weekly</option>
              </Select>
            </ConfigRow>
            <ConfigRow>
              <ConfigLabel>Keep last</ConfigLabel>
              <Select value={autoConfig.retentionCount} onChange={handleRetentionChange} disabled={isDemoMode || busy}>
                <option value="3">3 backups</option>
                <option value="5">5 backups</option>
                <option value="10">10 backups</option>
                <option value="20">20 backups</option>
              </Select>
            </ConfigRow>
          </ConfigGrid>
        )}

        {autoBackupPath && (
          <PathRow>
            <span>Storage path:</span>
            <PathValue>{autoBackupPath}</PathValue>
          </PathRow>
        )}

        <ButtonGroup>
          <Button
            onClick={handleBackupNow}
            disabled={isDemoMode || busy || unavailable}
          >
            {backingUpNow ? (
              <>
                <LoadingSpinner />
                Backing up...
              </>
            ) : (
              'Backup Now'
            )}
          </Button>
        </ButtonGroup>

        {autoFiles.length > 0 ? (
          <>
            <FileListHeader>
              {autoFiles.length} saved backup{autoFiles.length !== 1 ? 's' : ''}
            </FileListHeader>
            <FileList>
              {autoFiles.map(file => (
                <FileRow key={file.filename}>
                  <FileInfo>
                    <FileName title={file.filename}>{file.filename}</FileName>
                    <FileMeta>{formatFileSize(file.size)} · {formatDate(file.createdAt)}</FileMeta>
                  </FileInfo>
                  <FileActions>
                    <Button
                      $size="small"
                      $iconOnly
                      $borderless
                      onClick={() => handleRestoreAutoBackup(file.filename)}
                      disabled={isDemoMode || busy || unavailable}
                      title="Restore"
                      aria-label="Restore"
                    >
                      {restoringFile === file.filename ? <LoadingSpinner /> : <Icon name="restore" size={16} />}
                    </Button>
                    <Button
                      $size="small"
                      $iconOnly
                      $borderless
                      onClick={() => handleDownloadAutoBackup(file.filename)}
                      disabled={busy}
                      title="Download"
                      aria-label="Download"
                    >
                      <Icon name="download" size={16} />
                    </Button>
                    <Button
                      $size="small"
                      $iconOnly
                      $borderless
                      $color="danger"
                      onClick={() => handleDeleteAutoBackup(file.filename)}
                      disabled={busy}
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Icon name="deleteForever" size={16} />
                    </Button>
                  </FileActions>
                </FileRow>
              ))}
            </FileList>
          </>
        ) : (
          <EmptyFiles>No backups yet</EmptyFiles>
        )}

        <RestoreLink
          onClick={handleImportBackup}
          disabled={isDemoMode || busy || unavailable}
        >
          {restoringFile === '__upload__' ? (
            <>
              <LoadingSpinner />
              Restoring…
            </>
          ) : (
            'Restore from a backup file…'
          )}
        </RestoreLink>
        <HiddenFileInput
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
        />

        {status && status.section !== 'reset' && (
          <StatusMessage $error={status.type === 'error'}>
            <Icon
              name={status.type === 'error' ? 'close' : 'check'}
              size={18}
            />
            {status.message}
          </StatusMessage>
        )}
      </Section>

      <Divider />

      {/* Obsidian Import */}
      <Section>
        <SectionTitle>Import from Obsidian</SectionTitle>
        <Description>
          Import notes from an Obsidian vault. Upload a <code style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--search-bg-color)' }}>.zip</code> export of your vault, or select individual <code style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--search-bg-color)' }}>.md</code> files. Frontmatter tags, task lists, highlights, images, and <code style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--search-bg-color)' }}>[[wikilinks]]</code> are all handled.
        </Description>

        <FileInputRow>
          <Button
            onClick={() => obsidianInputRef.current?.click()}
            disabled={isDemoMode || obsidianImporting}
            $size="small"
          >
            Choose files…
          </Button>
          {obsidianFiles.length > 0 && (
            <FileChip title={obsidianFiles.map(f => f.name).join(', ')}>
              {obsidianFiles.length === 1
                ? obsidianFiles[0].name
                : `${obsidianFiles.length} files selected`}
            </FileChip>
          )}
          <HiddenFileInput
            ref={obsidianInputRef}
            type="file"
            accept=".md,.zip"
            multiple
            onChange={handleObsidianFileChange}
          />
        </FileInputRow>

        {obsidianFiles.length > 0 && !obsidianImporting && !obsidianResult && (
          <ButtonGroup>
            <Button
              onClick={handleObsidianImport}
              disabled={isDemoMode}
            >
              Import
            </Button>
          </ButtonGroup>
        )}

        {obsidianImporting && (
          <>
            {obsidianStatusMsg && (
              <StatusMessage>
                <LoadingSpinner />
                {obsidianStatusMsg}
              </StatusMessage>
            )}
            {obsidianProgress && obsidianProgress.total > 0 && (
              <>
                <ProgressBar>
                  <ProgressFill $percent={obsidianProgress.percent} />
                </ProgressBar>
                <ProgressText>
                  {obsidianProgress.current} of {obsidianProgress.total} notes ({obsidianProgress.percent}%)
                </ProgressText>
              </>
            )}
          </>
        )}

        {obsidianResult && (
          <StatusMessage>
            <Icon name="check" size={18} />
            <div>
              Import complete
              <SummaryList>
                <li>{obsidianResult.successful} note{obsidianResult.successful !== 1 ? 's' : ''} imported</li>
                {obsidianResult.tagsImported > 0 && <li>{obsidianResult.tagsImported} tag{obsidianResult.tagsImported !== 1 ? 's' : ''} applied</li>}
                {obsidianResult.imagesImported > 0 && <li>{obsidianResult.imagesImported} image{obsidianResult.imagesImported !== 1 ? 's' : ''} imported</li>}
                {obsidianResult.wikilinksResolved > 0 && <li>{obsidianResult.wikilinksResolved} wikilink{obsidianResult.wikilinksResolved !== 1 ? 's' : ''} resolved</li>}
                {obsidianResult.failed > 0 && <li>{obsidianResult.failed} failed</li>}
              </SummaryList>
            </div>
          </StatusMessage>
        )}

        {obsidianError && (
          <StatusMessage $error>
            <Icon name="close" size={18} />
            {obsidianError}
          </StatusMessage>
        )}
      </Section>

    </Container>
  );
};

export const ResetSection = ({ isDarkTheme }) => {
  const { isDemoMode, logout } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState(null);

  const handleReset = async () => {
    const confirmed = window.confirm(
      '⚠️ WARNING: This will permanently delete ALL data in your database and uploads folder.\n\n' +
      'This action cannot be undone. Export a backup first if you want to keep your data.\n\n' +
      'Are you absolutely sure?'
    );
    if (!confirmed) return;

    setResetting(true);
    setStatus(null);

    try {
      await api.post('/backup/reset');
      setStatus({ type: 'success', message: 'Reset complete. Reloading...' });
      await logout();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error resetting:', error);
      setStatus({ type: 'error', message: error.response?.data?.error || 'Failed to reset' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Divider />
      <Container>
        <Section>
          <SectionHeader>
            <SectionTitle>Reset</SectionTitle>
            <Button
              onClick={handleReset}
              disabled={isDemoMode || resetting}
              $color="danger"
              style={{ width: 'auto', whiteSpace: 'nowrap' }}
            >
              {resetting ? (
                <>
                  <LoadingSpinner />
                  Resetting...
                </>
              ) : (
                'Reset Everything'
              )}
            </Button>
          </SectionHeader>
          <Description>
            Permanently delete all data in the database and uploads folder. This cannot be undone.
          </Description>
          <WarningBox $isDark={isDarkTheme}>
            <WarningIcon>
              <Icon name="help" size={20} />
            </WarningIcon>
            <div>
              <strong>Danger:</strong> This will wipe everything — all notes, tags, attachments, settings, and uploaded files.
              Export a backup first if you want to keep your data.
            </div>
          </WarningBox>

          {status && (
            <StatusMessage $error={status.type === 'error'}>
              <Icon name={status.type === 'error' ? 'close' : 'check'} size={18} />
              {status.message}
            </StatusMessage>
          )}
        </Section>
      </Container>
    </>
  );
};

export default BackupRestore;
