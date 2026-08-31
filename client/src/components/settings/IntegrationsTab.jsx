import React, { useState, useCallback } from 'react';
import Switch from '../Switch';
import { notesApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
} from './styles';
import CopyableField from './CopyableField';
import env from '../../../env.js';

const IntegrationsTab = ({ settings, onChange, commit, isDarkTheme }) => {
  const foxitEnabled = settings.FOXIT_ENABLED === true || settings.FOXIT_ENABLED === 'true';
  const proxyEnabled = settings.PROXY_ENABLED === true || settings.PROXY_ENABLED === 'true';
  const { showToast } = useToast();

  const [jinaLoading, setJinaLoading] = useState(false);
  const [tmdbTesting, setTmdbTesting] = useState(false);
  const [foxitTokenCopied, setFoxitTokenCopied] = useState(false);
  const [proxyTokenCopied, setProxyTokenCopied] = useState(false);
  const [proxyTesting, setProxyTesting] = useState(false);

  const serverOrigin = typeof window !== 'undefined'
    ? `${window.location.origin}${env.SERVER_BASE_URL}`
    : '';

  const generateProxyToken = useCallback(() => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    commit({ ...settings, PROXY_TOKEN: token });
    if (navigator.clipboard) {
      navigator.clipboard.writeText(token).then(
        () => { setProxyTokenCopied(true); setTimeout(() => setProxyTokenCopied(false), 2500); },
        () => {}
      );
    }
  }, [settings, commit]);

  const clearProxyToken = useCallback(() => {
    setProxyTokenCopied(false);
    commit({ ...settings, PROXY_TOKEN: '' });
  }, [settings, commit]);

  const testProxyConnection = useCallback(async () => {
    setProxyTesting(true);
    try {
      const data = await notesApi.testProxyConnection();
      if (data.connected) {
        showToast('Proxy agent is connected', { variant: 'success' });
      } else {
        showToast('No proxy agent connected', { variant: 'error' });
      }
    } catch (e) {
      showToast('Could not reach server', { variant: 'error' });
    } finally {
      setProxyTesting(false);
    }
  }, [showToast]);

  // Fill the Foxit snooper token with a fresh random secret and copy it, since
  // the same value has to be pasted into the snooper on the other machine.
  const generateFoxitToken = useCallback(() => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    commit({ ...settings, FOXIT_SNOOPER_TOKEN: token });
    if (navigator.clipboard) {
      navigator.clipboard.writeText(token).then(
        () => { setFoxitTokenCopied(true); setTimeout(() => setFoxitTokenCopied(false), 2500); },
        () => { /* clipboard blocked; the value is still shown in the field */ }
      );
    }
  }, [settings, commit]);

  // Remove the token so the snooper endpoints go back to being open.
  const clearFoxitToken = useCallback(() => {
    setFoxitTokenCopied(false);
    commit({ ...settings, FOXIT_SNOOPER_TOKEN: '' });
  }, [settings, commit]);

  // --- Browser extension ("itsnotes clipper") token ---
  const [extLoading, setExtLoading] = useState(false);
  const [extToken, setExtToken] = useState(null);
  const [extError, setExtError] = useState(null);
  // The address the extension (and proxy agent) should point at — this app's own origin.
  // serverOrigin is already declared above.

  const generateExtensionToken = useCallback(async () => {
    setExtLoading(true);
    setExtError(null);
    try {
      const data = await notesApi.generateExtensionToken();
      setExtToken(data.token);
    } catch (e) {
      setExtError('Could not generate a token. Make sure you are logged in.');
    } finally {
      setExtLoading(false);
    }
  }, []);

  const refreshJinaTokens = useCallback(async () => {
    setJinaLoading(true);
    try {
      const data = await notesApi.getJinaBalance();
      if (data.configured === false) {
        showToast('Save an API key first, then check again.');
      } else if (data.valid === false) {
        showToast('Invalid Jina API key', { variant: 'error' });
      } else if (typeof data.balance === 'number') {
        showToast(`${data.balance.toLocaleString()} tokens remaining`, { variant: 'success' });
      } else {
        showToast(data.error || "Couldn't read the balance for this key.", { variant: 'error' });
      }
    } catch (e) {
      showToast('Could not fetch balance', { variant: 'error' });
    } finally {
      setJinaLoading(false);
    }
  }, [showToast]);

  const handleTestTmdb = useCallback(async () => {
    setTmdbTesting(true);
    try {
      const data = await notesApi.testTmdbKey(settings.TMDB_API_KEY || '');
      if (data.configured === false) {
        showToast('Enter an API key first.');
      } else if (data.valid) {
        showToast('TMDB key works', { variant: 'success' });
      } else {
        showToast(data.error || 'Invalid TMDB API key', { variant: 'error' });
      }
    } catch (e) {
      showToast('Could not reach TMDB', { variant: 'error' });
    } finally {
      setTmdbTesting(false);
    }
  }, [settings.TMDB_API_KEY, showToast]);

  return (
    <>
      <SectionContainer>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <SectionTitle style={{ margin: 0 }}>Proxy</SectionTitle>
          <button
            onClick={testProxyConnection}
            disabled={proxyTesting}
            style={{
              background: 'none',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: proxyTesting ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary-color)',
              opacity: proxyTesting ? 0.6 : 1,
            }}
          >
            {proxyTesting ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
          Route URL fetches (link previews, article extraction) through a proxy instead of the server.
          Useful when the server's IP is blocked by certain sites &mdash; YouTube thumbnails, geo-restricted content, etc.
          The proxy connects outbound; no port forwarding needed.
        </p>
        <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label style={{ marginBottom: 0 }}>Enable proxy</Label>
          <Switch
            id="proxy-enabled-toggle"
            checked={proxyEnabled}
            onChange={() => commit({ ...settings, PROXY_ENABLED: !proxyEnabled })}
          />
        </FormGroup>
        {proxyEnabled && (
          <>
            <FormGroup>
              <CopyableField
                label="Server URL"
                value={serverOrigin}
                isDark={isDarkTheme}
                copyTitle="Copy server URL"
              />
            </FormGroup>
            <FormGroup>
              {settings.PROXY_TOKEN ? (
                <>
                  <CopyableField
                    label="Proxy token"
                    value={settings.PROXY_TOKEN}
                    isDark={isDarkTheme}
                    copyTitle="Copy token"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={generateProxyToken}
                      style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--text-secondary-color)', cursor: 'pointer' }}
                    >
                      Regenerate
                    </button>
                    <button
                      onClick={clearProxyToken}
                      style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--text-secondary-color)', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                      {proxyTokenCopied ? 'Copied!' : 'Keep this secret.'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Label>Proxy token</Label>
                  <button
                    onClick={generateProxyToken}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: 'var(--text-secondary-color)',
                    }}
                  >
                    Generate token
                  </button>
                </>
              )}
            </FormGroup>
          </>
        )}
      </SectionContainer>
      <SectionContainer>
        <SectionTitle>Browser Extension (itsnotes clipper)</SectionTitle>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
          Clip any web article straight into a note from your browser toolbar. Install the
          &ldquo;itsnotes clipper&rdquo; extension, then paste this server&rsquo;s address and a token below into
          its options. Because the page is captured from your own browser, it even works on articles
          behind a login or paywall that you&rsquo;re already viewing.
        </p>
        <FormGroup>
          <CopyableField
            label="Server address"
            value={serverOrigin}
            isDark={isDarkTheme}
            copyTitle="Copy server address"
          />
          <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
            Enter this in the extension&rsquo;s options page.
          </p>
        </FormGroup>
        <FormGroup>
          {extToken ? (
            <>
              <CopyableField
                label="Access token"
                value={extToken}
                isDark={isDarkTheme}
                copyTitle="Copy token"
              />
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                Treat this like a password. It&rsquo;s shown once here &mdash; copy it now. Generating a new one
                does not revoke the old one (tokens can only be invalidated by resetting the account).
              </p>
            </>
          ) : (
            <>
              <Label>Access token</Label>
            <button
              onClick={generateExtensionToken}
              disabled={extLoading}
              style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '8px 14px',
                fontSize: '13px',
                cursor: extLoading ? 'not-allowed' : 'pointer',
                color: 'var(--text-secondary-color)',
                opacity: extLoading ? 0.6 : 1,
              }}
            >
              {extLoading ? 'Generating…' : 'Generate token'}
            </button>
            </>
          )}
          {extError && (
            <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--danger-color, #d9534f)' }}>
              {extError}
            </p>
          )}
        </FormGroup>
      </SectionContainer>
      <SectionContainer>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <SectionTitle style={{ margin: 0 }}>The Movie Database (TMDB)</SectionTitle>
          <button
            onClick={handleTestTmdb}
            disabled={tmdbTesting}
            style={{
              background: 'none',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: tmdbTesting ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary-color)',
              opacity: tmdbTesting ? 0.6 : 1,
            }}
          >
            {tmdbTesting ? 'Testing…' : 'Test key'}
          </button>
        </div>
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
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
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
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
          />
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
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
              />
              <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                Leave empty to use the server default. Enter the IP:port where the Foxit Snooper is running.
              </p>
            </FormGroup>
            <FormGroup>
              {settings.FOXIT_SNOOPER_TOKEN ? (
                <>
                  <CopyableField
                    label="Snooper Token"
                    value={settings.FOXIT_SNOOPER_TOKEN}
                    isDark={isDarkTheme}
                    copyTitle="Copy token"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={generateFoxitToken}
                      style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--text-secondary-color)', cursor: 'pointer' }}
                    >
                      Regenerate
                    </button>
                    <button
                      onClick={clearFoxitToken}
                      style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--text-secondary-color)', cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                      {foxitTokenCopied
                        ? 'Copied — paste it into the snooper.'
                        : <>The snooper must send this as <code>X-Snooper-Token</code>.</>}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Label>Snooper Token</Label>
                  <button
                    onClick={generateFoxitToken}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 14px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: 'var(--text-secondary-color)',
                    }}
                  >
                    Generate token
                  </button>
                  <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                    Optional. Generate a token to require the snooper to authenticate with <code>X-Snooper-Token</code>; leave unset to keep the endpoints open.
                  </p>
                </>
              )}
            </FormGroup>
          </>
        )}
      </SectionContainer>
    </>
  );
};

export default IntegrationsTab;
