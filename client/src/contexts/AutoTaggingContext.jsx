import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import api from '../services/api';
import env from '../../env';
import { useSettings } from './SettingsContext';

// Auto-tagging feature identifiers
export const AUTO_TAG_FEATURES = {
  REMINDERS: 'reminders',
  BOOK_FINISHED: 'book_finished',
  BOOK_ADDED: 'book_added',
  IMDB_ADDED: 'imdb_added',
  URL_CONTENT: 'url_content',
  TAG_SEARCH: 'tag_search',
  AI_GENERATED: 'ai_generated',
  LINKED_NOTE: 'linked_note',
  // Add more features here as needed
};

// Default settings for each auto-tagging feature
const DEFAULT_AUTO_TAG_SETTINGS = {
  [AUTO_TAG_FEATURES.REMINDERS]: {
    enabled: false, // Disabled by default - user needs to configure
    mode: 'auto', // 'auto' = directly applied, 'suggest' = suggested
    tagIds: [], // Empty - user should select their own tags
  },
  [AUTO_TAG_FEATURES.BOOK_FINISHED]: {
    enabled: false, // Disabled by default - user needs to configure
    mode: 'auto', // 'auto' = directly applied, 'suggest' = suggested
    tagIds: [], // Empty - user should select their own tags
  },
  [AUTO_TAG_FEATURES.BOOK_ADDED]: {
    enabled: false, // Disabled by default - user needs to configure
    mode: 'auto', // 'auto' = directly applied, 'suggest' = suggested
    tagIds: [], // Empty - user should select
  },
  [AUTO_TAG_FEATURES.IMDB_ADDED]: {
    enabled: false, // Disabled by default - user needs to configure
    mode: 'auto', // 'auto' = directly applied, 'suggest' = suggested
    tagIds: [], // Empty - user should select
  },
  [AUTO_TAG_FEATURES.URL_CONTENT]: {
    enabled: false, // Disabled by default - user needs to configure
    mode: 'auto', // 'auto' = directly applied, 'suggest' = suggested
    tagIds: [], // Empty - user should select
  },
  [AUTO_TAG_FEATURES.TAG_SEARCH]: {
    enabled: true, // Enabled by default since it doesn't need tag configuration
    mode: 'suggest', // Default to suggest for this feature
    // No tagIds - tags come from search context
  },
  [AUTO_TAG_FEATURES.AI_GENERATED]: {
    enabled: true, // Enabled by default
    mode: 'auto', // Default to auto-apply for backward compatibility
    // No tagIds - tags come from AI
  },
  [AUTO_TAG_FEATURES.LINKED_NOTE]: {
    enabled: false, // Disabled by default - user needs to configure
    mode: 'auto', // Only auto mode supported for this feature
    tagIds: [], // Empty - user should select their own tags
  },
};

// Helper to migrate old settings format (single tagId) to new format (tagIds array)
const migrateSettings = (settings) => {
  const migrated = { ...settings };
  Object.keys(migrated).forEach(key => {
    const feature = migrated[key];
    // If old format (has tagId but not tagIds), migrate
    if (feature && feature.tagId !== undefined && !feature.tagIds) {
      migrated[key] = {
        enabled: feature.enabled,
        mode: feature.mode,
        tagIds: feature.tagId ? [feature.tagId] : [],
      };
    }
  });
  return migrated;
};

// Create the context
const AutoTaggingContext = createContext();

// Hook to use the AutoTagging context
export const useAutoTagging = () => {
  const context = useContext(AutoTaggingContext);
  if (!context) {
    throw new Error('useAutoTagging must be used within an AutoTaggingProvider');
  }
  return context;
};

