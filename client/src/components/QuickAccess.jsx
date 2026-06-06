import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotes } from '../contexts/NotesContext';
import { useTags } from '../contexts/TagsContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext'; // Import useUIPreferences
import { useStarredNotes } from '../contexts/StarredNotesContext'; // Keep if starred note logic is needed elsewhere, though not rendered below
import { notesApi } from '../services/api'; // Keep if starred note logic is needed elsewhere
import Icon from './Icons';
import { LoadingMessage as SharedLoadingMessage } from './NotesList';

// Simple placeholder for loading individual starred notes - Keep if used elsewhere or for potential future use
const LoadingPill = styled.div`
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 13px;
  background-color: ${props => props.theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
  color: var(--text-color-secondary);
  opacity: 0.6;
  min-width: 80px; /* Give it some width */
  height: 28px; /* Match base item height approx */
  box-sizing: border-box;
`;

const SectionTitle = styled.h2`
  font-size: 14px;
  font-weight: 500;
  color: #8a8f95; // Consider using var(--text-secondary-color) or similar
  margin: 0px 0 12px;
  padding-left: 8px;
`;

// --- Helper Function to Format Month Searches ---
// Moved outside the component for better organization and potential reuse
const monthMap = {
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun",
  jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
  // Add full names (lowercase) mapped to short names
  january: "Jan", february: "Feb", march: "Mar", april: "Apr",
  june: "Jun", july: "Jul", august: "Aug", september: "Sep",
  october: "Oct", november: "Nov", december: "Dec"
};

const formatMonthSearchLabel = (searchQuery) => {
  // Regex explanation:
  // ^yr:          - Starts with "yr:"
  // (\d{4})       - Captures exactly 4 digits (the year)
  // :             - Matches the colon separator
  // ([a-zA-Z]{3,}) - Captures 3 or more letters (the month name, case-insensitive)
  // $             - Ends the string
  // i             - Case-insensitive flag
  const monthSearchPattern = /^yr:(\d{4}):([a-zA-Z]{3,})$/i;
  const match = searchQuery?.match(monthSearchPattern); // Use optional chaining for safety

  if (match) {
    const year = match[1];
    const monthInput = match[2].toLowerCase(); // e.g., "mar" or "march"
    const formattedMonth = monthMap[monthInput]; // Look up in our map

    if (formattedMonth) {
      return `${formattedMonth} ${year}`; // e.g., "Mar 2025"
    }
  }
  // Return null if it's not a valid month search query or month name not recognized
  return null;
};
// --- End Helper Function ---

