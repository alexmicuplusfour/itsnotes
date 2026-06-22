import React, { useState, useCallback } from 'react';
import Switch from '../Switch';
import { notesApi } from '../../services/api';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
} from './styles';

const IntegrationsTab = ({ settings, onChange, commit }) => {
  const foxitEnabled = settings.FOXIT_ENABLED === true || settings.FOXIT_ENABLED === 'true';

  const [jinaLoading, setJinaLoading] = useState(false);
  const [jinaStatus, setJinaStatus] = useState(null);

  const refreshJinaTokens = useCallback(async () => {
    setJinaLoading(true);
    setJinaStatus(null);
    try {
      const data = await notesApi.getJinaBalance();
      setJinaStatus(data);
    } catch (e) {
      setJinaStatus({ error: 'Could not fetch balance' });
    } finally {
      setJinaLoading(false);
    }
  }, []);

  // Friendly one-liner describing the last token check.
  const jinaMessage = () => {
    if (!jinaStatus) return null;
    if (jinaStatus.configured === false) return 'Save an API key first, then check again.';
    if (jinaStatus.valid === false) return 'Invalid API key.';
    if (typeof jinaStatus.balance === 'number') {
      return `${jinaStatus.balance.toLocaleString()} tokens remaining`;
    }
    return jinaStatus.error || "Couldn't read the balance for this key.";
  };

  return (
    <>
      <SectionContainer>
        <SectionTitle>The Movie Database (TMDB)</SectionTitle>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
          Enables automatic metadata lookup when adding movies and TV shows from IMDb or TMDB URLs. Fetches title, poster, rating, director, cast, and more. Get a free API key at themoviedb.org/settings/api.
        </p>
        <FormGroup>
          <Label>API Key</Label>
          <Input
            type="text"
            name="TMDB_API_KEY"
            value={settings.TMDB_API_KEY || ''}
            onChange={onChange}
            placeholder="Enter your TMDB API key"
          />
        </FormGroup>
      </SectionContainer>
      <SectionContainer>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <SectionTitle style={{ margin: 0 }}>Jina Reader</SectionTitle>
          <button
            onClick={refreshJinaTokens}
            disabled={jinaLoading}
            style={{
              background: 'none',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: jinaLoading ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary-color)',
              opacity: jinaLoading ? 0.6 : 1,
            }}
          >
            {jinaLoading ? 'Checking...' : '↻ Refresh tokens'}
          </button>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
          Improves article extraction for tough sites. When the built-in methods are blocked by a paywall or an anti-bot wall (Cloudflare, Vercel), the article is fetched through Jina's premium renderer instead. Optional &mdash; extraction still works without a key, just less reliably. Get one at jina.ai/reader.
        </p>
        <FormGroup>
          <Label>API Key</Label>
          <Input
            type="password"
            name="JINA_API_KEY"
            value={settings.JINA_API_KEY || ''}
            onChange={onChange}
            placeholder="jina_..."
            autoComplete="off"
          />
          {jinaStatus && (
            <p style={{
              marginTop: '6px',
              fontSize: '13px',
              color: (jinaStatus.valid === false || (jinaStatus.error && jinaStatus.balance == null))
                ? 'var(--danger-color, #d9534f)'
                : 'var(--text-secondary-color)',
            }}>
              {jinaMessage()}
            </p>
          )}
        </FormGroup>
      </SectionContainer>
      <SectionContainer>
        <SectionTitle>Foxit PDF Reader</SectionTitle>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
          Track reading progress from Foxit PDF Reader. Requires the Foxit Snooper to be running on your Windows machine.
        </p>
        <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label style={{ marginBottom: 0 }}>Enable Foxit Integration</Label>
          <Switch
            id="foxit-enabled-toggle"
            checked={foxitEnabled}
            onChange={() => commit({ ...settings, FOXIT_ENABLED: !foxitEnabled })}
          />
        </FormGroup>
        {foxitEnabled && (
          <>
            <FormGroup>
              <Label>Snooper URL</Label>
              <Input
                type="text"
                name="FOXIT_SNOOPER_URL"
                value={settings.FOXIT_SNOOPER_URL || ''}
                onChange={onChange}
                placeholder="http://192.168.100.110:3456"
              />
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                Leave empty to use the server default. Enter the IP:port where the Foxit Snooper is running.
              </p>
            </FormGroup>
            <FormGroup>
              <Label>Snooper Token</Label>
              <Input
                type="password"
                name="FOXIT_SNOOPER_TOKEN"
                value={settings.FOXIT_SNOOPER_TOKEN || ''}
                onChange={onChange}
                placeholder="Optional shared token"
                autoComplete="off"
              />
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                When set, the snooper must send the same value as <code>X-Snooper-Token</code> on its requests. Leave empty to keep the endpoints open.
              </p>
            </FormGroup>
          </>
        )}
      </SectionContainer>
    </>
  );
};

export default IntegrationsTab;
