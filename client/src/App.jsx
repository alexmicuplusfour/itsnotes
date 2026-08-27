import React, { useEffect, useRef, useMemo } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import NotesList from './components/NotesList';
import ListView from './components/ListView';
import NoteForm from './components/NoteForm';
import TagsModal from './components/TagsModal';
import QuickAccess from './components/QuickAccess';
import ImportPage from './components/ImportPage';
import SharePage from './components/SharePage';
import FixedStarredNotesTabs from './components/FixedStarredNotesTabs';
import ProtectedRoute from './components/ProtectedRoute';
import { NotesProvider } from './contexts/NotesContext';
import { TagsProvider } from './contexts/TagsContext';
import { StarredNotesProvider } from './contexts/StarredNotesContext';
import { SortingProvider } from './contexts/SortingContext';
import { useNotes, useNotesLoading } from './contexts/NotesContext';
import { useTags } from './contexts/TagsContext';
import { useUIPreferences } from './contexts/UIPreferencesContext';
import { TypingProvider } from './contexts/TypingContext'; // Import TypingProvider
import { NoteSelectionProvider } from './contexts/NoteSelectionContext'; // Import NoteSelectionProvider
import { NoteActionsProvider } from './contexts/NoteActionsContext'; // Import NoteActionsProvider for stable action references
import { AutoTaggingProvider } from './contexts/AutoTaggingContext'; // Import AutoTaggingProvider for auto-tagging settings
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ToastProvider, useToast } from './contexts/ToastContext'; // Import ToastProvider for global toast notifications
import { COLORS } from './components/ColorPicker'; // Import COLORS for label translation
import { NavigationProvider, useNavigation } from './navigation'; // Import new navigation system
import noteFormSaveRegistry from './services/noteFormSaveRegistry'; // Global save function registry
import socketService from './services/socket';
import DemoBanner from './components/DemoBanner';
import ColorPreloader from './components/ColorPreloader'; // Import color preloader for performance

