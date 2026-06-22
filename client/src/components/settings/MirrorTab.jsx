import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import api from '../../services/api';
import Switch from '../Switch';
import Icon from '../Icons';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
} from './styles';

const StatusBox = styled.div`
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
`;

const StatusRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: var(--text-secondary-color);

  span:last-child {
    color: var(--text-color);
    text-align: right;
    word-break: break-all;
  }
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary-color);
`;

// Round, borderless action on a direction's title line (sync / import).
const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--foreground-color);
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--menu-item-hover);
    border-color: var(--border-hover-color);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// Title + badge grouped on the left of a direction head.
const HeadLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

// The auto-import toggle row inside the folder → notes section.
const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const Description = styled.p`
  font-size: 14px;
  color: var(--text-secondary-color);
  margin: 0;
`;

// A labelled direction block (notes → folder, or folder → notes), separated from
// the one above it so the two flows read as distinct halves of the mirror.
const Direction = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 18px;
  border-top: 1px solid var(--border-color);
`;

const DirectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const DirectionTitle = styled.h4`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
`;

const Badge = styled.span`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  color: ${(p) => (p.$on ? 'var(--text-color)' : 'var(--text-secondary-color)')};
`;

const Ok = styled.span`
  color: var(--text-color);
`;
const Warn = styled.span`
  color: rgb(244, 67, 54);
`;

const fmtTime = (iso) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'never' : d.toLocaleString();
};