const QuickAccess = () => {
  // Get data from contexts
  const {
    searchByTag,
    handleSearch,
    setSearchQuery,
    setSearchBarActive,
    notes, // Get notes from context (used for starred notes logic if re-enabled)
  } = useNotes();

  const {
    savedSearches,
    removeSavedSearch,
    pinnedFolderIds,
  } = useUIPreferences();
  
  const { tags, loading: tagsLoading } = useTags();
  // Keep starred notes context/state if you plan to re-add starred note rendering later
  const { starredNoteIds, removeStar } = useStarredNotes();
  const [starredNotesDetails, setStarredNotesDetails] = useState({});
  const [loadingStarredOverall, setLoadingStarredOverall] = useState(false);
  // Hooks for navigation and location
  const navigate = useNavigate();
  const location = useLocation();

  // Theme state
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );

  // Update theme state when the theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // --- Utility Functions ---
  const truncateText = useCallback((text, maxLength = 12) => {
    // Ensure text is a string before attempting to check length or substring
    if (typeof text !== 'string') {
      return ''; // Or return some default placeholder like '...'
    }
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  }, []);


  // --- Event Handlers ---
  const handleSearchClick = useCallback((query, e) => {
    setSearchQuery(query);
    setSearchBarActive(true);
    handleSearch(query);
  }, [setSearchQuery, setSearchBarActive, handleSearch]);

  const handleRemoveSavedSearchClick = useCallback((query, e) => {
    e.stopPropagation(); // Prevent triggering the search click
    removeSavedSearch(query);
  }, [removeSavedSearch]);

  // Keep these if you re-add starred note rendering
  const handleOpenNoteClick = useCallback((noteId, e) => {
    e.preventDefault();
    const newSearchParams = new URLSearchParams(location.search);
    newSearchParams.set('note', noteId);
    navigate(`${location.pathname}?${newSearchParams.toString()}`, { replace: false });
  }, [navigate, location.search, location.pathname]);

  const handleRemoveStarClick = useCallback((noteId, e) => {
    e.stopPropagation();
    removeStar(noteId);
    // Optimistically remove from local state as well
    setStarredNotesDetails(prev => {
      const newState = { ...prev };
      delete newState[noteId];
      return newState;
    });
  }, [removeStar]);

  // --- Data Fetching and Processing ---

  // Effect to fetch details for starred notes (Keep if re-adding starred notes)
  useEffect(() => {
    const fetchMissingStarredDetails = async () => {
      if (!starredNoteIds || starredNoteIds.length === 0) {
        setStarredNotesDetails({});
        setLoadingStarredOverall(false);
        return;
      }

      const notesMap = new Map(notes.map(note => [note.id, note]));
      const detailsToFetch = starredNoteIds.filter(id =>
        !notesMap.has(id) && (!starredNotesDetails[id] || starredNotesDetails[id].needsRefetch)
      );

      if (detailsToFetch.length === 0) {
         if (loadingStarredOverall) setLoadingStarredOverall(false);
        return;
      }

      setLoadingStarredOverall(true);
      const loadingUpdates = {};
       detailsToFetch.forEach(id => {
         loadingUpdates[id] = { id, isLoading: true, needsRefetch: false };
       });
       setStarredNotesDetails(prevDetails => ({ ...prevDetails, ...loadingUpdates }));

      const fetchedDetails = {};
      try {
        const promises = detailsToFetch.map(id =>
          notesApi.getNote(id, false) // Assuming includeDetails=false is efficient
            .then(note => {
              if (note) {
                fetchedDetails[id] = { id: note.id, title: note.title, color: note.color, isLoading: false, error: false };
              } else {
                 fetchedDetails[id] = { id, error: true, isLoading: false, message: 'Not Found' };
              }
            })
            .catch(error => {
              console.error(`Failed to fetch details for starred note ${id}:`, error);
              fetchedDetails[id] = { id, error: true, isLoading: false, message: 'Fetch Error' };
            })
        );
        await Promise.all(promises);
        setStarredNotesDetails(prevDetails => ({ ...prevDetails, ...fetchedDetails }));
      } catch (error) {
        console.error("Error fetching starred note details:", error);
      } finally {
        setLoadingStarredOverall(false);
      }
    };

    fetchMissingStarredDetails();
  }, [starredNoteIds, notes]); // Re-run if IDs or notes context change


  // Combine context notes and fetched details for starred notes (Keep if re-adding)
  const allStarredNotesData = useMemo(() => {
    if (!starredNoteIds) return [];

    const notesMap = new Map(notes.map(note => [note.id, note]));
    return starredNoteIds
      .map(id => {
        const noteFromContext = notesMap.get(id);
        if (noteFromContext) {
          return { ...noteFromContext, isLoading: false, error: false };
        }
        const noteFromState = starredNotesDetails[id];
        if (noteFromState) {
          return noteFromState;
        }
        return { id, isLoading: true, error: false }; // Mark for fetching
      })
      .filter(note => note && !note.error); // Filter out permanent errors
  }, [starredNoteIds, notes, starredNotesDetails]);


  // Pinned folders in pin order
  const pinnedFolders = useMemo(() => {
    if (tagsLoading) return [];
    const folderMap = new Map(
      tags.filter(t => t.is_folder).map(t => [t.id, t])
    );
    return pinnedFolderIds.map(id => folderMap.get(id)).filter(Boolean);
  }, [tags, tagsLoading, pinnedFolderIds]);

  // --- Render Logic ---
  return (
    <QuickAccessContainer>
      <SectionTitle>Quick Access</SectionTitle>

      {/* Pinned Folders + Saved Searches */}
      {(pinnedFolders.length > 0 || savedSearches.length > 0) && (
        <ItemsWrapper>
          {pinnedFolders.map((folder) => (
            <PinnedFolderItem
              key={`pinned-folder-${folder.id}`}
              theme={isDarkTheme ? 'dark' : 'light'}
              onClick={() => searchByTag(folder.id, folder.name)}
              title={`Search folder: ${folder.name}`}
            >
              <Icon name="folder" size={14} strokeWidth={2} />
              <FolderChipName>{truncateText(folder.name.replace('📁', '').trim(), 22)}</FolderChipName>
              <FolderChipCount theme={isDarkTheme ? 'dark' : 'light'}>{folder.note_count || 0}</FolderChipCount>
            </PinnedFolderItem>
          ))}

          {savedSearches.map((search, index) => {
            const formattedLabel = formatMonthSearchLabel(search);
            const displayLabel = formattedLabel ? formattedLabel : truncateText(search, 15);

            return (
              <React.Fragment key={`saved-search-${search}-${index}`}>
                <SavedSearchItem
                  theme={isDarkTheme ? 'dark' : 'light'}
                  onClick={(e) => handleSearchClick(search, e)}
                  title={`Run search: ${search}`}
                >
                  <Icon name="search" size={16} /> <Spacer />
                  <SearchLabel>{displayLabel}</SearchLabel>
                </SavedSearchItem>
              </React.Fragment>
            );
          })}
        </ItemsWrapper>
      )}

    </QuickAccessContainer>
  );
};

// --- Styled Components ---

const QuickAccessContainer = styled.div`
  width: calc(100% - 40px);
  max-width: 1460px; /* Adjust as needed */ 
  margin: 0 auto;
  padding: 0 0px;
  margin-top: 24px;
  margin-bottom: 0px;

  @media (max-width: 600px) {
    width: calc(100% - 20px);
  }
`;

const ItemsWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px; /* Spacing between items */
  margin-top: 16px;
  margin-bottom: 16px;
  padding-left: 8px; /* Indent on mobile */
  justify-content: center; /* Center items horizontally */

  @media (min-width: 768px) {
    padding-left: 0; /* No indent on larger screens */
  }

  @media (max-width: 768px) {
    gap: 5px; /* Slightly smaller gap on mobile */
  }
`;

// Base styles for clickable items (tags, searches, starred notes)
const BaseItem = styled.div`
  display: inline-flex; /* Use flex for alignment */
  align-items: center;
  justify-content: center; /* Center content within the pill */
  color: var(--text-color);
  text-align: center;
  max-width: 150px; /* Default max-width */
  opacity: 0.8;
  padding: 4px 8px; /* Default padding */
  border-radius: 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.2s ease, opacity 0.2s ease; /* Smooth transitions */
  height: 28px; /* Explicit height for consistent alignment */
  box-sizing: border-box; /* Include padding/border in height */
  flex-grow: 0; /* Don't grow by default */
  flex-shrink: 0; /* Don't shrink by default */

  /* Default background */
  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.07)'
    : 'rgba(0, 0, 0, 0.07)'};
    
  @media (hover: hover) {
    &:hover {
      opacity: 1;
      background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.12)'};
    }
  }

  & > svg { /* Style direct SVG children */
     flex-shrink: 0; /* Prevent icon from shrinking */
  }
`;

const PinnedFolderItem = styled(BaseItem)`
  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.12)'};
  justify-content: flex-start;
  gap: 5px;
  max-width: 220px;
  padding-left: 8px;
  padding-right: 10px;

  &:hover {
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.2)'
      : 'rgba(0, 0, 0, 0.2)'};
  }
`;

const FolderChipName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FolderChipCount = styled.span`
  font-size: 12px;
  flex-shrink: 0;
  opacity: 0.55;
`;

const SavedSearchItem = styled(BaseItem)`
  max-width: 160px;
  justify-content: flex-start;
`;

// Styled component for Starred Notes (Keep if re-adding)
const StarredNoteItem = styled(BaseItem)`
  max-width: 160px; /* Adjust as needed */
  justify-content: space-between;

  /* Apply specific color styles if color is not default */
  ${props => props.$color && props.$color !== 'default' && css`
    background-color: var(--note-color-${props.$color});
    color: ${props.theme === 'dark' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)'};
    border: none;

    &:hover {
      opacity: 1;
      background-color: ${props.theme === 'dark'
        ? `color-mix(in srgb, var(--note-color-${props.$color}) 90%, #000)`
        : `color-mix(in srgb, var(--note-color-${props.$color}) 95%, #fff)`};
    }

    & svg {
      color: inherit;
      opacity: 0.8;
    }
  `}

  /* Explicitly apply default styles if color is default */
  ${props => (!props.$color || props.$color === 'default') && css`
    /* Styles inherited from BaseItem */
     & svg {
      color: var(--text-color);
      opacity: 0.8;
    }
  `}
`;


const SearchLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-grow: 1; /* Allow label to take available space */
  min-width: 0; /* Important for flex ellipsis */
  text-align: left; /* Align text left within its space */
  margin: 0 4px; /* Add margin around label */
`;

const Spacer = styled.span`
  /* Simple spacer */
  display: inline-block;
  width: 4px;
  flex-shrink: 0; /* Prevent spacer from shrinking */
`;

const RemoveButton = styled.button`
  border: none;
  color: inherit; /* Inherit color from parent */
  opacity: 0.6; /* Slightly less prominent */
  cursor: pointer;
  padding: 0; /* Remove padding */
  margin: 0; /* Remove margin */
  display: flex; /* Align icon */
  align-items: center;
  justify-content: center;
  flex-shrink: 0; /* Prevent button from shrinking */
  margin-left: 0px; /* Small space before button */
  width: 26px; /* Give fixed width */
  height: 28px; /* Give fixed height */
  border-radius: 0 50% 50% 0; /* Make it circular */
  transition: background-color 0.2s ease, opacity 0.2s ease;
    
  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.15)'};
  }    
  @media (max-width: 768px) {
    margin-left: -4px; /* Slightly smaller gap on mobile */
  }
`;


const LoadingMessage = styled.div`
  /* Kept for potential use */
  color: var(--text-color-secondary);
  font-size: 12px;
  font-style: italic;
  width: 100%; /* Take full width */
  text-align: center; /* Center the message */
`;

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  /* Kept for potential use */
  width: 20px; /* Smaller spinner */
  height: 20px;
  border: 2px solid rgba(95, 99, 104, 0.2);
  border-top: 2px solid var(--text-color);
  border-radius: 50%;
  animation: ${spin} 1s linear infinite;
  margin: 0 auto; /* Center spinner */
`;

export default QuickAccess;
