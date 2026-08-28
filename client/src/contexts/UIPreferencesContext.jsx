import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { generateBackground, adaptBackgroundForTheme } from '../utils/backgrounds';
import ThemeManager from '../utils/ThemeManager';

// Create the UIPreferences context
const UIPreferencesContext = createContext();

// Hook to use the UIPreferences context
export const useUIPreferences = () => {
  const context = useContext(UIPreferencesContext);
  if (!context) {
    throw new Error('useUIPreferences must be used within a UIPreferencesProvider');
  }
  return context;
};

// UIPreferences Provider component
export const UIPreferencesProvider = ({ children }) => {
  // --- Persisted UI Preferences (using localStorage) ---
  
  const [savedSearches, setSavedSearches] = useState(() => {
    const saved = localStorage.getItem('savedSearches');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [layoutView, setLayoutView] = useState(() => {
    const savedLayout = localStorage.getItem('layoutView');
    // Support grid, stacked, and list layouts
    if (['grid', 'stacked', 'list'].includes(savedLayout)) {
      return savedLayout;
    }
    return 'grid'; // Default 'grid' (also catches the removed 'overview' layout)
  });
  
  const [showQuickAccess, setShowQuickAccess] = useState(() => {
    const savedQuickAccess = localStorage.getItem('showQuickAccess');
    return savedQuickAccess === 'true'; // Default true
  }); 
  
  const [showMonthMarkers, setShowMonthMarkers] = useState(() => {
    const savedMonthMarkers = localStorage.getItem('showMonthMarkers');
    return savedMonthMarkers !== 'false'; // Default true
  });
  
  const [showNoteTabs, setShowNoteTabs] = useState(() => {
    const savedNoteTabs = localStorage.getItem('showNoteTabs');
    return savedNoteTabs !== 'false'; // Default true
  });

  // Link preview cards on notes: whether to show them at all, and whether to show
  // the preview image inside them (the image is always fetched server-side; this
  // only controls display).
  const [showLinkPreviews, setShowLinkPreviews] = useState(() => {
    return localStorage.getItem('showLinkPreviews') !== 'false'; // Default true
  });

  const [showLinkPreviewImages, setShowLinkPreviewImages] = useState(() => {
    return localStorage.getItem('showLinkPreviewImages') !== 'false'; // Default true
  });
  
  const [fullscreenNoteForm, setFullscreenNoteForm] = useState(() => {
    const saved = localStorage.getItem('fullscreenNoteForm');
    return saved === 'true'; // Default false
  });

  // Thumbnail strip at the bottom of the note editor
  const [showNoteFormGallery, setShowNoteFormGallery] = useState(() => {
    return localStorage.getItem('showNoteFormGallery') !== 'false'; // Default true
  });

  // Thumbnail strip on note cards (grid/stacked views)
  const [showNoteCardGallery, setShowNoteCardGallery] = useState(() => {
    return localStorage.getItem('showNoteCardGallery') !== 'false'; // Default true
  });

  const [pinnedFolderIds, setPinnedFolderIds] = useState(() => {
    const saved = localStorage.getItem('pinnedFolderIds');
    return saved ? JSON.parse(saved) : [];
  });

  // AI enabled
  const [aiEnabled, setAiEnabledState] = useState(() => {
    return localStorage.getItem('aiEnabled') !== 'false'; // Default true
  });

  const setAiEnabled = useCallback((enabled) => {
    setAiEnabledState(enabled);
    localStorage.setItem('aiEnabled', String(enabled));
  }, []);

  // Note body typography: family (sans|serif) and size (s|m|l)
  const [notesFontFamily, setNotesFontFamilyState] = useState(() => {
    const saved = localStorage.getItem('notesFontFamily');
    return saved === 'serif' ? 'serif' : 'sans';
  });
  const [notesBodyFontSize, setNotesBodyFontSizeState] = useState(() => {
    const saved = localStorage.getItem('notesBodyFontSize');
    return ['s', 'm', 'l'].includes(saved) ? saved : 'm';
  });

  const setNotesFontFamily = useCallback((family) => {
    const next = family === 'serif' ? 'serif' : 'sans';
    setNotesFontFamilyState(next);
    localStorage.setItem('notesFontFamily', next);
  }, []);

  const setNotesBodyFontSize = useCallback((size) => {
    const next = ['s', 'm', 'l'].includes(size) ? size : 'm';
    setNotesBodyFontSizeState(next);
    localStorage.setItem('notesBodyFontSize', next);
  }, []);

  // Apply typography CSS variables to :root
  useEffect(() => {
    const root = document.documentElement;
    const family = notesFontFamily === 'serif'
      ? "'Source Serif 4', Georgia, 'Times New Roman', serif"
      : "'Product Sans', Arial, sans-serif";
    root.style.setProperty('--note-body-font-family', family);

    const sizeMap = {
      s: { form: '14px', card: '13px' },
      m: { form: '16px', card: '15px' },
      l: { form: '18px', card: '17px' },
    };
    const sizes = sizeMap[notesBodyFontSize] || sizeMap.m;
    root.style.setProperty('--note-body-font-size', sizes.form);
    root.style.setProperty('--note-card-body-font-size', sizes.card);
  }, [notesFontFamily, notesBodyFontSize]);

  // Page background — a meshgrad-generated mesh gradient. We store the full
  // base mesh (full-lightness) for the session and re-light it per theme.
  const [pageBackgroundEnabled, _setPageBackgroundEnabled] = useState(false);
  const [pageBgBase, setPageBgBase] = useState(() => {
    return sessionStorage.getItem('pageBgBase') || null;
  });
  const [isDarkTheme, setIsDarkTheme] = useState(() => ThemeManager.getTheme());

  const regenerateBackground = useCallback(() => {
    const base = generateBackground();
    sessionStorage.setItem('pageBgBase', base);
    setPageBgBase(base);
  }, []);

  const setPageBackgroundEnabled = useCallback((enabled) => {
    _setPageBackgroundEnabled(enabled);
    if (enabled && !sessionStorage.getItem('pageBgBase')) {
      const base = generateBackground();
      sessionStorage.setItem('pageBgBase', base);
      setPageBgBase(base);
    }
  }, []);

  // Apply the current mesh, re-lit for the active theme.
  useEffect(() => {
    if (pageBackgroundEnabled && pageBgBase) {
      document.documentElement.style.setProperty('--page-bg-image', adaptBackgroundForTheme(pageBgBase, isDarkTheme));
    } else {
      document.documentElement.style.removeProperty('--page-bg-image');
    }
  }, [pageBackgroundEnabled, pageBgBase, isDarkTheme]);

  // Track theme changes so the same mesh gets re-lit on dark/light toggle.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = ThemeManager.getTheme();
      setIsDarkTheme(prev => (prev !== dark ? dark : prev));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Color labels - custom display names for colors (e.g., "coral" -> "red")
  const [colorLabels, setColorLabels] = useState(() => {
    const saved = localStorage.getItem('colorLabels');
    return saved ? JSON.parse(saved) : {};
  });

  // --- Layout View Functions ---
  
  const toggleLayoutView = useCallback(() => {
    setLayoutView(prevView => {
      const newView = prevView === 'grid' ? 'stacked' : 'grid';
      localStorage.setItem('layoutView', newView);
      return newView;
    });
  }, []);

  const changeLayoutView = useCallback((newView) => {
    console.log('[UIPreferences] changeLayoutView called with:', newView, 'current:', layoutView);
    if (layoutView === newView || !['grid', 'stacked', 'list'].includes(newView)) {
      console.log('[UIPreferences] changeLayoutView early return - same or invalid');
      return;
    }

    console.log('[UIPreferences] Setting layoutView to:', newView);
    setLayoutView(newView);
    localStorage.setItem('layoutView', newView);
  }, [layoutView]);

  // --- UI Toggle Functions ---
  
  const toggleQuickAccess = useCallback(() => {
    setShowQuickAccess(prevShow => {
      const newShow = !prevShow;
      localStorage.setItem('showQuickAccess', String(newShow));
      return newShow;
    });
  }, []);

  const toggleMonthMarkers = useCallback(() => {
    setShowMonthMarkers(prevShow => {
      const newShow = !prevShow;
      localStorage.setItem('showMonthMarkers', String(newShow));
      return newShow;
    });
  }, []);

  const toggleNoteTabs = useCallback(() => {
    console.log("toggleNoteTabs called, current value:", showNoteTabs);
    setShowNoteTabs(prevShow => {
      const newShow = !prevShow;
      console.log("toggleNoteTabs setting to:", newShow);
      localStorage.setItem('showNoteTabs', String(newShow));
      return newShow;
    });
  }, [showNoteTabs]);

  const toggleLinkPreviews = useCallback(() => {
    setShowLinkPreviews(prevShow => {
      const newShow = !prevShow;
      localStorage.setItem('showLinkPreviews', String(newShow));
      return newShow;
    });
  }, []);

  const toggleLinkPreviewImages = useCallback(() => {
    setShowLinkPreviewImages(prevShow => {
      const newShow = !prevShow;
      localStorage.setItem('showLinkPreviewImages', String(newShow));
      return newShow;
    });
  }, []);

  const toggleFullscreenNoteForm = useCallback(() => {
    setFullscreenNoteForm(prev => {
      const newValue = !prev;
      localStorage.setItem('fullscreenNoteForm', String(newValue));
      return newValue;
    });
  }, []);

  const toggleNoteFormGallery = useCallback(() => {
    setShowNoteFormGallery(prev => {
      const newValue = !prev;
      localStorage.setItem('showNoteFormGallery', String(newValue));
      return newValue;
    });
  }, []);

  const toggleNoteCardGallery = useCallback(() => {
    setShowNoteCardGallery(prev => {
      const newValue = !prev;
      localStorage.setItem('showNoteCardGallery', String(newValue));
      return newValue;
    });
  }, []);

  // --- Pinned Folders Functions ---

  const pinFolder = useCallback((id) => {
    setPinnedFolderIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      localStorage.setItem('pinnedFolderIds', JSON.stringify(next));
      return next;
    });
  }, []);

  const unpinFolder = useCallback((id) => {
    setPinnedFolderIds(prev => {
      const next = prev.filter(fId => fId !== id);
      localStorage.setItem('pinnedFolderIds', JSON.stringify(next));
      return next;
    });
  }, []);

  // --- Saved Searches Functions ---
  
  const saveSearch = useCallback((query) => {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) return;
    setSavedSearches(prevSearches => {
      if (prevSearches.includes(trimmedQuery)) return prevSearches;
      const newSearches = [...prevSearches, trimmedQuery];
      localStorage.setItem('savedSearches', JSON.stringify(newSearches));
      return newSearches;
    });
  }, []);

  const removeSavedSearch = useCallback((query) => {
    setSavedSearches(prevSearches => {
      const newSearches = prevSearches.filter(search => search !== query);
      localStorage.setItem('savedSearches', JSON.stringify(newSearches));
      return newSearches;
    });
  }, []);

  const reorderSavedSearches = useCallback((activeId, overId) => {
    setSavedSearches(prevSearches => {
      const oldIndex = prevSearches.findIndex(search => search === activeId);
      const newIndex = prevSearches.findIndex(search => search === overId);
      
      if (oldIndex === -1 || newIndex === -1) return prevSearches;
      
      const newSearches = [...prevSearches];
      const [removed] = newSearches.splice(oldIndex, 1);
      newSearches.splice(newIndex, 0, removed);
      
      localStorage.setItem('savedSearches', JSON.stringify(newSearches));
      return newSearches;
    });
  }, []);

  // --- Color Label Functions ---

  // Set a custom label for a color
  const setColorLabel = useCallback((color, label) => {
    setColorLabels(prev => {
      const newLabels = { ...prev };
      if (label && label.trim()) {
        newLabels[color] = label.trim();
      } else {
        delete newLabels[color]; // Remove if empty to reset to default
      }
      localStorage.setItem('colorLabels', JSON.stringify(newLabels));
      return newLabels;
    });
  }, []);

  // Set all color labels at once (used for loading from DB)
  const setAllColorLabels = useCallback((labels) => {
    setColorLabels(labels || {});
    localStorage.setItem('colorLabels', JSON.stringify(labels || {}));
  }, []);

  // Get the display label for a color (returns custom label or original)
  const getColorLabel = useCallback((color) => {
    return colorLabels[color] || color;
  }, [colorLabels]);

  // --- Context Value ---
  
  const contextValue = useMemo(() => ({
    // State
    savedSearches,
    pinnedFolderIds,
    layoutView,
    showQuickAccess,
    showMonthMarkers,
    showNoteTabs,
    showLinkPreviews,
    showLinkPreviewImages,
    fullscreenNoteForm,
    showNoteFormGallery,
    showNoteCardGallery,
    colorLabels,
    pageBackgroundEnabled,
    pageBgPreview: pageBgBase ? adaptBackgroundForTheme(pageBgBase, isDarkTheme) : null,
    aiEnabled,
    notesFontFamily,
    notesBodyFontSize,

    // Functions
    pinFolder,
    unpinFolder,
    saveSearch,
    removeSavedSearch,
    reorderSavedSearches,
    toggleLayoutView,
    changeLayoutView,
    toggleQuickAccess,
    toggleMonthMarkers,
    toggleNoteTabs,
    toggleLinkPreviews,
    toggleLinkPreviewImages,
    toggleFullscreenNoteForm,
    toggleNoteFormGallery,
    toggleNoteCardGallery,
    setColorLabel,
    setAllColorLabels,
    getColorLabel,
    setPageBackgroundEnabled,
    regenerateBackground,
    setAiEnabled,
    setNotesFontFamily,
    setNotesBodyFontSize,
  }), [
    // State dependencies
    savedSearches,
    pinnedFolderIds,
    layoutView,
    showQuickAccess,
    showMonthMarkers,
    showNoteTabs,
    showLinkPreviews,
    showLinkPreviewImages,
    fullscreenNoteForm,
    showNoteFormGallery,
    showNoteCardGallery,
    colorLabels,
    pageBackgroundEnabled,
    pageBgBase,
    isDarkTheme,
    aiEnabled,
    notesFontFamily,
    notesBodyFontSize,

    // Function dependencies
    pinFolder,
    unpinFolder,
    saveSearch,
    removeSavedSearch,
    reorderSavedSearches,
    toggleLayoutView,
    changeLayoutView,
    toggleQuickAccess,
    toggleMonthMarkers,
    toggleNoteTabs,
    toggleLinkPreviews,
    toggleLinkPreviewImages,
    toggleFullscreenNoteForm,
    toggleNoteFormGallery,
    toggleNoteCardGallery,
    setColorLabel,
    setAllColorLabels,
    getColorLabel,
    setPageBackgroundEnabled,
    regenerateBackground,
    setAiEnabled,
    setNotesFontFamily,
    setNotesBodyFontSize,
  ]);

  // --- Render Provider ---
  return (
    <UIPreferencesContext.Provider value={contextValue}>
      {children}
    </UIPreferencesContext.Provider>
  );
};
