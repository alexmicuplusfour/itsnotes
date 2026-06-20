import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import api from '../../services/api';
import Switch from '../Switch';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
  Button,
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

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const Description = styled.p`
  font-size: 14px;
  color: var(--text-secondary-color);
  margin: 0;
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

const MirrorTab = ({ settings, onChange, commit, commitImmediate }) => {
  const enabled = settings.MD_MIRROR_ENABLED === true || settings.MD_MIRROR_ENABLED === 'true';
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sweepArmed = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/mirror/status');
      setStatus(data);
    } catch (err) {
      console.error('Error fetching mirror status:', err);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Tick once a second so the countdown updates live.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nextAt = status && status.nextSweepAt ? new Date(status.nextSweepAt).getTime() : null;

  // When the scheduled time passes, a sweep just ran on the server — pull a fresh
  // status (new countdown target + the sweep's results) once, a few seconds later.
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
    } catch (err) {
      console.error('Error running mirror sync:', err);
    } finally {
      setSyncing(false);
    }
  }, [settings, commitImmediate, refreshStatus]);

  const summary = status && status.lastSummary;

  return (
    <SectionContainer>
      <SectionTitle>Markdown Mirror</SectionTitle>
      <Description>
        Continuously exports every note to a folder as a <code>.md</code> file with a
        metadata header (tags, color, reminders, pin/archive/trash state). Images and
        attachments are written alongside in <code>_resources/</code>. The folder is a
        read-only projection of your notes — great for backups, grep, git, or opening in
        Obsidian/VS Code. Your database stays the source of truth; editing the files does
        not change your notes (import comes later).
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
              The folder is created if it doesn’t exist. Edits mirror live within seconds,
              and a full reconcile sweep runs periodically as a backstop; use “Sync now” to
              export everything immediately.
            </Hint>
          </FormGroup>

          <StatusBox>
            <StatusRow>
              <span>Status</span>
              {status
                ? (status.enabled ? <Ok>Active</Ok> : <Warn>Inactive</Warn>)
                : <span>…</span>}
            </StatusRow>
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
            {status && status.enabled && (
              <StatusRow>
                <span>Live updates</span>
                {status.liveConnected
                  ? <Ok>On — changes mirror within seconds</Ok>
                  : <Warn>connecting…</Warn>}
              </StatusRow>
            )}
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

          <ButtonRow>
            <Button
              $size="large"
              onClick={handleSyncNow}
              disabled={syncing || !settings.MD_MIRROR_PATH}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          </ButtonRow>
        </>
      )}
    </SectionContainer>
  );
};

export default MirrorTab;