function App() {
  const location = useLocation();

  // Web Share Target landing (/share?title=&text=&url=): only needs auth + the
  // API client, so it renders instead of the full provider tree. Saving
  // navigates to /?note=<id>, which mounts the app normally.
  if (location.pathname === '/share') {
    return (
      <ProtectedRoute>
        <SharePage />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <ToastProvider>
        <TagsProvider>
          <SettingsProvider>
          <AutoTaggingProvider>
            <SortingProvider>
              <NavigationProvider>
                <NotesProvider>
                  <NavigationBridge>
                    <NoteActionsProvider>
                      <StarredNotesProvider>
                        <AppContent />
                      </StarredNotesProvider>
                    </NoteActionsProvider>
                  </NavigationBridge>
                </NotesProvider>
              </NavigationProvider>
            </SortingProvider>
          </AutoTaggingProvider>
          </SettingsProvider>
        </TagsProvider>
      </ToastProvider>
    </ProtectedRoute>
  );
}

// Navigation Bridge Component - connects NotesContext callbacks to NavigationContext
const NavigationBridge = ({ children }) => {
  const { openNoteById, closeNoteWithoutUrlUpdate, handleSearch } = useNotes();
  const { layoutView } = useUIPreferences();
  const { service, setViewType } = useNavigation();

  // Save note by calling NoteForm's registered save function
  const handleSaveNote = React.useCallback(async (noteId) => {
    console.log('[NavigationBridge] Saving note:', noteId);
    try {
      await noteFormSaveRegistry.save({ forceSaveOnClose: false });
    } catch (error) {
      console.error('[NavigationBridge] Save failed:', error);
    }
  }, []);

  // Convert openNoteById to async function for NavigationProvider
  const handleFetchNote = React.useCallback(async (noteId) => {
    console.log('[NavigationBridge] Fetching note:', noteId);
    // openNoteById from NotesContext - already handles fetching
    if (openNoteById) {
      await openNoteById(noteId);
    }
  }, [openNoteById]);

  // Close note callback - called AFTER URL is updated by NavigationService
  const handleCloseNote = React.useCallback(async (options = {}) => {
    console.log('[NavigationBridge] Closing note UI (URL already updated)');
    // URL has already been updated by NavigationService
    // Just close the note in NotesContext without URL manipulation
    // Pass skipFlushSync when called from URL watcher effect to avoid React warning
    if (closeNoteWithoutUrlUpdate) {
      closeNoteWithoutUrlUpdate(options);
    }
  }, [closeNoteWithoutUrlUpdate]);

  // Search callback - called when search query changes in URL
  const handleSearchFromNav = React.useCallback(async (query) => {
    console.log('[NavigationBridge] Triggering search:', query);
    if (handleSearch) {
      await handleSearch(query, true, false); // refresh=true, pushHistory=false
    }
  }, [handleSearch]);

  // Clear search callback - called when search is cleared from URL
  const handleClearSearch = React.useCallback(async () => {
    console.log('[NavigationBridge] Clearing search');
    if (handleSearch) {
      await handleSearch('', true, false); // Empty query exits search mode
    }
  }, [handleSearch]);

  // Note: view changes are driven entirely by the URL now. NavigationService.changeView
  // navigates the path, and NotesContext derives `view` from the path reactively, so there
  // is no view-change callback to register — the view follows the address bar automatically.

  // Set callbacks on the service when they're ready
  useEffect(() => {
    service.onSaveNote(handleSaveNote);
    service.onFetchNote(handleFetchNote);
    service.onCloseNote(handleCloseNote);
    service.onSearch(handleSearchFromNav);
    service.onClearSearch(handleClearSearch);
  }, [service, handleSaveNote, handleFetchNote, handleCloseNote, handleSearchFromNav, handleClearSearch]);

  // Sync view type
  useEffect(() => {
    const viewType = layoutView === 'list' ? 'list' : 'grid';
    setViewType(viewType);
  }, [layoutView, setViewType]);

  return children;
};

// Main app content component that uses the data providers
const AppContent = () => {
  const renderID = useRef(Math.random().toString(36).substr(2, 9));
  const renderCount = useRef(0);
  renderCount.current++;
  console.log(`[AppContent Render #${renderCount.current} - ID: ${renderID.current}]`);

  const location = useLocation(); // Get location object
  const noteFormRef = useRef();
  const notesContext = useNotes(); // Get the entire notes context
  const {
    searchMode,
    searchResults,
    searchQuery,
    totalNotes,
    searchCountQuery,
    view,
    openedNote,
  } = notesContext;
  const { listLoading } = useNotesLoading();

  const { showQuickAccess, showNoteTabs, colorLabels, setAllColorLabels, layoutView, setPageBackgroundEnabled } = useUIPreferences();
  const { settings: serverSettings } = useSettings();
  const { closeNote } = useNavigation(); // Get closeNote from NavigationContext

  // Determine if we're in list view mode
  const isListView = layoutView === 'list';

  console.log(`[AppContent - ${renderID.current}] isListView=${isListView}, openedNote=${openedNote?.id}, location=${location.pathname}`);

  const { showTagsModal, setShowTagsModal } = useTags();

  // Translate actual color names to custom labels for display in search results title
  const displaySearchQuery = useMemo(() => {
    if (!searchQuery) return searchQuery;
    return searchQuery.replace(/\$([a-zA-Z]+)/g, (match, colorName) => {
      const lower = colorName.toLowerCase();
      const actualColor = COLORS.find(c => c.toLowerCase() === lower);
      if (actualColor && colorLabels[actualColor]) {
        return `$${colorLabels[actualColor]}`;
      }
      return match;
    });
  }, [searchQuery, colorLabels]);

  // Debug: Log when showNoteTabs changes
  useEffect(() => {
    console.log("App: showNoteTabs changed to:", showNoteTabs);
  }, [showNoteTabs]);

  // Sync server settings to localStorage on startup (for Foxit integration etc.)
  useEffect(() => {
    if (!serverSettings || Object.keys(serverSettings).length === 0) return;
    localStorage.setItem('foxitEnabled', String(serverSettings.FOXIT_ENABLED === true || serverSettings.FOXIT_ENABLED === 'true'));
    localStorage.setItem('foxitSnooperUrl', serverSettings.FOXIT_SNOOPER_URL || '');
    if (serverSettings.COLOR_LABELS) {
      try {
        setAllColorLabels(JSON.parse(serverSettings.COLOR_LABELS));
      } catch (e) {
        console.error('App: Error parsing COLOR_LABELS:', e);
      }
    }
    setPageBackgroundEnabled(serverSettings.BACKGROUND_ENABLED === true || serverSettings.BACKGROUND_ENABLED === 'true');
  }, [serverSettings, setAllColorLabels]);

  // --- Reminder Notifications ---
  const { showToast } = useToast();

  useEffect(() => {
    // Request notification permission on load
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(err => console.error("App: Failed to request notification permission", err));
    }

    const handleReminder = (data) => {
      console.log("App: Reminder triggered", data);
      showToast(data.message || `Reminder: ${data.title}`, { duration: 'long' });

      // Browser Notification
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(data.title || 'Reminder', {
            body: data.message || `Reminder: ${data.title}`,
            icon: '/pwa/icon-192.png'
          });
        } catch (e) {
          console.error("App: Failed to show browser notification", e);
        }
      }
    };

    const handleDemoReset = () => {
      window.location.reload();
    };

    const socket = socketService.socket;
    if (socket) {
      socket.on('reminder_triggered', handleReminder);
      socket.on('demo_reset', handleDemoReset);
    }

    return () => {
      if (socket) {
        socket.off('reminder_triggered', handleReminder);
        socket.off('demo_reset', handleDemoReset);
      }
    };
  }, []);

  // --- New Navigation System handles URL watching ---
  // The NavigationContext now watches the URL and manages state
  // Old URL watching code removed - handled by NavigationProvider

  useEffect(() => {
    console.log("App: openedNote updated:", openedNote?.id);
  }, [openedNote]);

  // --- Modified handleCloseNote - uses new navigation system ---
  const handleCloseNote = () => {
    console.log("handleCloseNote called via new navigation system");
    closeNote(); // Use NavigationContext's closeNote
  };

  // --- Check if the current page is the import page ---
  const isImportPage = location.pathname === '/import';

  // ListView (when layoutView === 'list') handles its own NoteForm in split pane
  // Grid/Stacked views use the NoteForm rendered below

  return (
    <TypingProvider> {/* Wrap the entire app content */}
      <NoteSelectionProvider notesContext={notesContext}>
        <DemoBanner />
        <div className="app">
        {/* ...existing app content... */}
        {/* Conditionally render Header */}
        {!isImportPage && <Header />}

          {/* Conditionally render the main layout container */}
          {!isImportPage ? (
            <div className="main-container">
              {/* Conditionally render QuickAccess based on its original conditions AND not being the import page */}
              {view === 'main' && !searchMode && showQuickAccess && !isListView && (
                <QuickAccess />
              )}
              <main className={`content ${isListView ? 'list-view-content' : ''}`}>
                {isListView ? (
                  // List View - renders its own split pane layout
                  <Routes>
                    <Route path="/" element={<ListView searchQuery={searchQuery} />} />
                    <Route path="/archive" element={<ListView searchQuery={searchQuery} />} />
                    <Route path="/trash" element={<ListView searchQuery={searchQuery} />} />
                    <Route path="/search" element={<ListView searchQuery={searchQuery} />} />
                    <Route path="/tag/:tagId" element={<ListView searchQuery={searchQuery} />} />
                    <Route path="/import" element={<ImportPage />} />
                  </Routes>
                ) : (
                  // Grid/Stacked Views - existing layout
                  <>
                    <Routes>
                  <Route
                    path="/"
                    element={
                      <NotesList
                        title={searchMode ? ((listLoading || searchCountQuery !== searchQuery) ? `Searching for "${displaySearchQuery}"...` : `${totalNotes} result${totalNotes !== 1 ? 's' : ''} for "${displaySearchQuery}"`) : ""}
                        notes={searchMode ? searchResults : undefined}
                        showPinned={!searchMode && view === 'main'}
                      />
                    }
                  />
                  <Route
                    path="/archive"
                    element={
                      <NotesList
                        title="Archive"
                        notes={searchMode ? searchResults : undefined}
                        showPinned={false}
                      />
                    }
                  />
                  <Route
                    path="/trash"
                    element={
                      <NotesList
                        title="Trash"
                        notes={searchMode ? searchResults : undefined}
                        showPinned={false}
                      />
                    }
                  />
                  {/* Import route is still needed here for the router to match */}
                  <Route
                    path="/import"
                    element={<ImportPage />} // This will be rendered inside the main container, but the container itself is hidden if isImportPage is true
                  />
                </Routes>
                {/* Render NoteForm INSIDE main.content if openedNote exists */}
                {(() => {
                  const shouldRender = !isImportPage && !isListView && openedNote;
                  const noteKey = openedNote?.id || 'new-note';
                  console.log(`[App.jsx NoteForm Check - ${renderID.current}] shouldRender=${shouldRender}, noteKey=${noteKey} (isImportPage=${isImportPage}, isListView=${isListView}, openedNote=${!!openedNote})`);
                  return shouldRender ? (
                    <NoteForm
                      data-source="App.jsx"
                      key={noteKey}
                      ref={noteFormRef}
                      note={openedNote}
                      onClose={handleCloseNote}
                    />
                  ) : null;
                })()}
                  </>
                )}
              </main>
            </div>
          ) : (
            // If it IS the import page, render ONLY the Routes component
            // which will then render the ImportPage component directly under div.app
            <main className="import-page-container"> {/* Optional: Add specific class for styling */}
              <Routes>
                <Route path="/import" element={<ImportPage />} />
                {/* Optional: Add a catch-all or redirect if someone lands here incorrectly */}
                {/* <Route path="*" element={<Navigate to="/" replace />} /> */}
              </Routes>
            </main>
          )}

          {/* TagsModal remains outside main content */}
          {!isImportPage && showTagsModal && <TagsModal onClose={() => setShowTagsModal(false)} />}

          {/* Fixed Starred Notes Tabs - With key to force re-render when showNoteTabs changes */}
          {showNoteTabs && <FixedStarredNotesTabs key={`tabs-${showNoteTabs}`} />}

          {/* Preload all note color styles to prevent first-render lag */}
          <ColorPreloader />
        </div>
      </NoteSelectionProvider>
    </TypingProvider>
  );
};

export default App;
