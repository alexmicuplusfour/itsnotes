import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import Icon from './Icons';
import Switch from './Switch';
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

const SectionTitle = styled.h4`
  font-size: 16px;
  font-weight: 500;
  margin: 0;
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
    background-color: ${props => props.$primary ? 'var(--primary-hover-color)' : 'var(--menu-item-hover)'};
    border-color: ${props => props.$primary ? 'var(--primary-hover-color)' : 'var(--border-hover-color)'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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

const HiddenFileInput = styled.input`
  display: none;
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

const SystemInfo = styled.div`
  padding: 12px 16px;
  border-radius: 6px;
  background-color: ${props => props.$isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'};
  font-size: 13px;
  color: var(--text-secondary-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
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

const Select = styled.select`
  flex: 1;
  padding: 10px;
  border-radius: 4px;
  background-color: var(--input-bg-color, transparent);
  color: var(--text-color);
  border: 1px solid var(--menu-item-separator-dark);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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

const SmallButton = styled.button`
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid ${props => props.$danger ? 'rgba(244, 67, 54, 0.4)' : 'var(--foreground-color)'};
  color: ${props => props.$danger ? 'rgb(244, 67, 54)' : 'var(--text-color)'};
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;

  &:hover {
    background-color: ${props => props.$danger ? 'rgba(244, 67, 54, 0.08)' : 'var(--menu-item-hover)'};
  }
`;

const EmptyFiles = styled.div`
  font-size: 13px;
  color: var(--text-secondary-color);
  padding: 12px 0;
`;

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (isoString) => new Date(isoString).toLocaleString();

