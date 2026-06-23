import React from 'react';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
} from './styles';

const AdvancedTab = ({ settings, onChange, onCacheSettingChange }) => (
  <>
    <SectionContainer>
      <SectionTitle>Puppeteer</SectionTitle>
      <FormGroup>
        <Label>Chromium Executable Path</Label>
        <Input
          type="text"
          name="PUPPETEER_EXECUTABLE_PATH"
          value={settings.PUPPETEER_EXECUTABLE_PATH}
          onChange={onChange}
          placeholder="/usr/bin/chromium-browser"
        />
      </FormGroup>
    </SectionContainer>
    <SectionContainer>
      <SectionTitle>Prefetch & Cache Settings</SectionTitle>
      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
        Configure how notes are cached and prefetched in the background for faster opening.
      </p>

      <FormGroup>
        <Label>Maximum Cache Size (number of notes)</Label>
        <Input
          type="number"
          min="1"
          value={settings.CACHE_MAX_SIZE || '1000'}
          onChange={(e) => onCacheSettingChange('CACHE_MAX_SIZE', e.target.value)}
        />
        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
          Maximum number of full notes to keep in cache. Default: 1000
        </p>
      </FormGroup>

      <FormGroup>
        <Label>Max Concurrent Prefetches</Label>
        <Input
          type="number"
          min="1"
          max="50"
          value={settings.PREFETCH_BATCH_SIZE || '10'}
          onChange={(e) => onCacheSettingChange('PREFETCH_BATCH_SIZE', e.target.value)}
        />
        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
          Maximum number of prefetch requests in flight at once. Extras queue until a slot frees. Default: 10
        </p>
      </FormGroup>

      <FormGroup>
        <Label>Viewport Prefetch Delay (milliseconds)</Label>
        <Input
          type="number"
          min="0"
          max="5000"
          step="50"
          value={settings.BATCH_DELAY_MS || '300'}
          onChange={(e) => onCacheSettingChange('BATCH_DELAY_MS', e.target.value)}
        />
        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
          How long a note card must stay visible before its prefetch fires. Higher values skip cards you scroll past quickly. Default: 300ms
        </p>
      </FormGroup>

      <FormGroup>
        <Label>Cache TTL (minutes)</Label>
        <Input
          type="number"
          min="1"
          max="1440"
          step="1"
          value={Math.max(1, Math.round((parseInt(settings.CACHE_TTL_MS, 10) || 7200000) / 60000))}
          onChange={(e) => {
            const minutes = Math.max(1, parseInt(e.target.value, 10) || 0);
            onCacheSettingChange('CACHE_TTL_MS', String(minutes * 60000));
          }}
        />
        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
          How long a cached note stays valid before it's re-fetched on open. Default: 120 minutes
        </p>
      </FormGroup>

      <FormGroup>
        <Label>Page Size (notes per request)</Label>
        <Input
          type="number"
          min="10"
          max="500"
          step="10"
          value={settings.PAGE_SIZE || '64'}
          onChange={(e) => onCacheSettingChange('PAGE_SIZE', e.target.value)}
        />
        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
          How many notes are loaded per page (initial load and each infinite-scroll page). Smaller = faster initial load, more frequent scroll fetches. Default: 64
        </p>
      </FormGroup>
    </SectionContainer>
  </>
);

export default AdvancedTab;
