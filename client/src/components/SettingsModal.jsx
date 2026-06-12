import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import api, { aiApi } from '../services/api';
import Icon from './Icons';
import TagMultiSelect from './TagMultiSelect';
import { useAuth } from '../contexts/AuthContext';
import { useNotes } from '../contexts/NotesContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { useAutoTagging, AUTO_TAG_FEATURES } from '../contexts/AutoTaggingContext';
import { useTags } from '../contexts/TagsContext';
import { COLORS } from './ColorPicker';
import ThemeManager from '../utils/ThemeManager';
import Switch from './Switch';
import ImportExportSettings from './ImportExportSettings';
import BackupRestore from './BackupRestore';

const DEBOUNCE_DELAY = 800; // ms to wait before auto-saving

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1100;
  
  @media (max-width: 768px) {
    background-color: var(--note-bg-color);
  }
`;

const ModalContainer = styled.div`
  position: relative;
  width: 900px;
  max-width: 90%;
  background-color: var(--note-bg-color);
  border-radius: 8px;
  box-shadow: 0 3px 10px var(--shadow-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
  max-height: 90vh;
  
  @media (max-width: 768px) {
    width: 100%;
    max-width: 100%;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
  }
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  box-shadow: 1px 3px 9px 0px rgba(0,0,0,0.2);
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 500;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  opacity: 0.8;
  cursor: pointer;
  
  &:hover {
    opacity: 1;
  }
`;

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

const SectionContainer = styled.div`
  margin-bottom: 40px;

  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 0px;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 18px;
  
  padding-left: 2px;
`;

const FormGroup = styled.div`
  margin-bottom: 0px;
`;

const Label = styled.label`
  display: block;
  padding-left: 2px;
  margin-bottom: 4px;
  font-weight: 400;
  font-size: 14px;
`;

const LabelBold = styled.label`
  display: flex;
  margin-bottom: 4px;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  background-color: var(--input-bg-color, transparent);
  color: var(--text-color);

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }
`;

const Select = styled.select`
  width: 100%;
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
`;

const OperatorsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
`;

const OperatorItem = styled.div`
  display: flex;
  gap: 8px;
  flex-direction: column;
  margin-bottom: 12px;
`;

const OperatorSymbol = styled.code`
  background-color: var(--search-bg-color);
  color: var(--link);
  padding: 4px 8px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 14px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
`;

const OperatorDescription = styled.div`
  font-size: 14px;
`;

const ExampleContainer = styled.div`
  background-color: var(--note-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
`;

const ExampleTitle = styled.div`
  font-weight: 500;
  margin-bottom: 8px;
  font-size: 15px;
  color: var(--link);
`;

const ExampleText = styled.div`
  font-family: monospace;
  white-space: pre-wrap;
  font-size: 14px;
  color: var(--text-color);
`;

// Color Labels styled components
const ColorLabelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
`;

const ColorLabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  border-radius: 50vh;
  border: 1px solid var(--border-color);
`;

const ColorCircleSettings = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: ${props => `var(--note-color-${props.$color})`};
  border: 1px solid var(--border-color);
  flex-shrink: 0;
`;

const ColorLabelInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 4px;
  background-color: transparent;
  color: var(--text-color);
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }

  &::placeholder {
    color: var(--text-secondary-color);
    opacity: 0.7;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 150px;
  padding: 10px;
  border-radius: 8px;
  background-color: transparent;
  color: var(--text-color);
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  border: 1px solid var(--border-color);

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }

  &::placeholder {
    color: var(--text-secondary-color);
    opacity: 0.7;
  }
`;

const PromptDescription = styled.p`
  font-size: 13px;
  color: var(--text-secondary-color);
  margin-top: 0px;
  margin-bottom: 0;
`;

const ReadOnlyPromptBox = styled.div`
  background-color: ${props => props.$isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'};
  border-radius: 8px;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary-color);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  margin-bottom: 12px;
`;

const PromptSectionLabel = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ClearLabelButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-secondary-color);
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
  flex-shrink: 0;
  opacity: 1;
  transition: opacity 0.15s, background-color 0.15s;
  
  &:hover {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.2);
  }
`;

// Auto-tagging styled components
const AutoTagRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background-color: ${props => props.$isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'};
  border-radius: 8px;
`;

const AutoTagHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const AutoTagTitle = styled.div`
  font-weight: 500;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const AutoTagDescription = styled.div`
  font-size: 13px;
  color: var(--text-secondary-color);
  margin-top: -4px;
`;

const AutoTagOptions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 0px;
`;

const OptionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  
  @media (max-width: 600px) {
    
  }
