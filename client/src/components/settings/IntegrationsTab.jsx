import React from 'react';
import Switch from '../Switch';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
} from './styles';

const IntegrationsTab = ({ settings, onChange, commit }) => {
  const foxitEnabled = settings.FOXIT_ENABLED === true || settings.FOXIT_ENABLED === 'true';

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