const BackupRestore = ({ isDarkTheme }) => {
  const { isDemoMode, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [status, setStatus] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const fileInputRef = useRef(null);

  const [autoConfig, setAutoConfig] = useState({ enabled: false, intervalHours: '24', retentionCount: '5' });
  const [autoFiles, setAutoFiles] = useState([]);
  const [autoBackupPath, setAutoBackupPath] = useState('');
  const [backingUpNow, setBackingUpNow] = useState(false);

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

  const handleExportBackup = async () => {
    setLoading(true);
    setStatus(null);

    try {
      const response = await api.post('/backup/export', {}, {
        responseType: 'blob'
      });

      const contentDisposition = response.headers['content-disposition'];
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let filename = `itsnotes-backup-${timestamp}.zip`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      setStatus({ type: 'success', message: 'Backup downloaded successfully!' });
    } catch (error) {
      console.error('Error exporting backup:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to export backup'
      });
    } finally {
      setLoading(false);
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

    setRestoring(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('backup', file);

      await api.post('/backup/restore', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setStatus({ type: 'success', message: 'Backup restored successfully! Please refresh the page.' });

      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('Error restoring backup:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to restore backup'
      });
    } finally {
      setRestoring(false);
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
      setStatus({ type: 'success', message: 'Reset complete. Reloading...' });
      // The reset wiped the user account and rotated the JWT secret, so this
      // session is dead — drop the stored token before reloading so we land on
      // the setup screen instead of a broken authenticated state.
      await logout();
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error resetting:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.error || 'Failed to reset'
      });
    } finally {
      setResetting(false);
    }
  };

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

      {/* Auto Backup */}
      <Section>
        <SectionTitle>Auto Backup</SectionTitle>
        <Description>
          Automatically back up your database and uploads on a schedule. Old backups beyond the retention limit are deleted automatically.
        </Description>

        <ToggleRow>
          <ToggleLabel>Enable auto backup</ToggleLabel>
          <Switch
            checked={autoConfig.enabled}
            onChange={handleAutoToggle}
          />
        </ToggleRow>

        {autoConfig.enabled && (
          <ConfigGrid>
            <ConfigRow>
              <ConfigLabel>Interval</ConfigLabel>
              <Select value={autoConfig.intervalHours} onChange={handleIntervalChange}>
                <option value="6">Every 6 hours</option>
                <option value="12">Every 12 hours</option>
                <option value="24">Daily</option>
                <option value="48">Every 2 days</option>
                <option value="168">Weekly</option>
              </Select>
            </ConfigRow>
            <ConfigRow>
              <ConfigLabel>Keep last</ConfigLabel>
              <Select value={autoConfig.retentionCount} onChange={handleRetentionChange}>
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
            disabled={isDemoMode || backingUpNow || (systemInfo && !systemInfo.available)}
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
                    <SmallButton onClick={() => handleDownloadAutoBackup(file.filename)}>
                      Download
                    </SmallButton>
                    <SmallButton $danger onClick={() => handleDeleteAutoBackup(file.filename)}>
                      Delete
                    </SmallButton>
                  </FileActions>
                </FileRow>
              ))}
            </FileList>
          </>
        ) : (
          <EmptyFiles>No backups yet</EmptyFiles>
        )}
      </Section>

      <Divider />

      {/* Manual Export / Restore / System Info */}
      <Section>
        <SectionTitle>Database Backup & Restore</SectionTitle>
        <Description>
          Create a complete backup of your database and uploaded files, or restore from a previous backup.
          This includes all notes, tags, attachments, settings, and other data.
        </Description>

        {systemInfo && !systemInfo.available && (
          <WarningBox $isDark={isDarkTheme}>
            <WarningIcon>
              <Icon name="help" size={20} />
            </WarningIcon>
            <div>
              <strong>PostgreSQL tools not available.</strong> The backup/restore functionality requires
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

        {systemInfo && (
          <SystemInfo $isDark={isDarkTheme}>
            <div><strong>Mode:</strong> {systemInfo.mode === 'docker' ? `Docker (${systemInfo.dockerContainer})` : 'Local'}</div>
            <div><strong>Database:</strong> {systemInfo.database}</div>
            <div><strong>Host:</strong> {systemInfo.host}:{systemInfo.port}</div>
            <div><strong>pg_dump:</strong> {systemInfo.pgDumpAvailable ? '✓ Available' : '✗ Not available'}</div>
            <div><strong>psql:</strong> {systemInfo.psqlAvailable ? '✓ Available' : '✗ Not available'}</div>
          </SystemInfo>
        )}
      </Section>

      <Section>
        <SectionTitle>Export Backup</SectionTitle>
        <Description>
          Download a zip archive containing a full database dump and your uploads folder. Store this file in a safe location.
        </Description>
        <ButtonGroup>
          <Button
            onClick={handleExportBackup}
            disabled={isDemoMode || loading || restoring || (systemInfo && !systemInfo.available)}
            $primary
          >
            {loading ? (
              <>
                <LoadingSpinner />
                Exporting...
              </>
            ) : (
              <>
                Export Backup
              </>
            )}
          </Button>
        </ButtonGroup>
      </Section>

      <Section>
        <SectionTitle>Restore Backup</SectionTitle>
        <Description>
          Restore from a previous backup zip (.zip). This will replace all current database data and uploaded files.
        </Description>
        <WarningBox $isDark={isDarkTheme}>
          <WarningIcon>
            <Icon name="help" size={20} />
          </WarningIcon>
          <div>
            <strong>Warning:</strong> Restoring a backup will completely replace all data in your database and uploads folder.
            Make sure to export a current backup before proceeding.
          </div>
        </WarningBox>
        <ButtonGroup>
          <Button
            onClick={handleImportBackup}
            disabled={isDemoMode || loading || restoring || (systemInfo && !systemInfo.available)}
          >
            {restoring ? (
              <>
                <LoadingSpinner />
                Restoring...
              </>
            ) : (
              <>
                Restore Backup ...
              </>
            )}
          </Button>
        </ButtonGroup>
        <HiddenFileInput
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
        />
      </Section>

      <Section>
        <SectionTitle>Reset</SectionTitle>
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
        <ButtonGroup>
          <Button
            onClick={handleReset}
            disabled={isDemoMode || loading || restoring || resetting}
            style={{ borderColor: 'rgba(244, 67, 54, 0.5)', color: 'rgb(244, 67, 54)' }}
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
        </ButtonGroup>
      </Section>

      {status && (
        <StatusMessage $error={status.type === 'error'}>
          <Icon
            name={status.type === 'error' ? 'close' : 'check'}
            size={18}
          />
          {status.message}
        </StatusMessage>
      )}
    </Container>
  );
};

export default BackupRestore;
