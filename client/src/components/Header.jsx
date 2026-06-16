import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useNotes } from '../contexts/NotesContext';
import { useTags } from '../contexts/TagsContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { useNoteSelection } from '../contexts/NoteSelectionContext'; // Import useNoteSelection // Import useUIPreferences
import { SORT_OPTIONS } from '../contexts/SortingContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '../navigation'; // Import new navigation system
import styled, { css, keyframes } from 'styled-components';
import NoteForm from './NoteForm';
import { ColorPicker as SharedColorPicker, COLORS, COLOR_ALIASES } from './ColorPicker'; // Import the shared ColorPicker
import Icon from './Icons';
import TypeaheadDropdown from './TypeaheadDropdown';
import NoteTagPicker from './NoteTagPicker'; // Import NoteTagPicker
import QuickSearch from './QuickSearch';
import SavedSearchManager from './SavedSearchManager';
import SettingsModal from './SettingsModal';
import { CircleIconWrapper as SharedCircleIconWrapper, HighlightedButton as SharedHighlightedButton} from './NoteForm/NoteForm.styles';
import SuccessToast from './SuccessToast'; // Import SuccessToast
import ThemeManager from '../utils/ThemeManager';
import MainNavigationMenu from './MainNavigationMenu';
import { formatPlainTextPasteToHtml, markdownToHtml } from '../utils/textToHtml.js';

// Styled component for the selection count display
const SelectionCount = styled.div`
  display: inline-block;
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color-contrast);
`;

// Styled component for the bulk action buttons container
const BulkActionsContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative; /* For color picker positioning */
  gap: 14px;
`;

// Removed BulkColorPicker and BulkColorButton styled components

const HeaderContainer = styled.header`
  position: fixed;
  top: ${props => props.$isHidden ? '-70px' : '0'};
  left: 0;
  width: 100%;
  height: var(--nav-height);
  /* Apply glassy effect */
  /* Use specific glassy variables with fallbacks */
  background-color: ${props => props.$isSelectionModeActive
    ? 'var(--selection-header-bg-color-glassy, rgba(100, 100, 100, 0.75))' /* Fallback glassy selection color */
    : 'var(--header-bg-color-glassy, rgba(255, 255, 255, 0.75))'}; /* Fallback glassy header color */
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px); /* Safari support */

  /* Add a higher z-index to the header in selection mode */
  z-index: ${props => props.$isSelectionModeActive ? 1001 : 1000};
  
  display: flex;
  align-items: center;
  padding: 0 20px;
  
  
  z-index: 1000;
  color: var(--text-color);
  justify-content: space-between;
  transition: transform 0.3s ease, top 0.3s ease, background-color 0.2s ease; /* Added background-color transition */

  border-radius: 0;
  
  @media (min-width: 601px) {
    /* 1. Define the animation */
    animation: scroll-shadow linear both;
    
    /* 2. Bind animation to scroll */
    animation-timeline: scroll();
    
    /* 3. Define the range: Start at 0px, finish at 100px scrolled */
    animation-range: 0rem 100px;
    @keyframes scroll-shadow {
        0% {
            /* box-shadow: none; */
            outline: none;
        }
        100% {
            /* box-shadow: 0 4px 40px -1px rgba(0, 0, 0, 0.08); */
            outline: 1px solid var(--menu-item-selected);
        }
    }
  }

  @media (max-width: 600px) {
    height: 56px;
    margin-top: 10px;
    width: calc(100% - 36px);
    left: 50%;
    transform: translateX(-50%);
    padding-left: 10px;
    padding-right: 10px;
    border-radius: ${props => props.$isQuickSearchPanelOpen ? '30px 30px 0 0' : '30px'};
    background-color: var(--mobile-header-bg-color-glassy, rgba(245, 245, 245, 0.75));
    border: none;
    outline: ${props => props.$isSearchInputFocused ? '2px solid var(--foreground-color)' : 'none'};
    outline-offset: -2px;
    transition: transform 0.3s ease, top 0.3s ease, background-color 0.2s ease, border-radius 0.15s ease;
  }
`;

const MenuContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  transition: all 0.3s ease;
  height: 40px;
`;

const MenuButton = styled.button`
  font-size: 24px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;

  @media (hover: hover) {
      &:hover {
        background-color: var(--button-hover-color);
      }
    }
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: 100%;
  /* Default alignment: left */
  left: 0; 
  right: auto; /* Explicitly set right to auto for default */

  /* Apply right alignment if $alignRight prop is true */
  ${props => props.$alignRight && css`
    left: auto; /* Override default left */
    right: 0;   /* Align to the right */
  `}

  width: auto;
  min-width: max-content; /* Use max-content instead of fixed width */
  white-space: nowrap;
  background-color: var(--foreground-color);
  border-radius: 8px;
  box-shadow: 0 2px 10px var(--shadow-color);
  z-index: 1002;
  display: ${props => props.$isOpen ? 'block' : 'none'};
  padding-top: 6px;
  padding-bottom: 6px;

  @media (max-width: 768px) {
      /* Mobile styles override alignment */
      position: fixed; 
      width: 100%;
      left: 50%;
      right: auto; /* Reset right for mobile */
      transform: translateX(-50%);
      bottom: auto;
      top: 50px; // Or adjust as needed based on your header height
      border-radius: 12px;
      border-left: none;
      border-right: none;
      border-bottom: none;
      box-sizing: border-box;
      box-shadow: 0 -2px 60px var(--shadow-color);
      background-color: var(--foreground-color);
      padding-top: 8px;
      padding-bottom: 8px;
      padding-right: 0px;
      padding-left: 0px;
    }
`;

const ActionDropdownMenu = styled.div`
  position: fixed;
  top: var(--nav-height);
  right: 16px;
  width: auto;
  min-width: max-content;
  white-space: nowrap;
  background-color: var(--foreground-color);
  border-radius: 8px;
  box-shadow: 0 2px 10px var(--shadow-color);
  z-index: 9999;
  opacity: ${props => props.$isOpen ? 1 : 0};
  visibility: ${props => props.$isOpen ? 'visible' : 'hidden'};
  transform: ${props => props.$isOpen ? 'translateY(0)' : 'translateY(-10px)'};
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  padding-top: 6px;
  padding-bottom: 6px;

  @media (max-width: 768px) {
    position: fixed; 
    width: calc(100% - 36px);
    left: 50%;
    right: auto;
    transform: translateX(-50%) ${props => props.$isOpen ? 'translateY(0)' : 'translateY(-10px)'};
    bottom: auto;
    top: 60px;
    border-radius: 12px;
    border-left: none;
    border-right: none;
    border-bottom: none;
    box-sizing: border-box;
    box-shadow: 0 -2px 60px var(--shadow-color);
    background-color: var(--foreground-color);
    padding-top: 8px;
    padding-bottom: 8px;
    padding-right: 0px;
    padding-left: 0px;
  }
`;

const ActionMenuBackdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  z-index: 9998;
  opacity: ${props => props.$isOpen ? 1 : 0};
  visibility: ${props => props.$isOpen ? 'visible' : 'hidden'};
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto;
`;


const MenuItem = styled.button`
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 20px;
  padding-right: 20px;
  background: none;
  border: none;
  text-align: left;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  color: var(--background-color);
  box-sizing: border-box;

  & > span {
    width: 18px;
    @media (max-width: 768px) {
       width: 30px; 
    }
  }

  @media (max-width: 768px) {
    font-size: 16px;
    padding-top: 9px;
    padding-bottom: 9px;
    padding-left: 20px;
    padding-right: 20px;
  }

  &:hover {
    background-color: var(--menu-item-hover-bg);
  }
`;

const MenuTitle = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px 20px;
  padding-right: 20px;
  background: none;
  border: none;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: var(--background-color);
  box-sizing: border-box;

  @media (max-width: 768px) {
    font-size: 14px;
    padding: 6px 12px;
    padding-left: 20px;
    padding-right: 20px;
  }
`;

