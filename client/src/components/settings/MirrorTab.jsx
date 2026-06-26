import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import api from '../../services/api';
import Switch from '../Switch';
import Icon from '../Icons';
import {
  SectionContainer,
  SectionTitle,
  Button,
} from './styles';

// Status accents. Kept theme-agnostic (fixed rgb) so the green/blue/amber dots and
// the "enabled" banner read the same in light and dark.
const GREEN = 'rgb(34, 197, 94)';
const GREEN_BG = 'rgba(34, 197, 94, 0.10)';
const GREEN_BORDER = 'rgba(34, 197, 94, 0.35)';
const BLUE = 'rgb(96, 165, 250)';
const AMBER = 'rgb(234, 179, 8)';

const Tagline = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary-color);
`;

// Top banner: the master on/off plus where we're mirroring to. Greens up when on.
const EnableBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid ${(p) => (p.$on ? GREEN_BORDER : 'var(--border-color)')};
  background: ${(p) => (p.$on ? GREEN_BG : 'transparent')};
`;

const BannerTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
`;

const BannerSub = styled.div`
  font-size: 12.5px;
  margin-top: 2px;
  color: var(--text-secondary-color);
  word-break: break-all;
`;

// The two direction panels. auto-fit + minmax means they sit side by side when
// there's room and stack to full width once the settings pane gets narrow (mobile),
// without a viewport media query — it responds to the actual container width.
const Panels = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 24px;
`;

const PanelTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
`;

const PanelDesc = styled.div`
  font-size: 12.5px;
  color: var(--text-secondary-color);
`;

const StatusLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-color);
  margin-top: 3px;
`;

const Dot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${(p) => p.$color || 'var(--text-secondary-color)'};
`;

const SubLine = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
`;

const PanelDivider = styled.div`
  border-top: 1px solid var(--border-color);
  margin: 5px 0 1px;
`;

const PanelFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

const FootNote = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
`;

const Caption = styled.p`
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-secondary-color);
`;

// "How your notes stay safe" explainer.
const SafePanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.04);
`;

const SafeHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
`;

const SafeIntro = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary-color);
`;

const SafeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px 22px;
`;

const SafeItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-secondary-color);

  svg { flex-shrink: 0; margin-top: 1px; }
  b { color: var(--text-color); font-weight: 600; }
`;