// AutoTagging Provider component
export const AutoTaggingProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULT_AUTO_TAG_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);

  const { settings: serverSettings, isLoading } = useSettings();

  // Populate from shared SettingsContext when data arrives
  useEffect(() => {
    if (!serverSettings.AUTO_TAGGING_SETTINGS) return;
    try {
      const parsed = JSON.parse(serverSettings.AUTO_TAGGING_SETTINGS);
      const migrated = migrateSettings(parsed);
      setSettings({ ...DEFAULT_AUTO_TAG_SETTINGS, ...migrated });
      console.log('[AutoTagging] Loaded settings from server:', migrated);
    } catch (parseError) {
      console.error('[AutoTagging] Error parsing server settings:', parseError);
    }
  }, [serverSettings.AUTO_TAGGING_SETTINGS]);

  // Save settings to server
  const saveSettingsToServer = useCallback(async (newSettings) => {
    setIsSaving(true);
    try {
      await api.post('/settings', {
        AUTO_TAGGING_SETTINGS: JSON.stringify(newSettings)
      });
      console.log('[AutoTagging] Saved settings to server');
    } catch (error) {
      console.error('[AutoTagging] Error saving settings to server:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Get settings for a specific feature
  const getFeatureSettings = useCallback((featureId) => {
    return settings[featureId] || DEFAULT_AUTO_TAG_SETTINGS[featureId] || {
      enabled: false,
      mode: 'suggest',
      tagIds: [],
    };
  }, [settings]);

  // Update settings for a specific feature
  const updateFeatureSettings = useCallback((featureId, updates) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        [featureId]: {
          ...prev[featureId],
          ...updates,
        },
      };
      saveSettingsToServer(newSettings);
      return newSettings;
    });
  }, [saveSettingsToServer]);

  // Toggle enabled state for a feature
  const toggleFeatureEnabled = useCallback((featureId) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        [featureId]: {
          ...prev[featureId],
          enabled: !prev[featureId]?.enabled,
        },
      };
      saveSettingsToServer(newSettings);
      return newSettings;
    });
  }, [saveSettingsToServer]);

  // Set the mode for a feature ('auto' or 'suggest')
  const setFeatureMode = useCallback((featureId, mode) => {
    if (mode !== 'auto' && mode !== 'suggest') {
      console.warn('Invalid mode:', mode);
      return;
    }
    setSettings(prev => {
      const newSettings = {
        ...prev,
        [featureId]: {
          ...prev[featureId],
          mode,
        },
      };
      saveSettingsToServer(newSettings);
      return newSettings;
    });
  }, [saveSettingsToServer]);

  // Set the tags for a feature (array of tag IDs)
  const setFeatureTags = useCallback((featureId, tagIds) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        [featureId]: {
          ...prev[featureId],
          tagIds: tagIds || [],
        },
      };
      saveSettingsToServer(newSettings);
      return newSettings;
    });
  }, [saveSettingsToServer]);

  // Check if a feature should auto-apply tags
  const shouldAutoApply = useCallback((featureId) => {
    const featureSettings = settings[featureId];
    return featureSettings?.enabled && featureSettings?.mode === 'auto' && featureSettings?.tagIds?.length > 0;
  }, [settings]);

  // Check if a feature should suggest tags
  const shouldSuggestTag = useCallback((featureId) => {
    const featureSettings = settings[featureId];
    return featureSettings?.enabled && featureSettings?.mode === 'suggest' && featureSettings?.tagIds?.length > 0;
  }, [settings]);

  // Get the tag IDs for a feature (returns empty array if not configured)
  const getFeatureTags = useCallback((featureId) => {
    const featureSettings = settings[featureId];
    if (!featureSettings?.enabled || !featureSettings?.tagIds?.length) {
      return [];
    }
    return featureSettings.tagIds;
  }, [settings]);

  // Legacy: Get the first tag info for a feature (for backward compatibility)
  const getFeatureTag = useCallback((featureId) => {
    const featureSettings = settings[featureId];
    if (!featureSettings?.enabled || !featureSettings?.tagIds?.length) {
      return null;
    }
    return {
      id: featureSettings.tagIds[0],
      name: null, // Names are looked up from tags context
    };
  }, [settings]);

  // Context value
  const contextValue = useMemo(() => ({
    settings,
    isLoading,
    isSaving,
    getFeatureSettings,
    updateFeatureSettings,
    toggleFeatureEnabled,
    setFeatureMode,
    setFeatureTags,
    shouldAutoApply,
    shouldSuggestTag,
    getFeatureTags,
    getFeatureTag, // Legacy - for backward compatibility
    AUTO_TAG_FEATURES,
  }), [
    settings,
    isLoading,
    isSaving,
    getFeatureSettings,
    updateFeatureSettings,
    toggleFeatureEnabled,
    setFeatureMode,
    setFeatureTags,
    shouldAutoApply,
    shouldSuggestTag,
    getFeatureTags,
    getFeatureTag,
  ]);

  return (
    <AutoTaggingContext.Provider value={contextValue}>
      {children}
    </AutoTaggingContext.Provider>
  );
};

export default AutoTaggingContext;