const MenuIcon = styled.span`
  margin-right: 16px;
  font-size: 20px;

  @media (max-width: 768px) {
     margin-right: 16px;
  }

  & > svg {
    margin-right: 8px;

    @media (max-width: 768px) {
        width: 24px;
        height: 24px;
        padding: 0;
      }
  }
`;

const MenuSeparator = styled.hr`
  margin: 6px 0; /* Adjusted margin for slightly more space */
  border: none; /* Remove default browser borders */
  height: 1px; /* Explicit height */
  background-color: var(--menu-item-separator-light); /* Use background for the line */
  width: 100%; /* Make it span the container */
  /* Optional: Add padding if needed, but margin is usually sufficient */
  /* padding: 0 10px; */ /* Example if you want shorter line */
  /* box-sizing: border-box; */
`;

const SearchContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  /* Hide search when selection mode is active */
  opacity: ${props => props.$isSelectionModeActive ? 0 : 1};
  pointer-events: ${props => props.$isSelectionModeActive ? 'none' : 'auto'};
`;

const SearchBarWrapper = styled.form`
  width: ${props => props.$isSearchActive ? '100%' : '450px'};
  max-width: ${props => props.$isSearchActive ? '700px' : '450px'};
  margin: 0 auto;
  padding: ${props => props.$isSearchActive ? '0 8px' : '0'};
  transition: all 0.3s ease;
  flex-grow: ${props => props.$isSearchActive ? 1 : 0};
  @media (max-width: 768px) {
    padding-left: 0;
    padding-right: 0;
    max-width: 100%;
    width: 100%;
  }
`;

const SearchBar = styled.div`
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
  z-index: 1001; /* Ensure dropdown appears above other elements */
`;

const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  border-radius: 8px;
  background-color: var(--search-bg-color);
  transition: background-color 0.3s ease;

  @media (max-width: 768px) {
    background-color: var(--search-bg-color);
    border-radius: 50vh;
  }

  @media (max-width: 600px) {
    background-color: transparent;
  }

  &:focus-within {
    background-color: var(--search-active-bg-color);
    @media (max-width: 768px) {
      background-color: transparent;
    }
  }
`;

const SearchRightButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--text-color);
  font-size: 16px;
  outline: none;
  min-width: 0; /* Allow input to shrink */

  @media (max-width: 768px) {
    border-radius: 50vh;
  }

  &::placeholder {
    color: var(--spinner-highlight);
  }
`;
 
const SearchButton = styled.button`
  position: absolute;
  top: 11px;
  left: ${props => props.$isSearchActive ? '12px' : 'auto'};
  right: ${props => props.$isSearchActive ? 'auto' : '10px'};
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: var(--text-color);
  transition: all 0.3s ease;
  display: ${props => props.$isSearchActive ? 'none' : 'block'};
`;
  
const ClearSearchButton = styled(SharedHighlightedButton)`
  cursor: pointer;
  transition: opacity 0.3s ease;
  opacity: ${props => props.$visible ? '0.8' : '0'};
  pointer-events: ${props => props.$visible ? 'auto' : 'none'};
  display: ${props => props.$visible ? 'flex' : 'none'};
  flex-shrink: 0;
`;

const BackButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 24px;
  color: var(--text-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;

  &:hover {
    background-color: var(--button-hover-color);
  }
`;

const ThemeToggleButton = styled.button`
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 20px;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;

  &:hover {
    background-color: var(--button-hover-color);
  }
`;

const Spacer = styled.span`
  display: inline-box;
  width: 4px;
  height: 100%;
`;

const CheckMarkCircle = styled.div`
   width: 20px; 
   height: 20px; 
   background-color: var(--background-color);
   color: var(--foreground-color);
   border-radius: 50vh;
   display: flex;
   align-items: center;
   justify-content: center;
   margin-left: auto; /* Push to the right */
   flex-shrink: 0;

   @media (max-width: 768px) {
     font-size: 24px;
     width: 28px; 
     height: 28px; 
  }
  & > svg {
    width: 14px; 
    height: 14px;
    @media (max-width: 768px) {
        width: 18px; 
        height: 18px;
      }
  }
`;


const NewNoteButton = styled.button`
  position: fixed;
  bottom: 30px;
  right: 30px;
  width: 56px;
  height: 56px;
  border-radius: 50vh;
  color: var(--text-color-contrast);
  background-color: var(--foreground-color);
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px var(--shadow-color);
  z-index: 900;
  cursor: pointer;
  transition: all 0.2s ease;

  @media (max-width: 768px) {
    bottom: ${props => props.$headerHidden ? '20px' : '30px'};
  }

  @media (max-width: 600px) {
    left: 0;
    right: 0;
    margin-left: auto;
    margin-right: auto;
    width: ${props => props.$isHeaderHidden ? '56px' : '100px'};
  }

  &:hover {
    transform: scale(1.1);
  }

  ${props => props.$isDragOver && css`
    transform: scale(1.1);
  `}
`;

// Mobile Search Overlay
const MobileSearchOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 50%;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0));
  z-index: 999; /* Below header but above other content */
  opacity: ${props => props.$isVisible ? 1 : 0};
  visibility: ${props => props.$isVisible ? 'visible' : 'hidden'};
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  
  @media (min-width: 769px) {
    display: none; /* Only show on mobile */
  }
`; 

const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

const Spinner = styled.div`
  border: 3px solid var(--text-color-contrast);
  border-radius: 50%;
  border-top: 3px solid var(--shadow-color);
  width: 24px;
  height: 24px;
  animation: ${rotate} 1s linear infinite;