const fmtCountdown = (ms) => {
  if (ms <= 0) return 'due now';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// How often the import side re-checks the folder against the DB while this tab is
// open, so the "folder → notes" status box stays live without a Preview click.
const POLL_MS = 5000;

const MirrorTab = ({ settings, onChange, commit, commitImmediate }) => {
  const enabled = settings.MD_MIRROR_ENABLED === true || settings.MD_MIRROR_ENABLED === 'true';
  const hasPath = !!settings.MD_MIRROR_PATH;
  const autoImport = settings.MD_MIRROR_AUTO_IMPORT === true || settings.MD_MIRROR_AUTO_IMPORT === 'true';

  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sweepArmed = useRef(false);

  // Import side: the preview is now a live, auto-refreshed status rather than a
  // button-triggered dry run. `checking` covers the gap before the first result.
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/mirror/status');
      setStatus(data);
    } catch (err) {
      console.error('Error fetching mirror status:', err);
    }
  }, []);

  // Silent dry run powering the live "folder → notes" box. Reads persisted
  // settings (the path is debounce-saved on edit), so no commit here.
  const refreshPreview = useCallback(async () => {
    if (!enabled || !hasPath) { setPreview(null); return; }
    try {
      const { data } = await api.post('/mirror/import/preview');
      setPreview(data);
    } catch (err) {
      console.error('Error checking import status:', err);
    } finally {
      setChecking(false);
    }
  }, [enabled, hasPath]);

  // Poll both directions while the tab is open and the mirror is on. Pauses when
  // the window is hidden so we don't render the whole library to /dev/null in the
  // background. Unmounts (leaving the tab) stop it entirely.
  useEffect(() => {
    if (!enabled || !hasPath) { setChecking(false); return undefined; }
    setChecking(true);
    refreshStatus();
    refreshPreview();
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshStatus();
      refreshPreview();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [enabled, hasPath, refreshStatus, refreshPreview]);

  // Tick once a second so the export countdown updates live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nextAt = status && status.nextSweepAt ? new Date(status.nextSweepAt).getTime() : null;

  // When the scheduled export time passes, a sweep just ran on the server — pull a
  // fresh status (new countdown target + the sweep's results) once, a beat later.
  useEffect(() => {
    if (nextAt && now >= nextAt && !sweepArmed.current) {
      sweepArmed.current = true;
      setTimeout(() => { sweepArmed.current = false; refreshStatus(); }, 4000);
    }
  }, [now, nextAt, refreshStatus]);

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    try {
      // Persist the latest toggle/path before the server reads them for the sweep.
      await commitImmediate(settings);
      const { data } = await api.post('/mirror/sync');
      if (data && data.status) setStatus(data.status);
      else await refreshStatus();
      refreshPreview();
    } catch (err) {
      console.error('Error running mirror sync:', err);
    } finally {
      setSyncing(false);
    }
  }, [settings, commitImmediate, refreshStatus, refreshPreview]);

  const handleApplyImport = useCallback(async () => {
    setImporting(true);
    try {
      await commitImmediate(settings);
      const { data } = await api.post('/mirror/import/apply');
      setImportResult(data && data.result ? data.result : null);
      if (data && data.status) setStatus(data.status);
      refreshPreview();
    } catch (err) {
      console.error('Error applying import:', err);
    } finally {
      setImporting(false);
    }
  }, [settings, commitImmediate, refreshPreview]);

  const summary = status && status.lastSummary;
  const counts = preview && !preview.skipped ? preview.counts : null;
  const importableCount = counts
    ? counts.edited + counts.created + counts.renamed + counts.conflict
    : 0;
  const folderMissing = preview && preview.skipped && preview.reason === 'no-path';
  const liveBadge = status && status.liveConnected
    ? { on: true, text: 'Live' }
    : { on: false, text: status && status.enabled ? 'Connecting…' : 'Inactive' };

  return (
    <SectionContainer>
      <SectionTitle>Markdown Mirror</SectionTitle>
      <Description>
        Keeps a folder of <code>.md</code> files in sync with your notes. Your notes
        database stays the source of truth: every note is continuously written out as a
        Markdown file with a metadata header (tags, color, reminders, pin/archive/trash
        state), and images/attachments go in <code>_resources/</code>. You can also edit
        the files directly and pull those changes back into your notes.
      </Description>

      <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label style={{ marginBottom: 0 }}>Enable Markdown Mirror</Label>
        <Switch
          id="md-mirror-enabled-toggle"
          checked={enabled}
          onChange={() => commit({ ...settings, MD_MIRROR_ENABLED: !enabled })}
        />
      </FormGroup>

      {enabled && (
        <>
          <FormGroup>
            <Label>Mirror folder</Label>
            <Input
              type="text"
              name="MD_MIRROR_PATH"
              value={settings.MD_MIRROR_PATH || ''}
              onChange={onChange}
              placeholder="/data/notes-mirror"
              autoComplete="off"
            />
            <Hint style={{ marginTop: '6px' }}>
              Absolute path the server can write to (inside the container if self-hosted).
              The folder is created if it doesn’t exist.
            </Hint>
          </FormGroup>

          {/* ── Export: notes → folder (always on) ───────────────────────── */}
          <Direction>
            <DirectionHead>
              <HeadLeft>
                <DirectionTitle>Notes → folder</DirectionTitle>
                <Badge $on={liveBadge.on}>{liveBadge.text}</Badge>
              </HeadLeft>
              <IconButton
                type="button"
                onClick={handleSyncNow}
                disabled={syncing || !hasPath}
                title={syncing ? 'Syncing…' : 'Sync now'}
                aria-label="Sync now"
              >
                <Icon name="refresh" size={18} spin={syncing} />
              </IconButton>
            </DirectionHead>
            <Hint>
              Every note is written out and kept current within seconds; a periodic sweep
              reconciles as a backstop. Use “Sync now” to export everything immediately.
            </Hint>

            <StatusBox>
              <StatusRow>
                <span>Folder</span>
                {status && status.path
                  ? (status.pathExists ? <Ok>{status.path}</Ok> : <Warn>{status.path} (not found)</Warn>)
                  : <Warn>not set</Warn>}
              </StatusRow>
              <StatusRow>
                <span>Files mirrored</span>
                <span>{status ? status.fileCount : '…'}</span>
              </StatusRow>
              <StatusRow>
                <span>Last sync</span>
                <span>{status ? fmtTime(status.lastSweepAt) : '…'}</span>
              </StatusRow>
              <StatusRow>
                <span>Next sync</span>
                <span>{nextAt ? fmtCountdown(nextAt - now) : '…'}</span>
              </StatusRow>
              {summary && (
                <StatusRow>
                  <span>Last sync changes</span>
                  <span>
                    +{summary.created} created, {summary.updated} updated,
                    {' '}{summary.renamed} renamed, {summary.deleted} deleted
                  </span>
                </StatusRow>
              )}
            </StatusBox>
          </Direction>

          {/* ── Import: folder → notes (auto-detected, manual apply) ──────── */}
          <Direction>
            <DirectionHead>
              <HeadLeft>
                <DirectionTitle>Folder → notes</DirectionTitle>
                <Badge $on={importableCount > 0}>
                  {importableCount > 0 ? `${importableCount} to import` : 'Up to date'}
                </Badge>
              </HeadLeft>
              <IconButton
                type="button"
                onClick={handleApplyImport}
                disabled={importing || importableCount === 0}
                title={importing ? 'Importing…' : `Import ${importableCount || 'changes'}`}
                aria-label="Import changes"
              >
                <Icon name={importing ? 'spinner' : 'import'} size={18} spin={importing} />
              </IconButton>
            </DirectionHead>
            <Hint>
              Edits you make to the <code>.md</code> files are detected automatically below.
              Import pulls them into your notes. If a note was changed both in the app and in
              its file, the app version wins and your file edit is saved to a{' '}
              <code>conflicts/</code> folder so nothing is lost.
            </Hint>

            <StatusBox>
              {counts ? (
                <>
                  <StatusRow><span>Edited (file changed)</span><span>{counts.edited}</span></StatusRow>
                  <StatusRow><span>New files → new notes</span><span>{counts.created}</span></StatusRow>
                  <StatusRow><span>Renamed files</span><span>{counts.renamed}</span></StatusRow>
                  <StatusRow>
                    <span>Conflicts (app wins, edit saved)</span>
                    {counts.conflict > 0 ? <Warn>{counts.conflict}</Warn> : <span>0</span>}
                  </StatusRow>
                  <StatusRow><span>Deleted files (ignored)</span><span>{counts.missing}</span></StatusRow>
                  <StatusRow><span>Unchanged</span><span>{counts.unchanged}</span></StatusRow>
                </>
              ) : folderMissing ? (
                <StatusRow><span>Status</span><Warn>folder not found</Warn></StatusRow>
              ) : (
                <StatusRow><span>Status</span><span>{checking ? 'Checking…' : '…'}</span></StatusRow>
              )}
            </StatusBox>

            {counts && importableCount === 0 && (
              <Hint><Ok>Nothing to import — your notes already match the folder.</Ok></Hint>
            )}

            {importResult && (
              <Hint>
                <Ok>
                  Imported: {importResult.edited} edited, {importResult.created} new,
                  {' '}{importResult.renamed} renamed, {importResult.conflict} conflict
                  {importResult.conflict === 1 ? '' : 's'}.
                </Ok>
              </Hint>
            )}

            <ToggleRow>
              <div>
                <Label as="span" style={{ marginBottom: 0, display: 'block' }}>
                  Auto-import changes
                </Label>
                <Hint style={{ marginTop: '2px' }}>
                  Pull file edits into your notes automatically as they’re detected,
                  without pressing import.
                </Hint>
              </div>
              <Switch
                id="md-mirror-auto-import-toggle"
                checked={autoImport}
                onChange={() => commit({ ...settings, MD_MIRROR_AUTO_IMPORT: !autoImport })}
              />
            </ToggleRow>
          </Direction>
        </>
      )}
    </SectionContainer>
  );
};

export default MirrorTab;