const FooterLine = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
`;

const fmtCountdown = (ms) => {
  if (ms <= 0) return 'due now';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Coarse "x ago" for last export/import lines.
const fmtRelative = (iso) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// How often the import side re-checks the folder against the DB while this tab is
// open, so the "folder → notes" status stays live without a manual press.
const POLL_MS = 5000;

const MirrorTab = ({ settings, commit, commitImmediate }) => {
  const enabled = settings.MD_MIRROR_ENABLED === true || settings.MD_MIRROR_ENABLED === 'true';
  const hasPath = !!settings.MD_MIRROR_PATH;
  const autoImport = settings.MD_MIRROR_AUTO_IMPORT === true || settings.MD_MIRROR_AUTO_IMPORT === 'true';

  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sweepArmed = useRef(false);

  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/mirror/status');
      setStatus(data);
    } catch (err) {
      console.error('Error fetching mirror status:', err);
    }
  }, []);

  // Silent dry run powering the live "folder → notes" panel. Reads persisted
  // settings (the path is debounce-saved on edit), so no commit here.
  const refreshPreview = useCallback(async () => {
    if (!enabled || !hasPath) { setPreview(null); return; }
    try {
      const { data } = await api.post('/mirror/import/preview');
      setPreview(data);
    } catch (err) {
      console.error('Error checking import status:', err);
    }
  }, [enabled, hasPath]);

  // Poll both directions while the tab is open and the mirror is on. Pauses when
  // the window is hidden so we don't render the whole library to /dev/null in the
  // background. Unmounts (leaving the tab) stop it entirely.
  useEffect(() => {
    if (!enabled || !hasPath) return undefined;
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
      if (data && data.status) setStatus(data.status);
      refreshPreview();
    } catch (err) {
      console.error('Error applying import:', err);
    } finally {
      setImporting(false);
    }
  }, [settings, commitImmediate, refreshPreview]);

  const counts = preview && !preview.skipped ? preview.counts : null;
  const importableCount = counts
    ? counts.edited + counts.created + counts.renamed + counts.conflict
    : 0;

  const live = status && status.liveConnected;
  const fileCount = status ? status.fileCount : null;
  const writable = status && status.writable;

  // Export panel status: live vs still connecting.
  const exportStatus = live
    ? { color: GREEN, text: 'Live — up to date' }
    : { color: AMBER, text: 'Connecting…' };

  // Import panel status: pending changes take priority, then the auto/manual mode.
  const importStatus = importableCount > 0
    ? { color: AMBER, text: `${importableCount} change${importableCount === 1 ? '' : 's'} to import` }
    : autoImport
      ? { color: BLUE, text: 'Auto-import on — watching for changes' }
      : { color: GREEN, text: 'Up to date' };

  const lastImportAt = status && status.lastImportAt;
  const lastImportChanged = status && status.lastImportChanged;
  const importSub = lastImportAt
    ? `Last import ${fmtRelative(lastImportAt)}${lastImportChanged != null ? ` · ${lastImportChanged} file${lastImportChanged === 1 ? '' : 's'} updated` : ''}`
    : autoImport
      ? 'Watching for file changes'
      : 'Press Import now to pull in file edits';

  return (
    <SectionContainer>
      <div>
        <SectionTitle>Markdown Mirror</SectionTitle>
        <Tagline>
          Keep a folder of <code>.md</code> files in sync with your notes — so you can edit
          them in any editor and still see them as notes here. Your notes database is always
          the source of truth.
        </Tagline>
      </div>

      <EnableBanner $on={enabled}>
        <div>
          <BannerTitle>{enabled ? 'Mirror enabled' : 'Mirror disabled'}</BannerTitle>
          <BannerSub>
            {enabled
              ? (hasPath
                ? <>Mirroring to <code>{settings.MD_MIRROR_PATH}</code>{fileCount != null ? ` · ${fileCount} notes mirrored` : ''}</>
                : 'No mirror folder configured — set MD_MIRROR_PATH in your environment')
              : 'Turn on to keep a folder of .md files in sync with your notes'}
          </BannerSub>
        </div>
        <Switch
          id="md-mirror-enabled-toggle"
          checked={enabled}
          onChange={() => commitImmediate({ ...settings, MD_MIRROR_ENABLED: !enabled })}
        />
      </EnableBanner>

      {enabled && (
        <>
          <Panels>
            {/* Export: notes → folder (always on while the mirror is enabled) */}
            <Panel>
              <PanelHead>
                <PanelTitle>Notes → Folder</PanelTitle>
              </PanelHead>
              <PanelDesc>Export · writes your notes out as files</PanelDesc>
              <StatusLine><Dot $color={exportStatus.color} />{exportStatus.text}</StatusLine>
              <SubLine>
                Last export {fmtRelative(status && status.lastSweepAt)}
                {nextAt ? ` · next sweep in ${fmtCountdown(nextAt - now)}` : ''}
              </SubLine>
              <PanelDivider />
              <PanelFoot>
                <FootNote>Always on while mirror is enabled</FootNote>
                <Button
                  type="button"
                  $size="small"
                  onClick={handleSyncNow}
                  disabled={syncing || !hasPath}
                >
                  <Icon name="refresh" size={14} spin={syncing} />
                  Export now
                </Button>
              </PanelFoot>
            </Panel>

            {/* Import: folder → notes (auto-import toggle lives in the header) */}
            <Panel>
              <PanelHead>
                <PanelTitle>Folder → Notes</PanelTitle>
                <Switch
                  id="md-mirror-auto-import-toggle"
                  checked={autoImport}
                  onChange={() => commitImmediate({ ...settings, MD_MIRROR_AUTO_IMPORT: !autoImport })}
                />
              </PanelHead>
              <PanelDesc>Import · pulls file edits back into notes</PanelDesc>
              <StatusLine><Dot $color={importStatus.color} />{importStatus.text}</StatusLine>
              <SubLine>{importSub}</SubLine>
              <PanelDivider />
              <PanelFoot>
                <FootNote>{autoImport ? 'Auto-import file edits' : 'Manual import'}</FootNote>
                <Button
                  type="button"
                  $size="small"
                  onClick={handleApplyImport}
                  disabled={importing || importableCount === 0}
                >
                  <Icon name={importing ? 'spinner' : 'refresh'} size={14} spin={importing} />
                  Import now
                </Button>
              </PanelFoot>
            </Panel>
          </Panels>

          <Caption>
            Each direction syncs continuously. Use the buttons to force a sync right now,
            one direction at a time. Turn off import if you only want a one-way backup to files.
          </Caption>

          <SafePanel>
            <SafeHead>
              <Icon name="shield" size={16} />
              How your notes stay safe
            </SafeHead>
            <SafeIntro>
              The app database is the source of truth — the files are a copy of it, and the
              mirror never deletes a note. Here’s exactly how the tricky cases are handled:
            </SafeIntro>
            <SafeGrid>
              <SafeItem>
                <Icon name="check" size={15} color={GREEN} />
                <span><b>Deleted a file?</b> Ignored — the note stays put.</span>
              </SafeItem>
              <SafeItem>
                <Icon name="check" size={15} color={GREEN} />
                <span><b>Edited both sides?</b> The app wins; your file edit is saved to <code>conflicts/</code>.</span>
              </SafeItem>
              <SafeItem>
                <Icon name="check" size={15} color={GREEN} />
                <span><b>Renamed a file?</b> Tracked by note ID — no duplicate note.</span>
              </SafeItem>
              <SafeItem>
                <Icon name="check" size={15} color={GREEN} />
                <span>Trash / archive / pin ride along in each file’s header.</span>
              </SafeItem>
            </SafeGrid>
          </SafePanel>

          <FooterLine>
            Source of truth: app database{fileCount != null ? ` · ${fileCount} notes` : ''}
            {status && status.pathExists
              ? (writable ? ' · folder verified writable ✓' : ' · folder not writable ✕')
              : ''}
          </FooterLine>
        </>
      )}
    </SectionContainer>
  );
};

export default MirrorTab;
