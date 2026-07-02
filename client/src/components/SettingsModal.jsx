import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import api from '../services/api';
import Icon from './Icons';
import { useAuth } from '../contexts/AuthContext';
import { useNotes } from '../contexts/NotesContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import ThemeManager from '../utils/ThemeManager';
import Modal from './Modal';
import AppearanceTab from './settings/AppearanceTab';
import TaggingTab from './settings/TaggingTab';
import AiTab from './settings/AiTab';
import NotificationsTab from './settings/NotificationsTab';
import BackupTab from './settings/BackupTab';
import MirrorTab from './settings/MirrorTab';
import AdvancedTab from './settings/AdvancedTab';
import IntegrationsTab from './settings/IntegrationsTab';
import MaintenanceTab from './settings/MaintenanceTab';
import HelpTab from './settings/HelpTab';

const DEBOUNCE_DELAY = 800; // ms to wait before auto-saving

const ModalBody = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 210px;
  border-right: 1px solid var(--menu-item-separator-dark);
  padding: 20px 0;
  padding-left: 16px;
  padding-right: 16px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  flex-shrink: 0;
  @media (max-width: 600px) {
    width: 80px;
  }
`;

const SidebarSpacer = styled.div`
  flex: 1;
`;

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const SaveIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-secondary-color);
  @media (max-width: 600px) {
    font-size: 0;
    gap: 0;
    justify-content: center;
  }
`;

const Spinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-color);
  border-top-color: var(--border-color);
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const SidebarItem = styled.button`
  border: none;
  border-radius: 6px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  color: var(--text-color);
  font-weight: ${props => props.$active ? '600' : '400'};
  background-color: ${props => props.$active ? 'var(--menu-item-selected)' : 'transparent'};
  display: flex;
  align-items: center;
  gap: 12px;

  &:hover {
    background-color: var(--menu-item-hover);
  }
  @media (max-width: 600px) {
    font-size: 0;
    width: 20px;
    gap: 0;
  }
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
`;

const ContentArea = styled.div`
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  transform: translateZ(0);
`;

const NAV_ITEMS = [
  { id: 'appearance', label: 'Appearance', icon: 'settings' },
  { id: 'tags', label: 'Tagging', icon: 'tag' },
  { id: 'ai', label: 'AI Integration', icon: 'magic' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'import', label: 'Backup & Restore', icon: 'database' },
  { id: 'mirror', label: '.md Mirror', icon: 'folder' },
  { id: 'maintenance', label: 'Maintenance', icon: 'maintenance' },
  { id: 'advanced', label: 'Advanced', icon: 'settings' },
  { id: 'integrations', label: 'Integrations', icon: 'link' },
  { id: 'help', label: 'Help', icon: 'help' },
];

const DEFAULT_SETTINGS = {
  AI_ENABLED: 'true',
  MCP_ENABLED: 'false',
  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  PUSHOVER_USER: '',
  PUSHOVER_TOKEN: '',
  PUSHBULLET_TOKEN: '',
  NTFY_SERVER: '',
  NTFY_TOPIC: '',
  PUPPETEER_EXECUTABLE_PATH: '',
  TMDB_API_KEY: '',
  JINA_API_KEY: '',
  FOXIT_ENABLED: false,
  FOXIT_SNOOPER_URL: '',
  FOXIT_SNOOPER_TOKEN: '',
  PROXY_ENABLED: 'false',
  PROXY_TOKEN: '',
  CACHE_MAX_SIZE: '1000',
  PREFETCH_BATCH_SIZE: '10',
  BATCH_DELAY_MS: '300',
  CACHE_TTL_MS: '7200000',
  PAGE_SIZE: '64',
  AI_PROMPT_SUMMARIZE: '',
  AI_PROMPT_OCR: '',
  AI_PROMPT_REMINDER: '',
  AI_PROMPT_AUTO_TAG: '',
  AI_PROMPT_SUMMARIZE_CUSTOM: '',
  AI_PROMPT_OCR_CUSTOM: '',
  AI_PROMPT_REMINDER_CUSTOM: '',
  AI_PROMPT_AUTO_TAG_CUSTOM: '',
  AI_MODEL_SUMMARIZE: '',
  AI_MODEL_OCR: '',
  AI_MODEL_REMINDER: '',
  AI_MODEL_AUTO_TAG: '',
  MD_MIRROR_ENABLED: 'false',
  MD_MIRROR_PATH: '',
  TRASH_CLEANUP_ENABLED: 'true',
  TRASH_CLEANUP_AGE_DAYS: '30',
  AUTO_ARCHIVE_ENABLED: 'false',
  AUTO_ARCHIVE_AGE_DAYS: '365',
};

