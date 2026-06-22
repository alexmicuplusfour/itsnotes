import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import api, { API_URL } from '../services/api';
import Icon from './Icons';
import Switch from './Switch';
import { Button, SectionTitle, Select as BaseSelect } from './settings/styles';
import { useAuth } from '../contexts/AuthContext';

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

      <Section>
        <SectionHeader>
          <SectionTitle>Reset</SectionTitle>
          <Button
            onClick={handleReset}
            disabled={isDemoMode || busy}
            $color="danger"
            style={{ width: 'auto', whiteSpace: 'nowrap' }}
          >
            {resetting ? (
              <>
                <LoadingSpinner />
                Resetting...
              </>
            ) : (
              <>
                Reset Everything
              </>
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

        {status && status.section === 'reset' && (
          <StatusMessage $error={status.type === 'error'}>
            <Icon
              name={status.type === 'error' ? 'close' : 'check'}
              size={18}
            />
            {status.message}
          </StatusMessage>
        )}
      </Section>
    </Container>
  );
};

export default BackupRestore;