`;

// Memoized Action Menu - prevents re-renders when parent re-renders but menu props haven't changed
const ActionMenu = memo(({
  isOpen,
  isSelectionModeActive,
  view,
  searchMode,
  layoutView,
  onClose,
  // Selection mode actions
  downloadSelectedNotes,
  handleBulkCopyReference,
  // Sort functions
  getSortForView,
  getAvailableSortsForView,
  SORT_LABELS,
  changeSortOption,
  // Layout functions
  changeLayoutView,
  // Other actions
  loadNotes,
  actionDropdownRef
}) => {
  // Don't render anything if menu is closed - prevents unnecessary DOM updates
  if (!isOpen) return null;
  
  const currentView = searchMode ? 'search' : view;
  const currentSort = getSortForView(currentView);
  const availableSorts = getAvailableSortsForView(currentView);
  
  return (
    <ActionDropdownMenu 
      ref={actionDropdownRef}
      $isOpen={isOpen}
      onClick={(e) => e.stopPropagation()}
    >
      {isSelectionModeActive ? (
        <>
          <MenuItem onClick={() => {
            downloadSelectedNotes();
            onClose();
          }}>
            <MenuIcon><Icon name="download" size={18} /></MenuIcon>
            Download
          </MenuItem>
          <MenuItem onClick={() => {
            handleBulkCopyReference();
          }}>
            <MenuIcon><Icon name="copy" size={18} /></MenuIcon>
            Copy Reference(s)
          </MenuItem>
        </>
      ) : (
        <>
          {/* Conditional Sorting Options */}
          {availableSorts.map((sortOption) => {
            const isSelected = currentSort === sortOption;
            const label = SORT_LABELS[sortOption];
            const isAscending = sortOption.includes('_asc');
            
            return (
              <MenuItem 
                key={sortOption}
                onClick={() => { 
                  changeSortOption(sortOption);
                  onClose(); 
                }}
              >
                <MenuIcon>
                  <Icon name={isAscending ? "arrow_up" : "arrow_down"} size={18} />
                </MenuIcon>
                <div style={{ marginRight: '16px' }}>{label}</div>
                {isSelected && (
                  <CheckMarkCircle>
                    <Icon name="check" strokeWidth="3"/>
                  </CheckMarkCircle>
                )}
              </MenuItem>
            );
          })}
        
          {/* --- Layout View Selection --- */}
          <MenuSeparator />
        
          <MenuItem onClick={() => { changeLayoutView('grid'); onClose(); }}>
            <MenuIcon><Icon name="viewGrid" size={18} /></MenuIcon>
            <div style={{ marginRight: '16px' }}>Grid View</div>
            {layoutView === 'grid' && 
                <CheckMarkCircle>
                  <Icon name="check" strokeWidth="3"/>
                </CheckMarkCircle>
            }
          </MenuItem>

          <MenuItem onClick={() => { changeLayoutView('stacked'); onClose(); }}>
            <MenuIcon><Icon name="viewList" size={18} /></MenuIcon>
            <div style={{ marginRight: '16px' }}>Stacked View</div>
            {layoutView === 'stacked' && 
                <CheckMarkCircle>
                  <Icon name="check" strokeWidth="3"/>
                </CheckMarkCircle>
            }
          </MenuItem>

          <MenuItem onClick={() => { changeLayoutView('list'); onClose(); }}>
            <MenuIcon><Icon name="layoutSidebar" size={18} /></MenuIcon>
            <div style={{ marginRight: '16px' }}>List View</div>
            {layoutView === 'list' && 
                <CheckMarkCircle>
                  <Icon name="check" strokeWidth="3"/>
                </CheckMarkCircle>
            }
          </MenuItem>

          <MenuItem onClick={() => { changeLayoutView('overview'); onClose(); }}>
            <MenuIcon><Icon name="viewOverview" size={18} /></MenuIcon>
            <div style={{ marginRight: '16px' }}>Overview</div>
            {layoutView === 'overview' && 
                <CheckMarkCircle>
                  <Icon name="check" strokeWidth="3"/>
                </CheckMarkCircle>
            }
          </MenuItem>
            
          <MenuSeparator />

          {/* Other Menu Items */}
          <MenuItem onClick={() => {
            loadNotes(true);
            onClose();
          }}>
            <MenuIcon><Icon name="refresh" size={18} /></MenuIcon>
            Refresh List
          </MenuItem>
        </>
      )}
    </ActionDropdownMenu>
  );
});

ActionMenu.displayName = 'ActionMenu';

const Header = () => {
  const [localSearchInput, setLocalSearchInput] = useState(''); // Local state for the input field
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const lastScrollYRef = useRef(0); // Use ref to avoid re-renders on scroll
  const [lastExecutedSearchQuery, setLastExecutedSearchQuery] = useState(''); // Track last executed search
  const [newEmptyNote, setNewEmptyNote] = useState(null); // State to track newly created empty note
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false); // State for settings modal
  const [isAutoAddingSpace, setIsAutoAddingSpace] = useState(false); // Flag to track auto-added spaces
  const [isSearchInputFocused, setIsSearchInputFocused] = useState(false); // Track search input focus
  const [isProcessing, setIsProcessing] = useState(false); // New processing state
  const [isQuickSearchPanelOpen, setIsQuickSearchPanelOpen] = useState(false); // Track quick search panel state

  useEffect(() => {
    ThemeManager.initTheme();
  }, []);

  const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768);
  // Typeahead state
  const [showTagTypeahead, setShowTagTypeahead] = useState(false);
  const [showColorTypeahead, setShowColorTypeahead] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [colorSuggestions, setColorSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showBulkColorPicker, setShowBulkColorPicker] = useState(false); // State for bulk color picker
  const [showBulkTagPicker, setShowBulkTagPicker] = useState(false); // State for bulk tag picker
  const [isDragOver, setIsDragOver] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Add state and functions from contexts
  const {
    handleSearch: handleSearchRaw, searchMode, view,
    changeSortOption, getSortForView, getAvailableSortsForView, SORT_LABELS,
    // Legacy functions for backward compatibility
    setSortNewest, setSortOldest,
    loadNotes, searchQuery, searchBarActive, setSearchBarActive, createNote, addTagToNote, registerTagId,
    changeLayoutView, // Enhanced version that handles overview mode refresh
    openedNote, // For hiding new note button in list view
    listLoading, // Track if notes are loading to avoid blur during content changes
  } = useNotes();

  useEffect(() => {
    setIsHeaderHidden(false);
    lastScrollYRef.current = 0;
  }, [view]);

  // Get navigation functions
  const { openNote, changeView } = useNavigation();

  // Get selection state and functions from NoteSelectionContext
  const {
    selectedNoteIds, clearSelection,
    archiveSelectedNotes, trashSelectedNotes, changeColorSelectedNotes,
    unarchiveSelectedNotes, restoreSelectedNotes, deleteForeverSelectedNotes,
    bulkAddTagToNotes, bulkRemoveTagFromNotes, downloadSelectedNotes,
  } = useNoteSelection();
  
  // Get UI preferences from UIPreferencesContext
  const {
    savedSearches,
    layoutView,
    saveSearch,
    toggleLayoutView,
    changeLayoutView: originalChangeLayoutView, // Rename to avoid conflict
    getColorLabel,
    colorLabels,
  } = useUIPreferences();
  
  const { tags, toggleTagsModal, createTag } = useTags();
  const { logout, isSocketConnected } = useAuth();

  // Helper to translate custom color labels back to actual color names in search query
  // e.g., "$moral $blue" -> "$coral $blue" (if "coral" was labeled "moral")
  const translateColorLabelsToActual = useCallback((query) => {
    if (!query) return query;
    
    // Build reverse lookup: label -> actual color name
    const labelToColor = {};
    COLORS.forEach(color => {
      const label = colorLabels[color];
      if (label) {
        labelToColor[label.toLowerCase()] = color;
      }
    });
    
    // Replace $label with $actualColor
    return query.replace(/\$([a-zA-Z]+)/g, (match, labelOrColor) => {
      const lower = labelOrColor.toLowerCase();
      // Check if it's a custom label that needs translation
      if (labelToColor[lower]) {
        return `$${labelToColor[lower]}`;
      }
      // Otherwise keep as-is (it's either an actual color name or invalid)
      return match;
    });
  }, [colorLabels]);

  // Translate actual color names back to custom labels for display
  const translateActualToColorLabels = useCallback((query) => {
    if (!query) return query;
    
    // Replace $actualColor with $label (if a custom label exists)
    return query.replace(/\$([a-zA-Z]+)/g, (match, colorName) => {
      const lower = colorName.toLowerCase();
      // Find if this is a real color with a custom label
      const actualColor = COLORS.find(c => c.toLowerCase() === lower);
      if (actualColor && colorLabels[actualColor]) {
        return `$${colorLabels[actualColor]}`;
      }
      // Otherwise keep as-is
      return match;
    });
  }, [colorLabels]);

  // Wrapped handleSearch that translates color labels before searching
  const handleSearch = useCallback((...args) => {
    const [query, ...rest] = args;
    const translatedQuery = translateColorLabelsToActual(query);
    return handleSearchRaw(translatedQuery, ...rest);
  }, [handleSearchRaw, translateColorLabelsToActual]);

  const menuRef = useRef(null);
  const actionMenuRef = useRef(null);
  const actionDropdownRef = useRef(null); // Ref for the top-level ActionDropdownMenu
  const bulkColorPickerRef = useRef(null);
  const bulkPaletteButtonRef = useRef(null); // Ref for the bulk palette button
  const bulkTagButtonRef = useRef(null); // Ref for the bulk tag button
  const bulkTagPickerRef = useRef(null); // Ref for the bulk tag picker container
  const bulkTagPickerOverlayRef = useRef(null); // Ref for the bulk tag picker overlay
  const searchInputRef = useRef(null);
  // Initialize with a unique symbol to ensure the first sync always happens
  const prevSearchQueryRef = useRef(Symbol('initial'));
  // Track if we've pushed history for current search session (reset on blur/exit)
  const hasAddedHistoryThisSessionRef = useRef(false);

  // Determine if selection mode is active
  const isSelectionModeActive = selectedNoteIds.size > 0;

  // Close bulk pickers when selection mode ends
  useEffect(() => {
    if (!isSelectionModeActive) {
      setShowBulkTagPicker(false);
      setShowBulkColorPicker(false);
    }
  }, [isSelectionModeActive]);

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);    
  // Sync local input with context search query (driven by URL)
  useEffect(() => {
    // Check if search query actually changed from external source (e.g. navigation)
    const searchQueryChanged = searchQuery !== prevSearchQueryRef.current;
    prevSearchQueryRef.current = searchQuery;

    // Translate the context query (which uses actual color names) back to display labels
    const displayQuery = translateActualToColorLabels(searchQuery);
    
    // Compare the display versions - if local already shows the correct display value, don't sync
    // This handles both: '$coral' in context -> '$moral' display, and preserves trailing spaces
    const displayTrimmed = (displayQuery || '').trim();
    const localTrimmed = (localSearchInput || '').trim();
    
    // If local input already shows the correct display value, no need to sync
    if (displayTrimmed === localTrimmed) {
      return;
    }
    
    if (isSearchInputFocused) {
      // If input is focused, we are very picky about when to sync.
      
      // 1. If the global query hasn't changed, we definitely don't want to overwrite 
      //    the user's current typing with a stale value.
      if (!searchQueryChanged) return;

      // 2. If the global query DID change, but it matches what we just executed,
      //    it's likely an "echo" of our own action (delayed response).
      //    If we have typed more since then, we don't want to be overwritten.
      //    Compare using display versions since lastExecutedSearchQuery stores display form
      const displayQuery = translateActualToColorLabels(searchQuery);
      const isEcho = displayQuery === lastExecutedSearchQuery;
      if (isEcho) return;
    } else {
      // If NOT focused, we still only want to sync if the global query actually changed.
      // This prevents overwriting a pending user input (e.g. typed and quickly blurred)
      // with a stale global query.
      if (!searchQueryChanged) return;
    }

    // Use the display query (with custom labels) for the input field
    setLocalSearchInput(displayQuery || '');
    
    // Sync last executed query if context changes (e.g., browser back/forward)
    // Store the DISPLAY version so echo detection works correctly with color labels
    if (searchQueryChanged) {
      setLastExecutedSearchQuery(displayQuery || '');
    }
  }, [searchQuery, isSearchInputFocused, lastExecutedSearchQuery, localSearchInput, translateActualToColorLabels]);

  // Separate effect for syncing search active state to avoid resetting it when input focus changes
  useEffect(() => {
    setIsSearchActive(searchMode);
    if (!searchMode) {
      // When search mode exits externally (e.g. browser back button), the DOM input remains
      // focused because SPA navigation never fires a blur event. Force-blur it so that
      // isSearchInputFocused and :focus-within styles don't persist after navigating back.
      if (searchInputRef.current) {
        searchInputRef.current.blur();
      }
      setIsSearchInputFocused(false);
    }
  }, [searchMode]);

  // Get current view icon name
  const getViewIconName = () => {
    switch (view) {
      case 'archive':
        return 'archive';
      case 'trash':
        return 'trash';
      case 'main':
      default:
        return 'notes';
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
        
  // Define exitSearchMode before using it in useEffect
  const exitSearchMode = () => {
    setIsSearchActive(false);
    setIsSearchInputFocused(false); // Ensure focus state is cleared

    // Reset search session history tracking
    hasAddedHistoryThisSessionRef.current = false;

    // Close typeahead dropdowns
    setShowTagTypeahead(false);
    setShowColorTypeahead(false);

    // Only reset search in context if there's an active search query
    if (localSearchInput || searchMode) {
      setLocalSearchInput(''); // Clear local input
      handleSearch(''); // Trigger context search clear
      setLastExecutedSearchQuery(''); // Clear last executed query state

      // Reset scroll position to top when exiting actual search
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Handle action menu separately (only if not in selection mode)
      if (!isSelectionModeActive && actionMenuRef.current && !actionMenuRef.current.contains(event.target) &&
          actionDropdownRef.current && !actionDropdownRef.current.contains(event.target)) {
        setIsActionMenuOpen(false);
      }

      // Bulk color picker outside click is handled by the component itself now

      // For typeahead dropdowns, we want to allow clicking on dropdown items
      // but close if clicked elsewhere. Check if the click target contains
      // 'SuggestionItem' class to avoid closing when clicking on a suggestion
      const isClickOnSuggestion = event.target.closest('.SuggestionItem'); // eslint-disable-line no-unused-vars

      // Close typeahead dropdowns when clicking outside search area and not on a suggestion
      if (!isClickOnSuggestion && searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        setShowTagTypeahead(false);
        setShowColorTypeahead(false);
        
        // Exit search mode if search bar is empty and clicked outside
        if (isSearchActive && !localSearchInput.trim()) {
          exitSearchMode();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSelectionModeActive, isSearchActive, localSearchInput, searchMode]); // Fixed dependencies

  // Focus on search input only when the search icon/bar is clicked, not for tag/color searches
  useEffect(() => {
    // We'll focus only when handleSearchClick or handleSearchSubmit are called
    // Not focusing automatically on every isSearchActive change
  }, [isSearchActive]);

  // Listen for search bar activation from other components (like tag clicks)
  useEffect(() => {
    if (searchBarActive) {
      setIsSearchActive(true);
      // Update local input state when activated externally
      // Use display version (with custom color labels) instead of raw searchQuery
      setLocalSearchInput(translateActualToColorLabels(searchQuery) || '');
      setSearchBarActive(false); // Reset the signal

      // Don't auto-focus search input when activated from tags/colors
      // to prevent keyboard popup on mobile devices
    }
  }, [searchBarActive, searchQuery, setSearchBarActive, translateActualToColorLabels]);

  // Show header immediately when search mode is activated (only if currently hidden)
  useEffect(() => {
    if ((isSearchActive || isSelectionModeActive) && isHeaderHidden) {
      // Temporarily disable transition, then show header
      const headerElement = document.querySelector('header');
      if (headerElement) {
        headerElement.style.transition = 'none';
        setIsHeaderHidden(false);
        // Re-enable transition after a brief delay
        setTimeout(() => {
          headerElement.style.transition = '';
        }, 50);
      } else {
        setIsHeaderHidden(false);
      }
    }
  }, [isSearchActive, isSelectionModeActive, isHeaderHidden]);

  // Control header visibility based on scroll direction
  useEffect(() => {
    const controlHeader = (customScrollY) => {
      // Only run if the component is mounted
      if (typeof window !== 'undefined') {
        // Use customScrollY if provided (from ListView), otherwise window.scrollY
        const currentScrollY = customScrollY !== undefined ? customScrollY : window.scrollY;
        const lastScrollY = lastScrollYRef.current;
        const scrollDistance = Math.abs(currentScrollY - lastScrollY);

        // Blur search input on mobile when scrolling and search is focused
        // Only if we have scrolled a significant amount to avoid blurring on layout shifts
        if (isMobileView && isSearchInputFocused && searchInputRef.current && scrollDistance > 10) {
          // Don't blur if notes are currently loading - scroll events during loading
          // are from content changes (re-renders), not user scroll gestures
          if (listLoading) {
            // Update lastScrollY but skip blur - content is still loading
            lastScrollYRef.current = currentScrollY;
            return;
          }

          // Check the actual DOM input value to avoid race conditions with state
          const inputValue = searchInputRef.current.value.trim();
          const shouldExitSearchMode = isSearchActive && !inputValue;

          searchInputRef.current.blur();

          // Exit search mode if input is empty (same as clicking outside)
          if (shouldExitSearchMode) {
            exitSearchMode();
          }
        }

        // Close the action dropdown on scroll, but not the main nav menu
        // (nav menu has its own full-screen backdrop that handles dismissal)
        if (isActionMenuOpen) setIsActionMenuOpen(false);

        // Don't hide header when search is active OR selection mode is active
        // OR if we are in list view on desktop (per user request)
        if (isSearchActive || isSelectionModeActive || (layoutView === 'list' && !isMobileView)) {
          if (isHeaderHidden) {
            setIsHeaderHidden(false);
          }
          // Update ref before returning
          lastScrollYRef.current = currentScrollY;
          return;
        }

        // Determine scroll direction and distance
        const isScrollingDown = currentScrollY > lastScrollY;
        // scrollDistance is calculated above

        // Only trigger after scrolling at least 10px to avoid micro-movements
        if (scrollDistance > 10) {
          // When scrolling down, hide the header
          // When scrolling up, show the header
          // But don't hide header when at the top of the page
          if (isScrollingDown && currentScrollY > 60) {
            setIsHeaderHidden(true);
          } else {
            setIsHeaderHidden(false);
          }
        }

        // Remember current scroll position (using ref - no re-render)
        lastScrollYRef.current = currentScrollY;
      }
    };

    // Add scroll event listener with throttling to avoid performance issues
    let timeoutId;

    const throttledControlHeader = (customScrollY) => {
      if (!timeoutId) {
        timeoutId = setTimeout(() => {
          controlHeader(customScrollY);
          timeoutId = null;
        }, 100); // Throttle to run at most every 100ms
      }
    };

    const handleWindowScroll = () => throttledControlHeader();
    const handleListScroll = (e) => throttledControlHeader(e.detail.scrollTop);

    window.addEventListener('scroll', handleWindowScroll);
    window.addEventListener('noteListScroll', handleListScroll);

    // Clean up
    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
      window.removeEventListener('noteListScroll', handleListScroll);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isSearchActive, isSelectionModeActive, isMobileView, isSearchInputFocused, isMenuOpen, isActionMenuOpen, isHeaderHidden, layoutView, listLoading]); // Removed lastScrollY (now using ref)

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!isSearchActive) {
      setIsSearchActive(true);
      // Focus when user manually submits search
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    } else {
      // Clear any pending debounced search from typing
      if (window.searchTimeout) {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = null; // Clear the reference
      }
      // Trigger search only if the query has changed since the last execution
      if (localSearchInput !== lastExecutedSearchQuery) {
        handleSearch(localSearchInput);
        setLastExecutedSearchQuery(localSearchInput); // Update last executed query
      }
    }
  };

  // Checks current input for # or @ prefixes and shows appropriate typeahead
  const checkForTypeahead = (value, cursorPos) => {
    // Reset all typeahead state first
    setShowTagTypeahead(false);
    setShowColorTypeahead(false);
    setTagSuggestions([]);
    setColorSuggestions([]);
    setSelectedSuggestionIndex(0);

    if (!isSearchActive || !value) return;

    // Check prefix in current text being typed
    // We need to find any # or @ prefix followed by text, before the cursor position
    const beforeCursor = value.substring(0, cursorPos);

    // Tag typeahead (#)
    const tagMatch = beforeCursor.match(/(^|\s)#([^\s#@]*)$/);
    if (tagMatch) {
      const tagPrefix = tagMatch[2].toLowerCase();
      setCurrentPrefix(tagPrefix);

      // Filter tags based on prefix
      const filteredTags = tags.filter(tag =>
        tag.name.toLowerCase().includes(tagPrefix)
      ).sort((a, b) => {
        // Show exact matches first, then sort alphabetically
        const aStartsWithPrefix = a.name.toLowerCase().startsWith(tagPrefix);
        const bStartsWithPrefix = b.name.toLowerCase().startsWith(tagPrefix);

        if (aStartsWithPrefix && !bStartsWithPrefix) return -1;
        if (!aStartsWithPrefix && bStartsWithPrefix) return 1;
        return a.name.localeCompare(b.name);
      }).map(tag => {
        if (tag.parent_id) {
          const parent = tags.find(t => t.id === tag.parent_id);
          return parent ? { ...tag, _parentName: parent.name } : tag;
        }
        return tag;
      });

      setTagSuggestions(filteredTags);
      setShowTagTypeahead(filteredTags.length > 0);
      return;
    }

    // Color typeahead ($)
    const colorMatch = beforeCursor.match(/(^|\s)\$([^\s#$]*)$/);
    if (colorMatch) {
      const colorPrefix = colorMatch[2].toLowerCase();
      setCurrentPrefix(colorPrefix);

      // Filter colors based on prefix OR alias match OR custom label match
      // Returns objects with { color, matchedAlias } for display purposes
      const filteredColors = COLORS
        .filter(color => color !== 'default') // Exclude default from autocomplete
        .map(color => {
          const colorLower = color.toLowerCase();
          const aliases = COLOR_ALIASES[color] || [];
          const customLabel = getColorLabel(color).toLowerCase();
          
          // Check if custom label matches (highest priority)
          if (customLabel !== colorLower && customLabel.includes(colorPrefix)) {
            return { color, matchedAlias: null };
          }
          
          // Check if color name matches
          if (colorLower.includes(colorPrefix)) {
            return { color, matchedAlias: null };
          }
          
          // Check if any alias matches
          const matchedAlias = aliases.find(alias => alias.includes(colorPrefix));
          if (matchedAlias) {
            return { color, matchedAlias };
          }
          
          return null;
        })
        .filter(Boolean); // Remove nulls

      setColorSuggestions(filteredColors);
      setShowColorTypeahead(filteredColors.length > 0);
      return;
    }
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Update local input state directly
    setLocalSearchInput(value);
    setCursorPosition(cursorPos);

    // Check for typeahead opportunities (skip if auto-adding space)
    if (!isAutoAddingSpace) {
      checkForTypeahead(value, cursorPos);
    }

    // Debounce search call to context as user types (only in search mode and not auto-adding space)
    if (isSearchActive && !isAutoAddingSpace) {
      // Clear any existing timeout for debouncing
      if (window.searchTimeout) {
        clearTimeout(window.searchTimeout);
      }

      // Only trigger context search update if there's a meaningful value
      // Don't trigger search for empty strings or just whitespace
      const trimmedValue = value.trim();
      if (trimmedValue !== '') {
        // Set a new timeout for 700ms to call the context's handleSearch
        window.searchTimeout = setTimeout(() => {
          // Get the latest value from the input ref when the timeout fires
          const currentVal = searchInputRef.current ? searchInputRef.current.value : value;
          const currentTrimmedVal = currentVal.trim();
          // Only execute search if the trimmed value has changed since the last execution
          if (currentTrimmedVal !== lastExecutedSearchQuery.trim() && currentTrimmedVal !== '') {
            // First search in session: push to history (creates new entry)
            // Subsequent searches: replace history (updates same entry)
            const shouldReplace = hasAddedHistoryThisSessionRef.current;
            handleSearch(currentVal, true, true, null, shouldReplace);
            setLastExecutedSearchQuery(currentVal);
            // Mark that we've added/updated history for this session
            hasAddedHistoryThisSessionRef.current = true;
          }
        }, 700);
      } else if (lastExecutedSearchQuery.trim() !== '') {
        // If input becomes empty or just whitespace, just clear the last executed query state.
        // Do NOT call handleSearch('') here, as that would exit search mode.
        setLastExecutedSearchQuery('');
      }
    }
  };

  const handleKeyDown = (e) => {
    // Handle Enter key press for submitting search
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent default form submission/other actions

      // Clear any pending debounced search from typing, regardless of what Enter will do
      if (window.searchTimeout) {
        clearTimeout(window.searchTimeout);
        window.searchTimeout = null; 
      }

      // If a typeahead is active and an item is selected, "Enter" should select it
      if (showTagTypeahead || showColorTypeahead) {
        const suggestions = showTagTypeahead ? tagSuggestions : colorSuggestions;
        if (suggestions.length > 0 && selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
          const selectedItem = suggestions[selectedSuggestionIndex];
          if (showTagTypeahead) {
            handleTagSelection(selectedItem);
          } else {
            handleColorSelection(selectedItem);
          }
          return; // Stop further processing for Enter key after selection
        }
      }

      // Original Enter behavior: submit current search query (if no typeahead selection was made)
      // The debounced search is already cleared above.
      // Trigger search only if the query has meaningful content and has changed since the last execution
      const currentVal = localSearchInput; // Use current local state
      const currentTrimmedVal = currentVal.trim();
      if (currentTrimmedVal !== '' && currentTrimmedVal !== lastExecutedSearchQuery.trim()) {
        handleSearch(currentVal); // Use push navigation on explicit Enter (pushes to history)
        setLastExecutedSearchQuery(currentVal); // Update last executed query
      }

      // Reset history tracking - Enter ends the search session
      hasAddedHistoryThisSessionRef.current = false;

      // Blur the search input after executing search (same as clicking outside)
      if (searchInputRef.current) {
        searchInputRef.current.blur();
      }
      
      // Close typeahead if open (though it should be closed by selection handlers if one was made)
      setShowTagTypeahead(false);
      setShowColorTypeahead(false);
      return; // Stop further processing for Enter key
    }

    // Handle typeahead navigation with arrow keys and selection with Tab/Enter
    if (showTagTypeahead || showColorTypeahead) {
      const suggestions = showTagTypeahead ? tagSuggestions : colorSuggestions;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : 0);
        return;
      }

      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const selectedItem = suggestions[selectedSuggestionIndex];

        if (showTagTypeahead) {
          handleTagSelection(selectedItem);
        } else {
          handleColorSelection(selectedItem);
        }
        return;
      }

      if (e.key === 'Escape') {
        // Close typeahead but don't clear search
        setShowTagTypeahead(false);
        setShowColorTypeahead(false);
        return;
      }
    }

    // Clear search on Escape key (when no typeahead is active and Enter wasn't pressed)
    if (e.key === 'Escape') {
      // Close typeahead first if open
      if (showTagTypeahead || showColorTypeahead) {
        setShowTagTypeahead(false);
        setShowColorTypeahead(false);
        return; // Just close typeahead on first Escape
      }
      // If typeahead wasn't open, then clear/exit search
      if (localSearchInput !== '') {
        // Clear local input and trigger context search clear
        setLocalSearchInput('');
        handleSearch('');
        setLastExecutedSearchQuery(''); // Clear last executed query state
        // Reset scroll position if clearing search query
        window.scrollTo({ top: 0, behavior: 'instant' });
      } else if (isSearchActive) {
        exitSearchMode();
      }
    }
  };

  // exitSearchMode is now defined at the top of the component

  const handleSearchClick = () => {
    if (!isSearchActive) {
      setIsSearchActive(true);
      // Focus when user manually clicks on search bar
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    }
  };

  const handleSearchInputFocus = () => {
    // Set search input focused state
    setIsSearchInputFocused(true);

    // Reset history tracking when starting a new search session
    // If there's already a query, we're resuming; otherwise it's a fresh start
    if (!localSearchInput || !localSearchInput.trim()) {
      hasAddedHistoryThisSessionRef.current = false;
    }
    
    // Only apply auto-space and scrolling behavior on mobile devices
    if (isMobileView && localSearchInput && localSearchInput.trim()) {
      let updatedValue = localSearchInput;
      
      // Add space only if it doesn't end with one
      if (!localSearchInput.endsWith(' ')) {
        updatedValue = localSearchInput + ' ';
        
        // Set flag to prevent this change from triggering a search
        setIsAutoAddingSpace(true);
        
        // Update the local state
        setLocalSearchInput(updatedValue);
        
        // Clear the flag after a short delay
        setTimeout(() => setIsAutoAddingSpace(false), 50);
      }
      
      // Immediately position cursor at the end
      if (searchInputRef.current) {
        searchInputRef.current.setSelectionRange(updatedValue.length, updatedValue.length);
        
        // Force scroll to the end of the input
        searchInputRef.current.scrollLeft = searchInputRef.current.scrollWidth;
      }
    }
  };

  const handleSearchInputMouseDown = (e) => {
    // On mobile, if there's existing text and input is not focused, prevent default cursor placement
    if (isMobileView && localSearchInput && localSearchInput.trim() && !isSearchInputFocused) {
      e.preventDefault();
      
      // Focus the input which will trigger handleSearchInputFocus
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }
  };

  // Handle selection of tag from typeahead dropdown
  const handleTagSelection = (tag) => {
    // Replace the current tag prefix with the selected tag
    const beforeCursor = localSearchInput.substring(0, cursorPosition); // Use localSearchInput
    const afterCursor = localSearchInput.substring(cursorPosition); // Use localSearchInput

    // Find the position where the # character starts
    const hashPos = beforeCursor.lastIndexOf('#');
    if (hashPos !== -1) {
      // Construct the new input value
      const newInputValue = beforeCursor.substring(0, hashPos) + `#${tag.name} ` + afterCursor; // Add space after tag
      setLocalSearchInput(newInputValue); // Update local input

      // Keep focus and set cursor position
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        // Calculate new cursor position: hashPos + 1 (#) + tag length + 1 (space)
        const newCursorPos = hashPos + 1 + tag.name.length + 1;
        
        // Set cursor position after render
        setTimeout(() => {
          if (searchInputRef.current) {
            searchInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      }

      // Register the tag ID so the search uses it directly (handles same-name subfolders)
      registerTagId(tag.id, tag.name);

      // Execute search immediately after selection using the new value
      setTimeout(() => {
        const finalValue = newInputValue.trim();
        if (finalValue !== lastExecutedSearchQuery) { // Check before executing
          handleSearch(finalValue); // Use the updated value
          setLastExecutedSearchQuery(finalValue); // Update last executed query
        }
      }, 10);
    }

    // Hide the typeahead dropdown
    setShowTagTypeahead(false);
  };

  // Handle selection of color from typeahead dropdown
  const handleColorSelection = (colorItem) => {
    // colorItem is now an object { color, matchedAlias } - extract the actual color name
    const color = typeof colorItem === 'object' ? colorItem.color : colorItem;
    // Use custom label for display in search field
    const displayLabel = getColorLabel(color);
    
    // Replace the current color prefix with the selected color's display label
    const beforeCursor = localSearchInput.substring(0, cursorPosition); // Use localSearchInput
    const afterCursor = localSearchInput.substring(cursorPosition); // Use localSearchInput

    // Find the position where the $ character starts
    const atPos = beforeCursor.lastIndexOf('$');
    if (atPos !== -1) {
      // Construct the new input value using the display label
      const newInputValue = beforeCursor.substring(0, atPos) + `$${displayLabel} ` + afterCursor; // Add space after color
      setLocalSearchInput(newInputValue); // Update local input

      // Keep focus and set cursor position
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        // Calculate new cursor position: atPos + 1 ($) + label length + 1 (space)
        const newCursorPos = atPos + 1 + displayLabel.length + 1;
        
        // Set cursor position after render
        setTimeout(() => {
          if (searchInputRef.current) {
            searchInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      }

      // Execute search immediately after selection using the new value
      setTimeout(() => {
        const finalValue = newInputValue.trim();
         if (finalValue !== lastExecutedSearchQuery) { // Check before executing
          handleSearch(finalValue); // Use the updated value
          setLastExecutedSearchQuery(finalValue); // Update last executed query
         }
      }, 10);
    }

    // Hide the typeahead dropdown
    setShowColorTypeahead(false);
  };

  const navigateTo = (path, viewName) => {
    console.log(`Header: navigateTo called with path=${path}, viewName=${viewName}`);
    
    // Close the menu first
    setIsMenuOpen(false);
    
    // Use the proper view change function from NotesContext instead of hard reload
    // This allows for smooth navigation without page reloads
    changeView(viewName);
  };

  // Handle bulk color change
  const handleBulkColorChange = (color) => {
    changeColorSelectedNotes(color);
    setShowBulkColorPicker(false); // Close picker after selection
  };

  // Handler to close the bulk color picker
  const handleCloseBulkColorPicker = () => {
    setShowBulkColorPicker(false);
  };

  // Resolves #tagname patterns in imported HTML: looks up existing tags, creates missing
  // ones, then replaces plain #tagname text with tag-mention spans.
  const resolveTagMentions = useCallback(async (html) => {
    const tagNames = new Set();
    html.replace(/(<[^>]*>)|([^<]+)/g, (_, tag, text) => {
      if (!text) return;
      for (const m of text.matchAll(/#([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
        tagNames.add(m[1].toLowerCase());
      }
    });

    if (tagNames.size === 0) return { html, tagIds: [] };

    const tagMap = {};
    for (const tag of tags) tagMap[tag.name.toLowerCase()] = tag;

    for (const name of tagNames) {
      if (!tagMap[name]) {
        const newTag = await createTag(name);
        if (newTag) tagMap[newTag.name.toLowerCase()] = newTag;
      }
    }

    const tagIds = [...tagNames].map(name => tagMap[name]?.id).filter(Boolean);

    const resolvedHtml = html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
      if (tag || !text) return match;
      return text.replace(/#([a-zA-Z][a-zA-Z0-9_-]*)/g, (m, name) => {
        const t = tagMap[name.toLowerCase()];
        if (!t) return m;
        return `<span data-type="tag-mention" data-tag-id="${t.id}" data-label="${t.name}">#${t.name}</span>`;
      });
    });

    return { html: resolvedHtml, tagIds };
  }, [tags, createTag]);

  // --- Drag and Drop Handlers for New Note Button ---
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setIsProcessing(true);

    const processFile = (file) => {
      return new Promise((resolve) => {
        // Only process text files or files without extension (often text)
        if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md') || !file.type) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const rawContent = event.target.result;
            const title = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
            const createdAt = new Date(file.lastModified).toISOString();
            const rawHtml = file.name.endsWith('.md')
              ? markdownToHtml(rawContent)
              : formatPlainTextPasteToHtml(rawContent);
            const { html: content, tagIds } = await resolveTagMentions(rawHtml);

            try {
              const note = await createNote({
                title: title,
                content: content,
                created_at: createdAt
              });
              if (note?.id && tagIds.length > 0) {
                await Promise.all(tagIds.map(tagId => addTagToNote(note.id, tagId)));
              }
              console.log(`Created note from file: ${file.name}`);
              resolve(true);
            } catch (error) {
              console.error(`Error creating note from file ${file.name}:`, error);
              resolve(false);
            }
          };
          reader.onerror = () => resolve(false);
          reader.readAsText(file);
        } else {
          resolve(false);
        }
      });
    };

    const results = await Promise.all(files.map(processFile));
    const successCount = results.filter(Boolean).length;

    setIsProcessing(false);

    if (successCount > 0) {
      setToastMessage(`${successCount} note${successCount > 1 ? 's' : ''} created from files`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const handleBulkCopyReference = async () => {
    try {
      const textToCopy = Array.from(selectedNoteIds).join('\n\n');
      await navigator.clipboard.writeText(textToCopy);
      setToastMessage('References copied to clipboard');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Failed to copy references:', err);
      setToastMessage('Failed to copy references');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
    setIsActionMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Search Overlay - only shows on mobile when search input is focused */}
      <MobileSearchOverlay 
        $isVisible={isMobileView && isSearchInputFocused && isSearchActive}
      />

      {/* Action Menu Backdrop - positioned at top level to cover entire page */}
      <ActionMenuBackdrop 
        $isOpen={isActionMenuOpen} 
        onClick={() => setIsActionMenuOpen(false)} 
      />
      {/* Horizontal Menu - memoized to prevent re-renders on scroll */}
      <MainNavigationMenu
        isOpen={isMenuOpen}
        view={view}
        onClose={() => setIsMenuOpen(false)}
        navigateTo={navigateTo}
        toggleTagsModal={toggleTagsModal}
        setIsSettingsModalOpen={setIsSettingsModalOpen}
        logout={logout}
      />
      
      {/* Action Menu - memoized to prevent re-renders on scroll */}
      <ActionMenu
        isOpen={isActionMenuOpen}
        isSelectionModeActive={isSelectionModeActive}
        view={view}
        searchMode={searchMode}
        layoutView={layoutView}
        onClose={() => setIsActionMenuOpen(false)}
        downloadSelectedNotes={downloadSelectedNotes}
        handleBulkCopyReference={handleBulkCopyReference}
        getSortForView={getSortForView}
        getAvailableSortsForView={getAvailableSortsForView}
        SORT_LABELS={SORT_LABELS}
        changeSortOption={changeSortOption}
        changeLayoutView={changeLayoutView}
        loadNotes={loadNotes}
        actionDropdownRef={actionDropdownRef}
      />
      
      <HeaderContainer $isHidden={isHeaderHidden} $isSelectionModeActive={isSelectionModeActive} $isSearchInputFocused={isSearchInputFocused} $isQuickSearchPanelOpen={isQuickSearchPanelOpen}>
        {/* Left section - Conditional rendering based on selection mode */}
        <div style={{ display: 'flex', alignItems: 'center', minWidth: '40px' }}> {/* Increased minWidth */}
          {isSelectionModeActive ? (
            <>
              <SharedHighlightedButton
                type="button"
                title="Clear selection"
                onClick={clearSelection}
                style={{ flexShrink: 0, width:'auto', marginRight: '-72px'}}  
              >
                <SharedCircleIconWrapper style={{ width: '36px', height: '36px', borderRadius: '50% 0 0 50%', paddingLeft: '8px' }}>
                  <Icon name="close" color="var(--mobile-background-color)"/>
                </SharedCircleIconWrapper>
                <SharedCircleIconWrapper style={{ width: 'auto', minWidth: '36px', paddingLeft: '4px', paddingRight: '14px' , height: '36px', borderRadius: '0 50vh 50vh 0' }}>
                  <SelectionCount>{selectedNoteIds.size}</SelectionCount>
                </SharedCircleIconWrapper>
              </SharedHighlightedButton>
            </>
          ) : isSearchActive ? (
            <SharedHighlightedButton
              type="button"
                title="Exit Search"
                onClick={exitSearchMode}
            >
              <SharedCircleIconWrapper>
                <Icon name="arrow_left" size={24} color="var(--mobile-background-color)" strokeWidth="2"/>
              </SharedCircleIconWrapper>
            </SharedHighlightedButton>     
          ) : (
            <MenuContainer ref={menuRef}>
              <MenuButton onClick={() => setIsMenuOpen(!isMenuOpen)}>
                <Icon name="menu" />
              </MenuButton>
              {/* Conditionally render the view icon button - only show for Archive and Trash */}
              {view !== 'main' && (
                        
                    <SharedHighlightedButton
                      type="button"
                        title="Return to the main list"
                        onClick={() => navigateTo('/', 'main')}
                        style={{ flexShrink: 0, width:'auto', marginRight: '-72px'}}  
                    >
                      <SharedCircleIconWrapper style={{ width: '36px', height: '36px', borderRadius: '50% 0 0 50%', paddingLeft: '8px' }}>
                        <Icon name={getViewIconName()} color="var(--mobile-background-color)"/>
                      </SharedCircleIconWrapper>
                      <SharedCircleIconWrapper style={{ width: '36px', height: '36px', borderRadius: '0 50% 50% 0' }}>
                        <Icon name="close" color="var(--mobile-background-color)"/>
                      </SharedCircleIconWrapper>
                    </SharedHighlightedButton>
              )}

              </MenuContainer>
          )}
        </div>

        {/* Center - Search (Hidden in selection mode) */}
        {!isSelectionModeActive && ((view === 'main') || isSearchActive) && <SearchContainer $isSelectionModeActive={isSelectionModeActive} >
          {/* Remove onSubmit from the form wrapper */}
          <SearchBarWrapper $isSearchActive={isSearchActive}>
            {/* Tag Typeahead Dropdown */}
            {isSearchActive && (
              <TypeaheadDropdown
                items={tagSuggestions}
                type="tag"
                onSelect={handleTagSelection}
                selectedIndex={selectedSuggestionIndex}
                visible={showTagTypeahead}
              />
            )}

            {/* Color Typeahead Dropdown */}
            {isSearchActive && (
              <TypeaheadDropdown
                items={colorSuggestions}
                type="color"
                onSelect={handleColorSelection}
                selectedIndex={selectedSuggestionIndex}
                visible={showColorTypeahead}
              />
            )}
            <SearchBar>
              <SearchInputWrapper>
                <SearchInput
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search ..."
                  value={localSearchInput} // Use local state for value
                  onChange={handleSearchInputChange}
                  onKeyDown={handleKeyDown}
                  onClick={handleSearchClick}
                  onFocus={handleSearchInputFocus}
                  onMouseDown={handleSearchInputMouseDown}
                  onBlur={() => {
                    setIsSearchInputFocused(false);
                    // Reset history tracking when search session ends
                    hasAddedHistoryThisSessionRef.current = false;
                  }}
                />

                <SearchRightButtons>
                  {/* Quick Access Pills for tags, colors, and saved searches */}
                  <QuickSearch isSearchActive={isSearchActive} isMobileView={isMobileView} onPanelOpenChange={setIsQuickSearchPanelOpen} />

                  <SavedSearchManager
                    searchInput={localSearchInput}
                    isSearchActive={isSearchActive}
                  />

                  <ClearSearchButton
                    style={{ width: '24px', height: '24px' }}
                    type="button"
                    $visible={localSearchInput.length > 0 && isSearchActive} // Use local state
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLocalSearchInput(''); // Clear local input
                      setLastExecutedSearchQuery(''); // Also clear the last executed query state
                      // Don't call handleSearch('') here as it would exit search mode.
                      // Add delay before focusing to avoid mobile focus behavior issues
                      setTimeout(() => {
                        if (searchInputRef.current) {
                          searchInputRef.current.focus();
                        }
                      }, 100);
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <SharedCircleIconWrapper style={{ width: '24px', height: '24px' }}  >
                        <Icon name="close" size={20} color="var(--mobile-background-color)" strokeWidth="2.5"/>
                      </SharedCircleIconWrapper>
                  </ClearSearchButton>
                </SearchRightButtons>
              </SearchInputWrapper>
            </SearchBar>
          </SearchBarWrapper>
        </SearchContainer>}

        {/* Right - Conditional rendering based on selection mode */}
        {(isSelectionModeActive || 
          ((!isSearchActive && view !== "main") || (!isSearchActive && isMobileView)) || 
          !(isMobileView && isSearchInputFocused)) && (
          <div style={{ minWidth: '40px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}> {/* Increased minWidth */}
            {isSelectionModeActive ? (
            <BulkActionsContainer> {/* Removed ref from here */}
              {/* Bulk Tag Picker Button */}
              {view !== "trash" &&
              <MenuButton
                ref={bulkTagButtonRef} // Add ref
                onClick={() => setShowBulkTagPicker(true)}
                title="Add/Remove tags"
              >
                <Icon name="tag" size="22"/>
              </MenuButton>
              }

              {/* Bulk Color Change Button */}
              {view !== "trash" &&
              <MenuButton
                ref={bulkPaletteButtonRef} // Attach ref here
                onClick={() => setShowBulkColorPicker(!showBulkColorPicker)}
                title="Change color"
                className="bulk-palette-button"
              >
                <Icon name="palette" size="22"/>
              </MenuButton>
              }

              {/* Bulk Download Button - Moved to Action Menu */}
              
              {/* View-specific Bulk Action Buttons */}
              {view === 'archive' ? (
                /* Archive view: Show unarchive button */
                <MenuButton onClick={unarchiveSelectedNotes} title="Unarchive selected">
                  <Icon name="unarchive" />
                </MenuButton>
              ) : view === 'trash' ? (
                /* Trash view: Show delete permanently button */
                <MenuButton onClick={deleteForeverSelectedNotes} title="Delete permanently">
                  <Icon name="deleteForever" size="22"/>
                </MenuButton>
              ) : (
                /* Main view: Show archive button */
                <MenuButton onClick={archiveSelectedNotes} title="Archive selected">
                  <Icon name="archive" size="22"/>
                </MenuButton>
              )}
              
              {/* Show trash/restore button depending on view */}
              {view === 'trash' ? (
                /* Trash view: Show restore button */
                <MenuButton onClick={restoreSelectedNotes} title="Restore selected">
                  <Icon name="restore" size="22"/>
                </MenuButton>
              ) : (
                /* Main and Archive views: Show trash button */
                <MenuButton onClick={trashSelectedNotes} title="Trash selected">
                  <Icon name="trash" size="22"/>
                </MenuButton>
              )}
            </BulkActionsContainer>
          ) : (
            // Normal Action Menu
            <>
              {((!isSearchActive && view !== "main")) && <MenuButton onClick={handleSearchClick} $isSearchActive={isSearchActive}>
                  <Icon name="search" />
                </MenuButton>}
            </>
          )}
          {!(isMobileView && isSearchInputFocused) && (
            <MenuButton onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}>
              <Icon name="more" />
            </MenuButton>
          )}
        </div>
        )}
      </HeaderContainer>

      {/* Floating action button - hide in list view when note is open */}
      {!(layoutView === 'list' && openedNote) && (
      <NewNoteButton 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        $isDragOver={isDragOver}
        $isHeaderHidden={isHeaderHidden}

        onClick={async () => {
        if (isProcessing) return;
        try {
          setIsProcessing(true); // Set processing state to true
          // Create a new empty note in the database first
          const emptyNote = await createNote({
            title: '',
            content: '',
            color: 'default'
          });

          // Then open the note using the new navigation system
          if (emptyNote && emptyNote.id) {
            // Use the new navigation system to open the note
            await openNote(emptyNote.id, 'new-note-button');
            // We no longer set isFormOpen or newEmptyNote here for the success path.
          } else {
            console.error('Failed to create empty note or note has no ID - returned:', emptyNote);
            // Fallback: If note creation failed to return a valid note/ID, open a blank form.
            setIsFormOpen(true);
            setNewEmptyNote(null);
          }
        } catch (error) {
          console.error('Error creating new note:', error);
          // Fallback to old behavior - just open an empty form without pre-creating note
          setIsFormOpen(true);
          setNewEmptyNote(null); // Open a blank form if API call fails
        } finally {
          setIsProcessing(false); // Reset processing state
        }
      }} $headerHidden={isHeaderHidden}>
        {isProcessing ? <Spinner /> : <Icon name="newNote" size={28} strokeWidth={2.5} />}
      </NewNoteButton>
      )}

      {/* This NoteForm instance is now primarily a fallback if createNote fails before navigation */}
      {isFormOpen && (
        <NoteForm
          data-source="Header.jsx"
          note={newEmptyNote}
          onClose={() => {
            setIsFormOpen(false);
            setNewEmptyNote(null);
          }}
        />
      )}

      {/* Render SharedColorPicker for Bulk Actions - Removed targetRef.current check */}
      {showBulkColorPicker && (
        <SharedColorPicker
          // No 'currentColor' needed
          onColorSelect={handleBulkColorChange}
          onClose={handleCloseBulkColorPicker}
          targetRef={bulkPaletteButtonRef}
          position="bottom-right"
          mobileBottomSheet={isMobile}    
        />
      )}

      {/* Render NoteTagPicker for Bulk Actions */}
      {showBulkTagPicker && (
        <NoteTagPicker
          isBulkMode={true}
          selectedNoteIds={selectedNoteIds}
          onClose={() => setShowBulkTagPicker(false)}
          triggerRef={bulkTagButtonRef} // Pass the button ref
          forwardedRef={bulkTagPickerRef} // Pass the picker ref
          overlayRef={bulkTagPickerOverlayRef} // Pass the overlay ref
          isMobile={isMobile} // Pass mobile state
          // Pass bulk update functions
          bulkAddTagToNotes={bulkAddTagToNotes}
          bulkRemoveTagFromNotes={bulkRemoveTagFromNotes}
        />
      )}

      {isSettingsModalOpen && (
        <SettingsModal onClose={() => setIsSettingsModalOpen(false)} />
      )}

      <SuccessToast
        message={toastMessage}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />

      <SuccessToast
        message="Reconnecting to server..."
        isVisible={isSocketConnected === false}
        bgColor="var(--warning-toast-bg)"
      />
    </>
  );
};

export default Header;