const SettingsModal = ({ onClose }) => {
  const [activeSection, setActiveSection] = useState('appearance');
  const [isDarkTheme, setIsDarkTheme] = useState(ThemeManager.getTheme());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceTimerRef = useRef(null);
  const pendingSettingsRef = useRef(null);
  const contentAreaRef = useRef(null);
  const { token } = useAuth();
  const { reloadCacheSettings } = useNotes();
  const {
    setColorLabel,
    setPageBackgroundEnabled,
    setAiEnabled,
  } = useUIPreferences();

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPadding = document.body.style.paddingRight;

    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
    };
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      setSettings(response.data);
      // Sync Foxit settings to localStorage for client-side use
      localStorage.setItem('foxitEnabled', String(response.data.FOXIT_ENABLED === true || response.data.FOXIT_ENABLED === 'true'));
      localStorage.setItem('foxitSnooperUrl', response.data.FOXIT_SNOOPER_URL || '');
      // Load color labels from settings if available
      if (response.data.COLOR_LABELS) {
        try {
          const savedColorLabels = JSON.parse(response.data.COLOR_LABELS);
          // Update UIPreferences context with DB values
          Object.entries(savedColorLabels).forEach(([color, label]) => {
            setColorLabel(color, label);
          });
        } catch (e) {
          console.error('Error parsing COLOR_LABELS:', e);
        }
      }
      setPageBackgroundEnabled(response.data.BACKGROUND_ENABLED === true || response.data.BACKGROUND_ENABLED === 'true');
      setAiEnabled(response.data.AI_ENABLED !== 'false');
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, [setColorLabel, setPageBackgroundEnabled, setAiEnabled]);

  useEffect(() => {
    fetchSettings();
    setIsDarkTheme(ThemeManager.getTheme());
  }, [token, fetchSettings]);

  // Save settings to server
  const saveSettings = useCallback(async (settingsToSave) => {
    setSaving(true);
    try {
      await api.post('/settings', settingsToSave);
      // Sync Foxit settings to localStorage for client-side use
      localStorage.setItem('foxitEnabled', String(settingsToSave.FOXIT_ENABLED === true || settingsToSave.FOXIT_ENABLED === 'true'));
      localStorage.setItem('foxitSnooperUrl', settingsToSave.FOXIT_SNOOPER_URL || '');
      setAiEnabled(settingsToSave.AI_ENABLED !== 'false');
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
      pendingSettingsRef.current = null;
    }
  }, [setAiEnabled]);

  // Debounced auto-save
  const debouncedSave = useCallback((newSettings) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    pendingSettingsRef.current = newSettings;
    debounceTimerRef.current = setTimeout(() => {
      if (pendingSettingsRef.current) {
        saveSettings(pendingSettingsRef.current);
      }
    }, DEBOUNCE_DELAY);
  }, [saveSettings]);

  // Clean up debounce timer on unmount or close
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        // Save any pending changes immediately on unmount
        if (pendingSettingsRef.current) {
          saveSettings(pendingSettingsRef.current);
        }
      }
    };
  }, [saveSettings]);

  // Update one field from an input change event, then debounce-save.
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    const newSettings = { ...settings, [name]: value };
    setSettings(newSettings);
    debouncedSave(newSettings);
  }, [settings, debouncedSave]);

  // Apply a fully-formed settings object and debounce-save it.
  const commit = useCallback((newSettings) => {
    setSettings(newSettings);
    debouncedSave(newSettings);
  }, [debouncedSave]);

  // Apply a settings object and save it immediately (no debounce).
  const commitImmediate = useCallback((newSettings) => {
    setSettings(newSettings);
    return saveSettings(newSettings);
  }, [saveSettings]);

  useEffect(() => {
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  const toggleTheme = () => {
    const newTheme = !isDarkTheme;
    setIsDarkTheme(newTheme);
    ThemeManager.setTheme(newTheme);
  };

  // Cache settings change - saves and reloads the cache once the save lands.
  const handleCacheSettingChange = useCallback((key, value) => {
    commit({ ...settings, [key]: value });
    // Small delay to ensure the DB save completes before reloading.
    setTimeout(() => {
      reloadCacheSettings();
    }, 1000);
  }, [settings, commit, reloadCacheSettings]);

  const renderSection = () => {
    switch (activeSection) {
      case 'appearance':
        return <AppearanceTab settings={settings} commit={commit} isDarkTheme={isDarkTheme} toggleTheme={toggleTheme} />;
      case 'tags':
        return <TaggingTab isDarkTheme={isDarkTheme} />;
      case 'ai':
        return <AiTab settings={settings} onChange={handleChange} commit={commit} commitImmediate={commitImmediate} isDarkTheme={isDarkTheme} />;
      case 'notifications':
        return <NotificationsTab settings={settings} onChange={handleChange} />;
      case 'import':
        return <BackupTab isDarkTheme={isDarkTheme} />;
      case 'mirror':
        return <MirrorTab settings={settings} onChange={handleChange} commit={commit} commitImmediate={commitImmediate} />;
      case 'advanced':
        return <AdvancedTab settings={settings} onChange={handleChange} onCacheSettingChange={handleCacheSettingChange} />;
      case 'maintenance':
        return <MaintenanceTab settings={settings} onChange={handleChange} commit={commit} isDarkTheme={isDarkTheme} />;
      case 'integrations':
        return <IntegrationsTab settings={settings} onChange={handleChange} commit={commit} isDarkTheme={isDarkTheme} />;
      case 'help':
        return <HelpTab />;
      default:
        return null;
    }
  };

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      width="900px"
      height="calc(100vh - 80px)"
      maxHeight="90vh"
      closeIconSize={24}
    >
      <ModalBody>
        <Sidebar>
          {NAV_ITEMS.map(item => (
            <SidebarItem
              key={item.id}
              $active={activeSection === item.id}
              onClick={() => setActiveSection(item.id)}
            >
              <Icon
                name={item.id === 'appearance' ? (isDarkTheme ? 'lightMode' : 'darkMode') : item.icon}
                size={20}
              />
              {item.label}
            </SidebarItem>
          ))}

          <SidebarSpacer />

          {saving && (
            <SaveIndicator>
              <Spinner />
              Saving...
            </SaveIndicator>
          )}
        </Sidebar>

        <MainContent>
          <ContentArea ref={contentAreaRef}>
            {loading ? <div>Loading...</div> : renderSection()}
          </ContentArea>
        </MainContent>
      </ModalBody>
    </Modal>
  );
};

export default SettingsModal;