`;

const OptionLabel = styled.label`
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
`;

const ModeSelector = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ModeButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  padding-left: 8px;
  border-radius: 6px;
  outline: ${props => props.$active ? '2px solid var(--foreground-color)' : 'none'};
  background-color: transparent;
  color: ${props => props.$active ? 'var(--text-color)' : 'var(--text-secondary-color)'};
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--menu-item-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TagSelect = styled.select`
  padding-left: 8px;
  padding-right: 24px;
  padding-top: 8px;
  padding-bottom: 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background-color: var(--input-bg-color, transparent);
  color: var(--text-color);
  font-size: 14px;
  min-width: 150px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239aa0a6' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SettingsModal = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState('appearance');
  const [isDarkTheme, setIsDarkTheme] = useState(ThemeManager.getTheme());
  const [settings, setSettings] = useState({
    AI_ENABLED: 'true',
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
    FOXIT_ENABLED: false,
    FOXIT_SNOOPER_URL: '',
    CACHE_MAX_SIZE: '200',
    PREFETCH_BATCH_SIZE: '10',
    BATCH_DELAY_MS: '500',
    CACHE_TTL_MS: '300000',
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
    AI_MODEL_AUTO_TAG: ''
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [initialSettings, setInitialSettings] = useState(settings);
  const [loading, setLoading] = useState(false);
  const debounceTimerRef = useRef(null);
  const pendingSettingsRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const contentAreaRef = useRef(null);
  const { token } = useAuth();
  const { reloadCacheSettings } = useNotes();
  const {
    showQuickAccess,
    showMonthMarkers,
    showNoteTabs,
    fullscreenNoteForm,
    layoutView,
    toggleQuickAccess,
    toggleMonthMarkers,
    toggleNoteTabs,
    toggleFullscreenNoteForm,
    changeLayoutView,
    colorLabels,
    setColorLabel,
    pageBackgroundEnabled,
    setPageBackgroundEnabled,
    pickBackground,
    setAiEnabled,
    notesFontFamily,
    notesBodyFontSize,
    setNotesFontFamily,
    setNotesBodyFontSize,
  } = useUIPreferences();

  // Auto-tagging context
  const {
    getFeatureSettings,
    toggleFeatureEnabled,
    setFeatureMode,
    setFeatureTags,
  } = useAutoTagging();

  // Tags context for tag selection
  const { tags } = useTags();

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      setIsDarkTheme(ThemeManager.getTheme());
    }
  }, [isOpen, token]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      setSettings(response.data);
      setInitialSettings(response.data);
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
  };

  // Save settings to server
  const saveSettings = useCallback(async (settingsToSave) => {
    setSaving(true);
    try {
      await api.post('/settings', settingsToSave);
      setInitialSettings(settingsToSave);
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
  }, []);

  // Debounced auto-save
  const debouncedSave = useCallback((newSettings) => {
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Store the pending settings
    pendingSettingsRef.current = newSettings;
    
    // Set up new debounce timer
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    const newSettings = {
      ...settings,
      [name]: value
    };
    setSettings(newSettings);
    debouncedSave(newSettings);
  };

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const data = await aiApi.getModels();
      setAvailableModels(data.models || []);
    } catch (e) {
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const handleProviderChange = async (e) => {
    const newProvider = e.target.value;
    const newSettings = {
      ...settings,
      AI_PROVIDER: newProvider,
      AI_MODEL_SUMMARIZE: '',
      AI_MODEL_OCR: '',
      AI_MODEL_REMINDER: '',
      AI_MODEL_AUTO_TAG: '',
    };
    setSettings(newSettings);
    setAvailableModels([]);
    await saveSettings(newSettings);
    loadModels();
  };

  useEffect(() => {
    if (activeSection === 'ai') {
      loadModels();
    }
  }, [activeSection, loadModels]);

  // When models load, auto-select the first one for any feature that has no selection
  useEffect(() => {
    if (availableModels.length === 0) return;
    const firstId = availableModels[0].id;
    const updates = {};
    if (!settings.AI_MODEL_SUMMARIZE) updates.AI_MODEL_SUMMARIZE = firstId;
    if (!settings.AI_MODEL_OCR) updates.AI_MODEL_OCR = firstId;
    if (!settings.AI_MODEL_REMINDER) updates.AI_MODEL_REMINDER = firstId;
    if (!settings.AI_MODEL_AUTO_TAG) updates.AI_MODEL_AUTO_TAG = firstId;
    if (Object.keys(updates).length > 0) {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);
      debouncedSave(newSettings);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableModels]);

  // Handler for color label changes - updates both context and saves to DB
  const handleColorLabelChange = useCallback((color, label) => {
    // Update local context
    setColorLabel(color, label);
    
    // Update the colorLabels object and save to DB
    const newColorLabels = { ...colorLabels };
    if (label && label.trim()) {
      newColorLabels[color] = label.trim();
    } else {
      delete newColorLabels[color];
    }
    
    // Save to DB via settings API
    const newSettings = {
      ...settings,
      COLOR_LABELS: JSON.stringify(newColorLabels)
    };
    setSettings(newSettings);
    debouncedSave(newSettings);
  }, [colorLabels, settings, setColorLabel, debouncedSave]);

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

  // Handler for cache settings changes - saves and immediately reloads
  const handleCacheSettingChange = useCallback((key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    debouncedSave(newSettings);

    // Reload cache settings immediately after save completes
    // Add a small delay to ensure the DB save completes first
    setTimeout(() => {
      reloadCacheSettings();
    }, 1000);
  }, [settings, debouncedSave, reloadCacheSettings]);

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>Settings</ModalTitle>
          <CloseButton onClick={onClose}>
            <Icon name="close" size={24} />
          </CloseButton>
        </ModalHeader>
        
        <ModalBody>
          <Sidebar>
            <SidebarItem
              $active={activeSection === 'appearance'}
              onClick={() => setActiveSection('appearance')}
            >
              <Icon name={isDarkTheme ? "lightMode" : "darkMode"} size={20} />
              Appearance
            </SidebarItem>
            <SidebarItem
              $active={activeSection === 'tags'}
              onClick={() => setActiveSection('tags')}
            >
              <Icon name="tag" size={20} />
              Tagging
            </SidebarItem>
            <SidebarItem
              $active={activeSection === 'ai'}
              onClick={() => setActiveSection('ai')}
            >
              <Icon name="magic" size={20} />
              AI Integration
            </SidebarItem>
            <SidebarItem
              $active={activeSection === 'notifications'}
              onClick={() => setActiveSection('notifications')}
            >
              <Icon name="bell" size={20} />
              Notifications
            </SidebarItem>
            <SidebarItem
              $active={activeSection === 'import'}
              onClick={() => setActiveSection('import')}
            >
              <Icon name="database" size={20} />
              Backup & Restore
            </SidebarItem>
            <SidebarItem
              $active={activeSection === 'advanced'}
              onClick={() => setActiveSection('advanced')}
            >
              <Icon name="settings" size={20} />
              Advanced
            </SidebarItem>
            <SidebarItem
              $active={activeSection === 'integrations'}
              onClick={() => setActiveSection('integrations')}
            >
              <Icon name="link" size={20} />
              Integrations
            </SidebarItem>
            <SidebarItem
              $active={activeSection === 'help'}
              onClick={() => setActiveSection('help')}
            >
              <Icon name="help" size={20} />
              Help
            </SidebarItem>

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
            {loading ? (
              <div>Loading...</div>
            ) : (
              <>
                {activeSection === 'ai' && (
                  <>
                    <SectionContainer>
                      <SectionTitle>AI Integration</SectionTitle>
                      <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Label style={{ marginBottom: 0 }}>Enable AI Features</Label>
                        <Switch
                          id="ai-enabled-toggle"
                          checked={settings.AI_ENABLED !== 'false'}
                          onChange={() => {
                            const newEnabled = settings.AI_ENABLED === 'false' ? 'true' : 'false';
                            const newSettings = { ...settings, AI_ENABLED: newEnabled };
                            setSettings(newSettings);
                            debouncedSave(newSettings);
                          }}
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label>Provider</Label>
                        <Select
                          name="AI_PROVIDER"
                          value={settings.AI_PROVIDER || 'openai'}
                          onChange={handleProviderChange}
                        >
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic (Claude)</option>
                        </Select>
                      </FormGroup>
                      {(settings.AI_PROVIDER || 'openai') === 'openai' ? (
                        <FormGroup>
                          <Label>OpenAI API Key</Label>
                          <Input
                            type="text"
                            name="OPENAI_API_KEY"
                            value={settings.OPENAI_API_KEY}
                            onChange={handleChange}
                            placeholder="sk-..."
                          />
                        </FormGroup>
                      ) : (
                        <FormGroup>
                          <Label>Anthropic API Key</Label>
                          <Input
                            type="text"
                            name="ANTHROPIC_API_KEY"
                            value={settings.ANTHROPIC_API_KEY}
                            onChange={handleChange}
                            placeholder="sk-ant-..."
                          />
                        </FormGroup>
                      )}
                    </SectionContainer>

                    <SectionContainer>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <SectionTitle style={{ margin: 0 }}>AI Prompts</SectionTitle>
                        <button
                          onClick={loadModels}
                          disabled={modelsLoading}
                          style={{
                            background: 'none',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '12px',
                            cursor: modelsLoading ? 'not-allowed' : 'pointer',
                            color: 'var(--text-secondary-color)',
                            opacity: modelsLoading ? 0.6 : 1,
                          }}
                        >
                          {modelsLoading ? 'Loading...' : '↻ Refresh models'}
                        </button>
                      </div>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
                        Add custom requirements to AI prompts. The core functionality is protected and cannot be modified.
                      </p>
                      <p style={{ fontSize: '13px', color: 'var(--text-color)', backgroundColor: 'rgba(251, 188, 4, 0.1)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--primary-color)' }}>
                        💡 Core prompts are locked to ensure features work correctly. You can add additional instructions below.
                      </p>

                      <SectionContainer>
                        <FormGroup>
                          <LabelBold> <Icon name="summarize_ai" size={20} /> Note Summarization</LabelBold>

                          <Select
                            name="AI_MODEL_SUMMARIZE"
                            value={settings.AI_MODEL_SUMMARIZE}
                            onChange={handleChange}
                            disabled={modelsLoading || availableModels.length === 0}
                          >
                            {modelsLoading ? (
                              <option value="">Loading models...</option>
                            ) : availableModels.length === 0 ? (
                              <option value="">No models — enter API key and refresh</option>
                            ) : (
                              availableModels.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))
                            )}
                          </Select>

                          <Label style={{ marginTop: '16px' }}>Core Prompt (Read-only)</Label>
                          <ReadOnlyPromptBox $isDark={isDarkTheme}>
                            {settings.AI_PROMPT_SUMMARIZE}
                          </ReadOnlyPromptBox>

                          <Label>Your Custom Requirements (Optional)</Label>
                          <TextArea
                            name="AI_PROMPT_SUMMARIZE_CUSTOM"
                            value={settings.AI_PROMPT_SUMMARIZE_CUSTOM}
                            onChange={handleChange}
                            placeholder="Add any additional instructions for summarization (e.g., 'Focus on action items' or 'Include relevant dates')..."
                            style={{ minHeight: '100px' }}
                          />
                          <PromptDescription>
                            Your custom requirements will be appended to the core prompt when generating summaries.
                          </PromptDescription>
                        </FormGroup>
                      </SectionContainer>

                      <SectionContainer>
                        <FormGroup>
                          <LabelBold> <Icon name="ocr" size={20} /> OCR Text Extraction</LabelBold>

                          <Select
                            name="AI_MODEL_OCR"
                            value={settings.AI_MODEL_OCR}
                            onChange={handleChange}
                            disabled={modelsLoading || availableModels.length === 0}
                          >
                            {modelsLoading ? (
                              <option value="">Loading models...</option>
                            ) : availableModels.length === 0 ? (
                              <option value="">No models — enter API key and refresh</option>
                            ) : (
                              availableModels.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))
                            )}
                          </Select>

                          <Label style={{ marginTop: '16px' }}>Core Prompt (Read-only)</Label>
                          <ReadOnlyPromptBox $isDark={isDarkTheme}>
                            {settings.AI_PROMPT_OCR}
                          </ReadOnlyPromptBox>

                          <Label>Your Custom Requirements (Optional)</Label>
                          <TextArea
                            name="AI_PROMPT_OCR_CUSTOM"
                            value={settings.AI_PROMPT_OCR_CUSTOM}
                            onChange={handleChange}
                            placeholder="Add any additional instructions for OCR (e.g., 'Preserve line breaks' or 'Ignore page numbers')..."
                            style={{ minHeight: '100px' }}
                          />
                          <PromptDescription>
                            Your custom requirements will be appended to the core prompt when extracting text from images.
                          </PromptDescription>
                        </FormGroup>
                      </SectionContainer>

                      <SectionContainer>
                        <FormGroup>
                          <LabelBold> <Icon name="bell" size={20} /> Reminder Generation</LabelBold>

                          <Select
                            name="AI_MODEL_REMINDER"
                            value={settings.AI_MODEL_REMINDER}
                            onChange={handleChange}
                            disabled={modelsLoading || availableModels.length === 0}
                          >
                            {modelsLoading ? (
                              <option value="">Loading models...</option>
                            ) : availableModels.length === 0 ? (
                              <option value="">No models — enter API key and refresh</option>
                            ) : (
                              availableModels.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))
                            )}
                          </Select>

                          <Label style={{ marginTop: '16px' }}>Core Prompt (Read-only)</Label>
                          <ReadOnlyPromptBox $isDark={isDarkTheme}>
                            {settings.AI_PROMPT_REMINDER}
                          </ReadOnlyPromptBox>

                          <Label>Your Custom Requirements (Optional)</Label>
                          <TextArea
                            name="AI_PROMPT_REMINDER_CUSTOM"
                            value={settings.AI_PROMPT_REMINDER_CUSTOM}
                            onChange={handleChange}
                            placeholder="Add any additional instructions for reminder parsing (e.g., 'Default to 9am if no time specified')..."
                            style={{ minHeight: '100px' }}
                          />
                          <PromptDescription>
                            Your custom requirements will be appended to the core prompt. Note: The core prompt ensures proper JSON format and date handling.
                          </PromptDescription>
                        </FormGroup>
                      </SectionContainer>

                      <SectionContainer>
                        <FormGroup>
                          <LabelBold> <Icon name="tag" size={20} /> Auto-Tagging</LabelBold>

                          <Select
                            name="AI_MODEL_AUTO_TAG"
                            value={settings.AI_MODEL_AUTO_TAG}
                            onChange={handleChange}
                            disabled={modelsLoading || availableModels.length === 0}
                          >
                            {modelsLoading ? (
                              <option value="">Loading models...</option>
                            ) : availableModels.length === 0 ? (
                              <option value="">No models — enter API key and refresh</option>
                            ) : (
                              availableModels.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))
                            )}
                          </Select>

                          <Label style={{ marginTop: '16px' }}>Core Prompt (Read-only)</Label>
                          <ReadOnlyPromptBox $isDark={isDarkTheme}>
                            {settings.AI_PROMPT_AUTO_TAG}
                          </ReadOnlyPromptBox>

                          <Label>Your Custom Requirements (Optional)</Label>
                          <TextArea
                            name="AI_PROMPT_AUTO_TAG_CUSTOM"
                            value={settings.AI_PROMPT_AUTO_TAG_CUSTOM}
                            onChange={handleChange}
                            placeholder="Add any additional instructions for tag suggestions (e.g., 'Prefer more specific tags over general ones' or 'Always include project tags if mentioned')..."
                            style={{ minHeight: '100px' }}
                          />
                          <PromptDescription>
                            Your custom requirements will be appended to the core prompt when suggesting tags. This applies when you click "Auto-tag" in the tag picker.
                          </PromptDescription>
                        </FormGroup>
                      </SectionContainer>
                    </SectionContainer>
                  </>
                )}
                
                {activeSection === 'notifications' && (
                  <SectionContainer>
                    <SectionTitle>Notifications</SectionTitle>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)', margin: 0 }}>
                      Configure where reminder notifications are sent.
                    </p>

                    <SectionContainer>
                      <LabelBold>Pushover</LabelBold>
                      <FormGroup>
                        <Label>User Key</Label>
                        <Input
                          type="text"
                          name="PUSHOVER_USER"
                          value={settings.PUSHOVER_USER}
                          onChange={handleChange}
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label>API Token</Label>
                        <Input
                          type="text"
                          name="PUSHOVER_TOKEN"
                          value={settings.PUSHOVER_TOKEN}
                          onChange={handleChange}
                        />
                      </FormGroup>
                    </SectionContainer>

                    <SectionContainer>
                      <LabelBold>Pushbullet</LabelBold>
                      <FormGroup>
                        <Label>Access Token</Label>
                        <Input
                          type="text"
                          name="PUSHBULLET_TOKEN"
                          value={settings.PUSHBULLET_TOKEN}
                          onChange={handleChange}
                        />
                      </FormGroup>
                    </SectionContainer>

                    <SectionContainer>
                      <LabelBold>Ntfy</LabelBold>
                      <FormGroup>
                        <Label>Server URL</Label>
                        <Input
                          type="text"
                          name="NTFY_SERVER"
                          value={settings.NTFY_SERVER}
                          onChange={handleChange}
                          placeholder="https://ntfy.sh"
                        />
                      </FormGroup>
                      <FormGroup>
                        <Label>Topic</Label>
                        <Input
                          type="text"
                          name="NTFY_TOPIC"
                          value={settings.NTFY_TOPIC}
                          onChange={handleChange}
                        />
                      </FormGroup>
                    </SectionContainer>
                  </SectionContainer>
                )}
                {activeSection === 'integrations' && (
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
                        onChange={handleChange}
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
                        checked={settings.FOXIT_ENABLED === true || settings.FOXIT_ENABLED === 'true'}
                        onChange={() => {
                          const newSettings = { ...settings, FOXIT_ENABLED: !(settings.FOXIT_ENABLED === true || settings.FOXIT_ENABLED === 'true') };
                          setSettings(newSettings);
                          debouncedSave(newSettings);
                        }}
                      />
                    </FormGroup>
                    {(settings.FOXIT_ENABLED === true || settings.FOXIT_ENABLED === 'true') && (
                      <FormGroup>
                        <Label>Snooper URL</Label>
                        <Input 
                          type="text" 
                          name="FOXIT_SNOOPER_URL"
                          value={settings.FOXIT_SNOOPER_URL || ''}
                          onChange={handleChange}
                          placeholder="http://192.168.100.110:3456"
                        />
                        <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary-color)' }}>
                          Leave empty to use the server default. Enter the IP:port where the Foxit Snooper is running.
                        </p>
                      </FormGroup>
                    )}
                  </SectionContainer>
                  </>
                )}

                {activeSection === 'import' && (
                  <>
                    <BackupRestore isDarkTheme={isDarkTheme} />
                    <div style={{ height: '32px', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}></div>
                    <ImportExportSettings />
                  </>
                )}

                {activeSection === 'appearance' && (
                  <>
                    <SectionContainer>
                      <SectionTitle>Theme</SectionTitle>
                      <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Label style={{ marginBottom: 0 }}>Dark Mode</Label>
                        <Switch 
                          id="theme-toggle"
                          checked={isDarkTheme}
                          onChange={toggleTheme}
                        />
                      </FormGroup>
                    </SectionContainer>

                    <SectionContainer>
                      <SectionTitle>Notes List Preferences</SectionTitle>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Layout</Label>
                        <ModeSelector>
                          <ModeButton
                            $active={layoutView === 'grid'}
                            onClick={() => changeLayoutView('grid')}
                            title="Grid layout"
                          >
                            {layoutView === 'grid' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <Icon name="grid" size={16} />
                            Grid
                          </ModeButton>
                          <ModeButton
                            $active={layoutView === 'stacked'}
                            onClick={() => changeLayoutView('stacked')}
                            title="Stacked layout"
                          >
                            {layoutView === 'stacked' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <Icon name="rows" size={16} />
                            Stacked
                          </ModeButton>
                          <ModeButton
                            $active={layoutView === 'list'}
                            onClick={() => changeLayoutView('list')}
                            title="List layout with detail panel"
                          >
                            {layoutView === 'list' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <Icon name="layoutSidebar" size={16} />
                            List
                          </ModeButton>
                          <ModeButton
                            $active={layoutView === 'overview'}
                            onClick={() => changeLayoutView('overview')}
                            title="Overview layout"
                          >
                            {layoutView === 'overview' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <Icon name="viewOverview" size={16} />
                            Overview
                          </ModeButton>
                        </ModeSelector>
                      </OptionRow>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Show Quick Access</Label>
                        <Switch 
                          id="quick-access-toggle"
                          checked={showQuickAccess}
                          onChange={toggleQuickAccess}
                        />
                      </OptionRow>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Show Month Markers</Label>
                        <Switch 
                          id="month-markers-toggle"
                          checked={showMonthMarkers}
                          onChange={toggleMonthMarkers}
                        />
                      </OptionRow>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Show Note Tabs</Label>
                        <Switch 
                          id="note-tabs-toggle"
                          checked={showNoteTabs}
                          onChange={toggleNoteTabs}
                        />
                      </OptionRow>
                    </SectionContainer>

                    <SectionContainer>
                      <SectionTitle>Page Background</SectionTitle>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Enable page backgrounds</Label>
                        <Switch
                          id="page-background-toggle"
                          checked={pageBackgroundEnabled}
                          onChange={() => {
                            const newVal = !pageBackgroundEnabled;
                            setPageBackgroundEnabled(newVal);
                            const newSettings = { ...settings, BACKGROUND_ENABLED: newVal };
                            setSettings(newSettings);
                            debouncedSave(newSettings);
                          }}
                        />
                      </OptionRow>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)', margin: 0 }}>
                        Shows a subtle background image that changes each session.
                      </p>
                    </SectionContainer>

                    <SectionContainer>
                      <SectionTitle>Note Editor</SectionTitle>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Fullscreen Note Form (Desktop)</Label>
                        <Switch
                          id="fullscreen-noteform-toggle"
                          checked={fullscreenNoteForm}
                          onChange={toggleFullscreenNoteForm}
                        />
                      </OptionRow>
                    </SectionContainer>

                    <SectionContainer>
                      <SectionTitle>Typography</SectionTitle>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Font Family</Label>
                        <ModeSelector>
                          <ModeButton
                            $active={notesFontFamily === 'sans'}
                            onClick={() => setNotesFontFamily('sans')}
                            title="Sans-serif (Product Sans)"
                          >
                            {notesFontFamily === 'sans' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <span style={{ fontFamily: "'Product Sans', Arial, sans-serif" }}>Sans</span>
                          </ModeButton>
                          <ModeButton
                            $active={notesFontFamily === 'serif'}
                            onClick={() => setNotesFontFamily('serif')}
                            title="Serif (Source Serif 4)"
                          >
                            {notesFontFamily === 'serif' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <span style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>Serif</span>
                          </ModeButton>
                        </ModeSelector>
                      </OptionRow>
                      <OptionRow>
                        <Label style={{ marginBottom: 0 }}>Body Font Size</Label>
                        <ModeSelector>
                          <ModeButton
                            $active={notesBodyFontSize === 's'}
                            onClick={() => setNotesBodyFontSize('s')}
                            title="Small"
                          >
                            {notesBodyFontSize === 's' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <span style={{ fontSize: '12px' }}>Small</span>
                          </ModeButton>
                          <ModeButton
                            $active={notesBodyFontSize === 'm'}
                            onClick={() => setNotesBodyFontSize('m')}
                            title="Medium (default)"
                          >
                            {notesBodyFontSize === 'm' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <span style={{ fontSize: '14px' }}>Medium</span>
                          </ModeButton>
                          <ModeButton
                            $active={notesBodyFontSize === 'l'}
                            onClick={() => setNotesBodyFontSize('l')}
                            title="Large"
                          >
                            {notesBodyFontSize === 'l' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                            <span style={{ fontSize: '16px' }}>Large</span>
                          </ModeButton>
                        </ModeSelector>
                      </OptionRow>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)', margin: 0 }}>
                        Applies to note body in the editor and note cards.
                      </p>
                    </SectionContainer>

                    <SectionContainer>
                      <SectionTitle>Custom Color Labels</SectionTitle>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
                        Give colors custom names that make sense to you. These labels will appear in tooltips and search suggestions.
                      </p>
                      <ColorLabelsGrid>
                        {COLORS.filter(color => color !== 'default').map(color => (
                          <ColorLabelRow key={color} $isDark={isDarkTheme}>
                            <ColorCircleSettings $color={color} />
                            <ColorLabelInput
                              type="text"
                              placeholder={color}
                              value={colorLabels[color] || ''}
                              onChange={(e) => handleColorLabelChange(color, e.target.value)}
                            />
                            {colorLabels[color] && (
                              <ClearLabelButton
                                onClick={() => handleColorLabelChange(color, '')}
                                title="Reset to default"
                              >
                                <Icon name="close" size={18} strokeWidth="3" />
                              </ClearLabelButton>
                            )}
                          </ColorLabelRow>
                        ))}
                      </ColorLabelsGrid>
                    </SectionContainer>
                  </>
                )}

                {activeSection === 'tags' && (
                  <>
                    <SectionContainer>
                      <SectionTitle>Auto-Tagging</SectionTitle>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
                        Configure automatic tagging for different features. Tags can be applied automatically or suggested for your approval.
                      </p>

                      {/* Reminders Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="bell" size={18} />
                            Reminders
                          </AutoTagTitle>
                          <Switch
                            id="reminder-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.REMINDERS).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.REMINDERS)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          Automatically tag notes when creating reminders from them.
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.REMINDERS).enabled && (
                          <AutoTagOptions>
                            <OptionRow>
                              <OptionLabel>Tag behavior:</OptionLabel>
                              <ModeSelector>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.REMINDERS).mode === 'auto'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.REMINDERS, 'auto')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.REMINDERS).mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Apply automatically
                                </ModeButton>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.REMINDERS).mode === 'suggest'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.REMINDERS, 'suggest')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.REMINDERS).mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Suggest only
                                </ModeButton>
                              </ModeSelector>
                            </OptionRow>
                            <OptionRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                              <OptionLabel>Tags to apply:</OptionLabel>
                              <TagMultiSelect
                                selectedTagIds={getFeatureSettings(AUTO_TAG_FEATURES.REMINDERS).tagIds || []}
                                onChange={(tagIds) => setFeatureTags(AUTO_TAG_FEATURES.REMINDERS, tagIds)}
                                placeholder="Search and add tags..."
                              />
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>

                      {/* Book Finished Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="book" size={18} />
                            Book Finished
                          </AutoTagTitle>
                          <Switch
                            id="book-finished-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.BOOK_FINISHED)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          Automatically tag notes when marking a book as finished.
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED).enabled && (
                          <AutoTagOptions>
                            <OptionRow>
                              <OptionLabel>Tag behavior:</OptionLabel>
                              <ModeSelector>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED).mode === 'auto'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.BOOK_FINISHED, 'auto')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED).mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Apply automatically
                                </ModeButton>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED).mode === 'suggest'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.BOOK_FINISHED, 'suggest')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED).mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Suggest only
                                </ModeButton>
                              </ModeSelector>
                            </OptionRow>
                            <OptionRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                              <OptionLabel>Tags to apply:</OptionLabel>
                              <TagMultiSelect
                                selectedTagIds={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED).tagIds || []}
                                onChange={(tagIds) => setFeatureTags(AUTO_TAG_FEATURES.BOOK_FINISHED, tagIds)}
                                placeholder="Search and add tags..."
                              />
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>

                      {/* Book Added Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="book" size={18} />
                            Book Added
                          </AutoTagTitle>
                          <Switch
                            id="book-added-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_ADDED).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.BOOK_ADDED)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          Automatically tag notes when adding a book from Goodreads.
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.BOOK_ADDED).enabled && (
                          <AutoTagOptions>
                            <OptionRow>
                              <OptionLabel>Tag behavior:</OptionLabel>
                              <ModeSelector>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_ADDED).mode === 'auto'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.BOOK_ADDED, 'auto')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.BOOK_ADDED).mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Apply automatically
                                </ModeButton>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_ADDED).mode === 'suggest'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.BOOK_ADDED, 'suggest')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.BOOK_ADDED).mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Suggest only
                                </ModeButton>
                              </ModeSelector>
                            </OptionRow>
                            <OptionRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                              <OptionLabel>Tags to apply:</OptionLabel>
                              <TagMultiSelect
                                selectedTagIds={getFeatureSettings(AUTO_TAG_FEATURES.BOOK_ADDED).tagIds || []}
                                onChange={(tagIds) => setFeatureTags(AUTO_TAG_FEATURES.BOOK_ADDED, tagIds)}
                                placeholder="Search and add tags..."
                              />
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>

                      {/* IMDB Added Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="video" size={18} />
                            IMDB Added
                          </AutoTagTitle>
                          <Switch
                            id="imdb-added-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.IMDB_ADDED).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.IMDB_ADDED)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          Automatically tag notes when adding a movie or show from IMDB.
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.IMDB_ADDED).enabled && (
                          <AutoTagOptions>
                            <OptionRow>
                              <OptionLabel>Tag behavior:</OptionLabel>
                              <ModeSelector>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.IMDB_ADDED).mode === 'auto'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.IMDB_ADDED, 'auto')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.IMDB_ADDED).mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Apply automatically
                                </ModeButton>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.IMDB_ADDED).mode === 'suggest'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.IMDB_ADDED, 'suggest')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.IMDB_ADDED).mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Suggest only
                                </ModeButton>
                              </ModeSelector>
                            </OptionRow>
                            <OptionRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                              <OptionLabel>Tags to apply:</OptionLabel>
                              <TagMultiSelect
                                selectedTagIds={getFeatureSettings(AUTO_TAG_FEATURES.IMDB_ADDED).tagIds || []}
                                onChange={(tagIds) => setFeatureTags(AUTO_TAG_FEATURES.IMDB_ADDED, tagIds)}
                                placeholder="Search and add tags..."
                              />
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>

                      {/* URL Content Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="link" size={18} />
                            URL Content
                          </AutoTagTitle>
                          <Switch
                            id="url-content-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.URL_CONTENT).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.URL_CONTENT)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          Automatically tag notes when adding content from a URL (articles, web pages).
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.URL_CONTENT).enabled && (
                          <AutoTagOptions>
                            <OptionRow>
                              <OptionLabel>Tag behavior:</OptionLabel>
                              <ModeSelector>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.URL_CONTENT).mode === 'auto'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.URL_CONTENT, 'auto')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.URL_CONTENT).mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Apply automatically
                                </ModeButton>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.URL_CONTENT).mode === 'suggest'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.URL_CONTENT, 'suggest')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.URL_CONTENT).mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Suggest only
                                </ModeButton>
                              </ModeSelector>
                            </OptionRow>
                            <OptionRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                              <OptionLabel>Tags to apply:</OptionLabel>
                              <TagMultiSelect
                                selectedTagIds={getFeatureSettings(AUTO_TAG_FEATURES.URL_CONTENT).tagIds || []}
                                onChange={(tagIds) => setFeatureTags(AUTO_TAG_FEATURES.URL_CONTENT, tagIds)}
                                placeholder="Search and add tags..."
                              />
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>

                      {/* Tag Search Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="search" size={18} />
                            Tag Search
                          </AutoTagTitle>
                          <Switch
                            id="tag-search-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.TAG_SEARCH).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.TAG_SEARCH)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          When creating a note while viewing tag search results, add the searched tag(s) to the new note.
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.TAG_SEARCH).enabled && (
                          <AutoTagOptions>
                            <OptionRow>
                              <OptionLabel>Tag behavior:</OptionLabel>
                              <ModeSelector>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.TAG_SEARCH).mode === 'auto'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.TAG_SEARCH, 'auto')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.TAG_SEARCH).mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Apply automatically
                                </ModeButton>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.TAG_SEARCH).mode === 'suggest'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.TAG_SEARCH, 'suggest')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.TAG_SEARCH).mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Suggest only
                                </ModeButton>
                              </ModeSelector>
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>

                      {/* AI Generated Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="magic" size={18} />
                            AI Tag Generation
                          </AutoTagTitle>
                          <Switch
                            id="ai-generated-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.AI_GENERATED)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          Configure behavior when using the "Auto-tag" action in the tag picker.
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED).enabled && (
                          <AutoTagOptions>
                            <OptionRow>
                              <OptionLabel>Tag behavior:</OptionLabel>
                              <ModeSelector>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED).mode === 'auto'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.AI_GENERATED, 'auto')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED).mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Apply automatically
                                </ModeButton>
                                <ModeButton
                                  $active={getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED).mode === 'suggest'}
                                  onClick={() => setFeatureMode(AUTO_TAG_FEATURES.AI_GENERATED, 'suggest')}
                                >
                                  {getFeatureSettings(AUTO_TAG_FEATURES.AI_GENERATED).mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                                  Suggest only
                                </ModeButton>
                              </ModeSelector>
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>

                      {/* Linked Note Auto-Tagging */}
                      <AutoTagRow $isDark={isDarkTheme}>
                        <AutoTagHeader>
                          <AutoTagTitle>
                            <Icon name="notes" size={18} />
                            Linked Note
                          </AutoTagTitle>
                          <Switch
                            id="linked-note-autotag-toggle"
                            checked={getFeatureSettings(AUTO_TAG_FEATURES.LINKED_NOTE).enabled}
                            onChange={() => toggleFeatureEnabled(AUTO_TAG_FEATURES.LINKED_NOTE)}
                          />
                        </AutoTagHeader>
                        <AutoTagDescription>
                          Automatically tag notes created via "Add Note" from within another note.
                        </AutoTagDescription>
                        
                        {getFeatureSettings(AUTO_TAG_FEATURES.LINKED_NOTE).enabled && (
                          <AutoTagOptions>
                            <OptionRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                              <OptionLabel>Tags to apply:</OptionLabel>
                              <TagMultiSelect
                                selectedTagIds={getFeatureSettings(AUTO_TAG_FEATURES.LINKED_NOTE).tagIds || []}
                                onChange={(tagIds) => setFeatureTags(AUTO_TAG_FEATURES.LINKED_NOTE, tagIds)}
                                placeholder="Search and add tags..."
                              />
                            </OptionRow>
                          </AutoTagOptions>
                        )}
                      </AutoTagRow>
                    </SectionContainer>
                  </>
                )}

                {activeSection === 'help' && (
                  <>
                    <SectionContainer>
                      <SectionTitle>Advanced Search Guide</SectionTitle>
                      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
                        This search supports advanced operators to help you find your notes more efficiently.
                      </p>
                      <OperatorsList>
                        <OperatorItem>
                          <OperatorSymbol>"phrase"</OperatorSymbol>
                          <OperatorDescription>
                            Search for an exact phrase with words in that exact order.
                          </OperatorDescription>
                        </OperatorItem>
                        
                        <OperatorItem>
                          <OperatorSymbol>term1 OR term2</OperatorSymbol>
                          <OperatorDescription>
                            Find notes containing either term1 or term2 (or both).
                          </OperatorDescription>
                        </OperatorItem>
                        
                        <OperatorItem>
                          <OperatorSymbol>-word</OperatorSymbol>
                          <OperatorDescription>
                            Exclude notes containing this word.
                          </OperatorDescription>
                        </OperatorItem>
                        
                        <OperatorItem>
                          <OperatorSymbol>word1 * word2</OperatorSymbol>
                          <OperatorDescription>
                            Find notes with word1 followed by any word, then word2.
                          </OperatorDescription>
                        </OperatorItem>
                        
                        <OperatorItem>
                          <OperatorSymbol>#tag</OperatorSymbol>
                          <OperatorDescription>
                            Find notes with a specific tag.
                          </OperatorDescription>
                        </OperatorItem>
                        
                        <OperatorItem>
                          <OperatorSymbol>$color</OperatorSymbol>
                          <OperatorDescription>
                            Find notes with a specific color (default, red, blue, etc.).
                          </OperatorDescription>
                        </OperatorItem>
                        
                        <OperatorItem>
                          <OperatorSymbol>yr:YYYY[:MMM]</OperatorSymbol>
                          <OperatorDescription>
                            Find notes created in a specific year, or year and month (e.g., `yr:2024`, `yr:2024:mar`, `yr:2024:September`).
                          </OperatorDescription>
                        </OperatorItem>
                      </OperatorsList>
                    </SectionContainer>

                    <SectionContainer>
                      <SectionTitle>Keyboard Shortcuts</SectionTitle>
                      <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-secondary-color)' }}>
                        Shortcuts available while editing or selecting notes.
                      </p>
                      <OperatorsList>
                        <OperatorItem>
                          <OperatorSymbol>Ctrl / Cmd + A</OperatorSymbol>
                          <OperatorDescription>
                            Select all visible notes (bulk selection mode only).
                          </OperatorDescription>
                        </OperatorItem>
                        <OperatorItem>
                          <OperatorSymbol>Delete</OperatorSymbol>
                          <OperatorDescription>
                            Move selected notes to trash (bulk selection mode only).
                          </OperatorDescription>
                        </OperatorItem>
                        <OperatorItem>
                          <OperatorSymbol>Escape</OperatorSymbol>
                          <OperatorDescription>
                            Clear selection and exit bulk selection mode. Also closes the open note form.
                          </OperatorDescription>
                        </OperatorItem>
                      </OperatorsList>
                    </SectionContainer>

                  </>
                )}

                {activeSection === 'advanced' && (
                  <>
                    <SectionContainer>
                      <SectionTitle>Puppeteer</SectionTitle>
                      <FormGroup>
                        <Label>Chromium Executable Path</Label>
                        <Input 
                          type="text" 
                          name="PUPPETEER_EXECUTABLE_PATH" 
                          value={settings.PUPPETEER_EXECUTABLE_PATH} 
                          onChange={handleChange}
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
                          max="1000"
                          value={settings.CACHE_MAX_SIZE || '200'}
                          onChange={(e) => handleCacheSettingChange('CACHE_MAX_SIZE', e.target.value)}
                        />
                        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
                          Maximum number of full notes to keep in cache. Default: 200
                        </p>
                      </FormGroup>

                      <FormGroup>
                        <Label>Prefetch Batch Size</Label>
                        <Input
                          type="number"
                          min="1"
                          max="50"
                          value={settings.PREFETCH_BATCH_SIZE || '10'}
                          onChange={(e) => handleCacheSettingChange('PREFETCH_BATCH_SIZE', e.target.value)}
                        />
                        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
                          Number of notes to prefetch per batch. Default: 10
                        </p>
                      </FormGroup>

                      <FormGroup>
                        <Label>Batch Delay (milliseconds)</Label>
                        <Input
                          type="number"
                          min="100"
                          max="5000"
                          step="100"
                          value={settings.BATCH_DELAY_MS || '500'}
                          onChange={(e) => handleCacheSettingChange('BATCH_DELAY_MS', e.target.value)}
                        />
                        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
                          Delay between prefetch batches. Default: 500ms
                        </p>
                      </FormGroup>

                      <FormGroup>
                        <Label>Cache TTL (milliseconds)</Label>
                        <Input
                          type="number"
                          min="60000"
                          max="3600000"
                          step="60000"
                          value={settings.CACHE_TTL_MS || '300000'}
                          onChange={(e) => handleCacheSettingChange('CACHE_TTL_MS', e.target.value)}
                        />
                        <p style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary-color)' }}>
                          Cache time-to-live (how long before cached notes expire). Default: 300000ms (5 minutes)
                        </p>
                      </FormGroup>
                    </SectionContainer>
                  </>
                )}

              </>
            )}
          </ContentArea>
          </MainContent>
        </ModalBody>
      </ModalContainer>
    </ModalOverlay>
  );
};

export default SettingsModal;
