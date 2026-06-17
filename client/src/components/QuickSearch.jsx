import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom'; // Import ReactDOM for Portals
import styled, { css, keyframes } from 'styled-components';
import { useNotes } from '../contexts/NotesContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';
import { useTags } from '../contexts/TagsContext';
import { notesApi } from '../services/api';
import Icon from './Icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Define the same colors as in QuickAccess
const COLORS = [
  'default', 'coral', 'peach', 'sand', 'mint', 'sage',
  'fog', 'storm', 'dusk', 'blossom', 'clay', 'chalk'
];

// Helper function for truncating text
const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Helper function to format month searches 
const monthMap = {
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun",
  jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
  january: "Jan", february: "Feb", march: "Mar", april: "Apr",
  june: "Jun", july: "Jul", august: "Aug", september: "Sep",
  october: "Oct", november: "Nov", december: "Dec"
};

const formatMonthSearchLabel = (searchQuery) => {
  const monthSearchPattern = /^yr:(\d{4}):([a-zA-Z]{3,})$/i;
  const match = searchQuery?.match(monthSearchPattern);

  if (match) {
    const year = match[1];
    const monthInput = match[2].toLowerCase();
    const formattedMonth = monthMap[monthInput];

    if (formattedMonth) {
      return `${formattedMonth} ${year}`;
    }
  }
  return null;
};

// Tags Pill Component - now receives isDarkTheme as a prop
const TagsPill = ({ isSearchActive, isMobileView, isDarkTheme, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pillRef = useRef(null);
  const panelRef = useRef(null);

  // Notify parent of open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get data from contexts
  const { handleSearch } = useNotes();
  const { tags, loading: tagsLoading } = useTags();

  // Close panel when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen &&
          pillRef.current &&
          !pillRef.current.contains(event.target) &&
          panelRef.current &&
          !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = (event) => {
      if (panelRef.current && panelRef.current.contains(event.target)) {
        return;
      }
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  // Process regular tags (excluding folders and subtags)
  const regularTags = useMemo(() => {
    if (tagsLoading) return [];
    const uniqueTagsMap = new Map();
    tags.forEach(tag => {
      if (!tag.is_folder && !tag.name.includes('/')) {
        uniqueTagsMap.set(tag.id, tag);
      }
    });
    return Array.from(uniqueTagsMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tags, tagsLoading]);

  // Handle tag clicks - use handleSearch to preserve note param
  const handleTagClick = (tag) => {
    handleSearch(`#${tag.name}`, true, true);
    setIsOpen(false);
  };

  // Hide on mobile when search is active, show on desktop always
  if (isSearchActive && isMobileView) return null;
  return (
    <>
      <PillButton
        ref={pillRef}
        theme={isDarkTheme ? 'dark' : 'light'}
        $isOpen={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="Browse tags"
      >
        <Icon name="tag" size={18} strokeWidth={2.5} />
      </PillButton>

      {isOpen && ReactDOM.createPortal(
        <>
          <Backdrop $isOpen={isOpen} onClick={() => setIsOpen(false)} />
          <QuickSearchPanel
            $isSearchActive={isSearchActive}
            ref={panelRef}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            {/* Regular Tags Section */}
            {regularTags.length > 0 ? (
              <Section>
                <SectionTitle></SectionTitle>
                <ItemsGrid>
                  {regularTags.map((tag) => (
                    <TagItem
                      key={`tag-${tag.id}`}
                      theme={isDarkTheme ? 'dark' : 'light'}
                      onClick={() => handleTagClick(tag)}
                      title={`Search tag: ${tag.name}`}
                    >
                      {truncateText(tag.name, 15)}
                    </TagItem>
                  ))}
                </ItemsGrid>
              </Section>
            ) : (
              <EmptyState>No tags available</EmptyState>
            )}
          </QuickSearchPanel>
        </>,
        document.body // Render into the body to ensure it's top-level
      )}
    </>
  );
};

// Colors Pill Component - now receives isDarkTheme as a prop
const ColorsPill = ({ isSearchActive, isMobileView, isDarkTheme, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pillRef = useRef(null);
  const panelRef = useRef(null);

  // Notify parent of open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get data from contexts
  const { handleSearch } = useNotes();

  // Close panel when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen &&
          pillRef.current &&
          !pillRef.current.contains(event.target) &&
          panelRef.current &&
          !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = (event) => {
      if (panelRef.current && panelRef.current.contains(event.target)) {
        return;
      }
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  // Handle color clicks - use handleSearch to preserve note param
  const handleColorClick = (color) => {
    handleSearch(`$${color}`, true, true);
    setIsOpen(false);
  };

  // Hide on mobile when search is active, show on desktop always
  if (isSearchActive && isMobileView) return null;

  return (
    <>
      <PillButton
        ref={pillRef}
        theme={isDarkTheme ? 'dark' : 'light'}
        $isOpen={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="Browse colors"
      >
        <Icon name="palette" size={18} strokeWidth={2.5} />
      </PillButton>

      {isOpen && ReactDOM.createPortal(
        <>
          <Backdrop $isOpen={isOpen} onClick={() => setIsOpen(false)} />
          <QuickSearchPanel
            $isSearchActive={isSearchActive}
            ref={panelRef}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Section>
              <SectionTitle></SectionTitle>
              <ItemsGrid>
                {COLORS.filter(color => color !== 'default').map(color => (
                  <ColorCircle
                    key={`color-${color}`}
                    $color={color}
                    theme={isDarkTheme ? 'dark' : 'light'}
                    onClick={() => handleColorClick(color)}
                    title={`Search color: ${color}`}
                  />
                ))}
              </ItemsGrid>
            </Section>
          </QuickSearchPanel>
        </>,
        document.body // Render into the body
      )}
    </>
  );
};

// Folders Pill Component - now receives isDarkTheme as a prop
const FoldersPill = ({ isSearchActive, isMobileView, isDarkTheme, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pillRef = useRef(null);
  const panelRef = useRef(null);
  const [folderInputValue, setFolderInputValue] = useState('');
  const [newestFolderName, setNewestFolderName] = useState(null);
  const folderInputRef = useRef(null);

  // Notify parent of open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear input and transient state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setFolderInputValue('');
      setNewestFolderName(null);
    }
  }, [isOpen]);

  // Get data from contexts
  const { handleSearch, searchByTag } = useNotes();
  const { tags, loading: tagsLoading, deleteTag, loadTags, createTag } = useTags();
  const { pinnedFolderIds, pinFolder, unpinFolder } = useUIPreferences();

  // Close panel when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen &&
          pillRef.current &&
          !pillRef.current.contains(event.target) &&
          panelRef.current &&
          !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = (event) => {
      if (panelRef.current && panelRef.current.contains(event.target)) {
        return;
      }
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  // Process folders grouped with subfolders nested under their parent
  const folders = useMemo(() => {
    if (tagsLoading) return [];

    const allFolders = tags.filter(tag => tag.is_folder);

    const byTemporalCenter = (a, b) => {
      if (a.temporal_center === null && b.temporal_center === null) return a.name.localeCompare(b.name);
      if (a.temporal_center === null) return 1;
      if (b.temporal_center === null) return -1;
      return b.temporal_center - a.temporal_center;
    };

    const topLevel = allFolders.filter(t => !t.parent_id).sort(byTemporalCenter);

    const ordered = [];
    topLevel.forEach(parent => {
      ordered.push(parent);
      allFolders
        .filter(t => t.parent_id === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(child => ordered.push({ ...child, _isSubfolder: true }));
    });

    return ordered;
  }, [tags, tagsLoading]);

  const handleFolderClick = (folder) => {
    searchByTag(folder.id, folder.name);
    setIsOpen(false);
  };

  // Handle pin/unpin folder
  const handlePinFolder = (folderId, e) => {
    e.stopPropagation();
    if (pinnedFolderIds.includes(folderId)) {
      unpinFolder(folderId);
    } else {
      pinFolder(folderId);
    }
  };

  // Handle delete folder
  const handleDeleteFolder = async (folderId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this folder? (Notes will not be deleted)')) {
      return;
    }

    try {
      await deleteTag(folderId);
      await loadTags();
    } catch (error) {
      console.error('Error deleting folder:', error);
      alert('Failed to delete folder');
    }
  };

  // Filtered folders based on search input
  const filteredFolders = useMemo(() => {
    let list;
    if (!folderInputValue.trim()) {
      list = folders;
    } else {
      const query = folderInputValue.trim().toLowerCase();
      const visibleParentIds = new Set();
      folders.forEach(f => {
        if (!f._isSubfolder && f.name.toLowerCase().includes(query)) visibleParentIds.add(f.id);
      });
      folders.forEach(f => {
        if (f._isSubfolder && f.name.toLowerCase().includes(query)) visibleParentIds.add(f.parent_id);
      });
      list = folders.filter(f => {
        if (!f._isSubfolder) return visibleParentIds.has(f.id);
        const parentMatches = folders.find(p => p.id === f.parent_id)?.name.toLowerCase().includes(query);
        const selfMatches = f.name.toLowerCase().includes(query);
        return visibleParentIds.has(f.parent_id) && (selfMatches || parentMatches);
      });
    }

    if (newestFolderName) {
      const idx = list.findIndex(f => !f._isSubfolder && f.name.toLowerCase() === newestFolderName.toLowerCase());
      if (idx > 0) {
        list = [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
      }
    }

    return list;
  }, [folders, folderInputValue, newestFolderName]);

  const exactMatchExists = useMemo(() => {
    const name = folderInputValue.trim().toLowerCase();
    if (!name) return false;
    return folders.some(f => !f._isSubfolder && f.name.toLowerCase() === name);
  }, [folders, folderInputValue]);

  const handleCreateFolder = useCallback(async () => {
    const name = folderInputValue.trim();
    if (!name || exactMatchExists) return;
    await createTag(name, true, true, null);
    setNewestFolderName(name);
    setFolderInputValue('');
  }, [folderInputValue, exactMatchExists, createTag]);

  const handleFolderInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && folderInputValue.trim() && !exactMatchExists) {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      if (folderInputValue) {
        setFolderInputValue('');
      } else {
        setIsOpen(false);
      }
    }
  }, [folderInputValue, exactMatchExists, handleCreateFolder]);

  // Hide on mobile when search is active, show on desktop always
  if (isSearchActive && isMobileView) return null;
  return (
    <>
      <PillButtonWrapper>
        <PillButton
          ref={pillRef}
          theme={isDarkTheme ? 'dark' : 'light'}
          $isOpen={isOpen}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          title="Browse folders"
        >
          <Icon name="folder" size={18} strokeWidth={2.5} />
        </PillButton>
        {folders.filter(f => !f._isSubfolder).length > 0 && (
          <Badge>
            {folders.filter(f => !f._isSubfolder).length}
          </Badge>
        )}
      </PillButtonWrapper>

      {isOpen && ReactDOM.createPortal(
        <>
          <Backdrop $isOpen={isOpen} onClick={() => setIsOpen(false)} />
          <QuickSearchPanel
            $isSearchActive={isSearchActive}
            ref={panelRef}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            <Section>
              <SectionTitle>Folders</SectionTitle>
              <FolderInputWrapper>
                <FolderInput
                  ref={folderInputRef}
                  placeholder="Search or create folder..."
                  value={folderInputValue}
                  onChange={e => setFolderInputValue(e.target.value.replace(/[\s#/]/g, '-'))}
                  onKeyDown={handleFolderInputKeyDown}
                />
                <FolderActionButton
                  style={{ visibility: folderInputValue.trim() && !exactMatchExists ? 'visible' : 'hidden' }}
                  className="create-button"
                  onClick={handleCreateFolder}
                  title="Create folder"
                >
                  <Icon name="add" size={20} strokeWidth="2.5" />
                </FolderActionButton>
                <FolderActionButton
                  style={{ visibility: folderInputValue.trim() ? 'visible' : 'hidden' }}
                  onClick={() => setFolderInputValue('')}
                  title="Clear"
                >
                  <Icon name="close" size={20} strokeWidth="2.5" />
                </FolderActionButton>
              </FolderInputWrapper>
              {filteredFolders.length > 0 ? (
                <FoldersVerticalList>
                  {filteredFolders.map((folder) => (
                    <FolderListItem
                      key={`folder-${folder.id}`}
                      theme={isDarkTheme ? 'dark' : 'light'}
                      onClick={() => handleFolderClick(folder)}
                      title={`Search folder: ${folder.name}`}
                      style={folder._isSubfolder ? { paddingLeft: '28px' } : undefined}
                    >
                      <FolderName>{folder.name}</FolderName>
                      <FolderCount theme={isDarkTheme ? 'dark' : 'light'}>
                        {folder.note_count || 0}
                      </FolderCount>
                      {!folder._isSubfolder && (
                        <PinFolderButton
                          theme={isDarkTheme ? 'dark' : 'light'}
                          $isPinned={pinnedFolderIds.includes(folder.id)}
                          onClick={(e) => handlePinFolder(folder.id, e)}
                          title={pinnedFolderIds.includes(folder.id) ? 'Unpin from Quick Access' : 'Pin to Quick Access'}
                        >
                          <Icon name={pinnedFolderIds.includes(folder.id) ? 'pinned' : 'pin'} size={16} />
                        </PinFolderButton>
                      )}
                      <DeleteFolderButton
                        theme={isDarkTheme ? 'dark' : 'light'}
                        onClick={(e) => handleDeleteFolder(folder.id, e)}
                        title="Delete folder"
                      >
                        <Icon name="trash" size={16} />
                      </DeleteFolderButton>
                    </FolderListItem>
                  ))}
                </FoldersVerticalList>
              ) : !folderInputValue.trim() ? (
                <EmptyState>No folders yet</EmptyState>
              ) : null}
            </Section>
          </QuickSearchPanel>
        </>,
        document.body // Render into the body to ensure it's top-level
      )}
    </>
  );
};

// Saved Searches Pill Component - now receives isDarkTheme as a prop
const SavedSearchesPill = ({ isSearchActive, isMobileView, isDarkTheme, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const pillRef = useRef(null);
  const panelRef = useRef(null);
  const prevSearchCountRef = useRef(null); // Start as null to detect initial load
  const hasInitializedRef = useRef(false);

  // Notify parent of open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get data from contexts
  const { handleSearch } = useNotes();
  const { savedSearches, removeSavedSearch, reorderSavedSearches } = useUIPreferences();

  // Detect when a new saved search is added and trigger animation
  useEffect(() => {
    // Skip the very first render (initial load from localStorage)
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      prevSearchCountRef.current = savedSearches.length;
      return;
    }
    
    // Trigger animation if count increased
    if (savedSearches.length > prevSearchCountRef.current) {
      setShouldAnimate(true);
      // Reset animation after it completes
      const timer = setTimeout(() => setShouldAnimate(false), 500);
      prevSearchCountRef.current = savedSearches.length;
      return () => clearTimeout(timer);
    }
    prevSearchCountRef.current = savedSearches.length;
  }, [savedSearches.length]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Close panel when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen &&
          pillRef.current &&
          !pillRef.current.contains(event.target) &&
          panelRef.current &&
          !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = (event) => {
      if (panelRef.current && panelRef.current.contains(event.target)) {
        return;
      }
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  // Handle saved search clicks
  const handleSearchClick = (search, e) => {
    e.stopPropagation();
    handleSearch(search);
    setIsOpen(false);
  };

  const handleRemoveSavedSearchClick = (search, e) => {
    e.stopPropagation();
    removeSavedSearch(search);
  };

  // Handle drag end
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      reorderSavedSearches(active.id, over.id);
    }
  };

  // Hide on mobile when search is active, show on desktop always
  if (isSearchActive && isMobileView) return null;
  return (
    <>
      <PillButtonWrapper>
        <PillButton
          ref={pillRef}
          theme={isDarkTheme ? 'dark' : 'light'}
          $isOpen={isOpen}
          $shouldAnimate={shouldAnimate}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          title="Browse saved searches"
        >
          <Icon name="star" size={20} />
        </PillButton>
        {savedSearches.length > 0 && (
          <Badge>
            {savedSearches.length}
          </Badge>
        )}
      </PillButtonWrapper>

      {isOpen && ReactDOM.createPortal(
        <>
          <Backdrop $isOpen={isOpen} onClick={() => setIsOpen(false)} />
          <QuickSearchPanel
            $isSearchActive={isSearchActive}
            ref={panelRef}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            {savedSearches.length > 0 ? (
              <Section>
                <SectionTitle>Saved Searches</SectionTitle>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={savedSearches} strategy={verticalListSortingStrategy}>
                    <ItemsGrid>
                      {savedSearches.map((search, index) => (
                        <SortableSavedSearchItem
                          key={search}
                          search={search}
                          index={index}
                          isDarkTheme={isDarkTheme}
                          onSearchClick={handleSearchClick}
                          onRemoveClick={handleRemoveSavedSearchClick}
                        />
                      ))}
                    </ItemsGrid>
                  </SortableContext>
                </DndContext>
              </Section>
            ) : (
              <EmptyState>No saved searches</EmptyState>
            )}
          </QuickSearchPanel>
        </>,
        document.body // Render into the body
      )}
    </>
  );
};

// Calendar Pill Component - browse notes by year and month
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABEL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const CalendarPill = ({ isSearchActive, isMobileView, isDarkTheme, onOpenChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [monthCounts, setMonthCounts] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const pillRef = useRef(null);
  const panelRef = useRef(null);

  // Notify parent of open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get data from contexts
  const { handleSearch } = useNotes();

  // Lazily fetch per-month note counts the first time the panel opens
  useEffect(() => {
    if (!isOpen || hasLoaded) return;
    let cancelled = false;
    notesApi.getNoteMonthCounts()
      .then((data) => {
        if (!cancelled) {
          setMonthCounts(data?.counts || []);
          setHasLoaded(true);
        }
      })
      .catch((error) => {
        console.error('Error loading note month counts:', error);
        if (!cancelled) setHasLoaded(true);
      });
    return () => { cancelled = true; };
  }, [isOpen, hasLoaded]);

  // Close panel when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen &&
          pillRef.current &&
          !pillRef.current.contains(event.target) &&
          panelRef.current &&
          !panelRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleScroll = (event) => {
      if (panelRef.current && panelRef.current.contains(event.target)) {
        return;
      }
      if (isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  // Build a list of years (newest first), each with only the months that have
  // notes (also newest first), plus per-month and per-year counts.
  const calendarYears = useMemo(() => {
    const byYear = new Map();
    monthCounts.forEach(({ year, month, count }) => {
      if (!count) return;
      if (!byYear.has(year)) byYear.set(year, []);
      const index = month - 1; // month is 1-12
      byYear.get(year).push({ index, short: MONTH_SHORT[index], label: MONTH_LABEL[index], count });
    });

    return [...byYear.keys()]
      .sort((a, b) => b - a)
      .map((year) => {
        const months = byYear.get(year).sort((a, b) => b.index - a.index);
        const total = months.reduce((sum, m) => sum + m.count, 0);
        return { year, total, months };
      });
  }, [monthCounts]);

  const handleYearClick = (year) => {
    handleSearch(`yr:${year}`, true, true);
    setIsOpen(false);
  };

  const handleMonthClick = (year, monthShort) => {
    handleSearch(`yr:${year}:${monthShort}`, true, true);
    setIsOpen(false);
  };

  // Hide on mobile when search is active, show on desktop always
  if (isSearchActive && isMobileView) return null;
  return (
    <>
      <PillButton
        ref={pillRef}
        theme={isDarkTheme ? 'dark' : 'light'}
        $isOpen={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="Browse by date"
      >
        <Icon name="calendar" size={18} strokeWidth={2.5} />
      </PillButton>

      {isOpen && ReactDOM.createPortal(
        <>
          <Backdrop $isOpen={isOpen} onClick={() => setIsOpen(false)} />
          <QuickSearchPanel
            $isSearchActive={isSearchActive}
            ref={panelRef}
            theme={isDarkTheme ? 'dark' : 'light'}
          >
            {calendarYears.length > 0 ? (
              <Section>
                <SectionTitle></SectionTitle>
                {calendarYears.map(({ year, total, months }) => (
                  <CalendarYearBlock key={`cal-year-${year}`}>
                    <YearChip
                      theme={isDarkTheme ? 'dark' : 'light'}
                      onClick={() => handleYearClick(year)}
                      title={`Search year: ${year}`}
                    >
                      {year}
                      <CalendarCount theme={isDarkTheme ? 'dark' : 'light'}>{total}</CalendarCount>
                    </YearChip>
                    <ItemsGrid>
                      {months.map((month) => (
                        <TagItem
                          key={`cal-${year}-${month.short}`}
                          theme={isDarkTheme ? 'dark' : 'light'}
                          onClick={() => handleMonthClick(year, month.short)}
                          title={`Search ${month.label} ${year}`}
                        >
                          {month.label}
                          <CalendarCount theme={isDarkTheme ? 'dark' : 'light'}>{month.count}</CalendarCount>
                        </TagItem>
                      ))}
                    </ItemsGrid>
                  </CalendarYearBlock>
                ))}
              </Section>
            ) : (
              <EmptyState>{hasLoaded ? 'No notes yet' : 'Loading...'}</EmptyState>
            )}
          </QuickSearchPanel>
        </>,
        document.body
      )}
    </>
  );
};

// Main component that renders all three pills
// It now manages the isDarkTheme state
const QuickAccessPills = ({ isSearchActive, isMobileView, onPanelOpenChange }) => {
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );
  
  // Track which panels are open
  const [openPanels, setOpenPanels] = useState({
    savedSearches: false,
    tags: false,
    folders: false,
    colors: false,
    calendar: false
  });
  
  // Notify parent when any panel open state changes
  useEffect(() => {
    const isAnyPanelOpen = Object.values(openPanels).some(v => v);
    onPanelOpenChange?.(isAnyPanelOpen);
  }, [openPanels]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const handlePanelToggle = useCallback((panelName, isOpen) => {
    setOpenPanels(prev => ({ ...prev, [panelName]: isOpen }));
  }, []);

  // Theme detection logic is now here, in the parent component.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  return (
    <PillButtonContainer theme={isDarkTheme ? 'dark' : 'light'}>
      <SavedSearchesPill
        isSearchActive={isSearchActive}
        isMobileView={isMobileView}
        isDarkTheme={isDarkTheme}
        onOpenChange={(isOpen) => handlePanelToggle('savedSearches', isOpen)}
      />
      <TagsPill
        isSearchActive={isSearchActive}
        isMobileView={isMobileView}
        isDarkTheme={isDarkTheme}
        onOpenChange={(isOpen) => handlePanelToggle('tags', isOpen)}
      />
      <FoldersPill
        isSearchActive={isSearchActive}
        isMobileView={isMobileView}
        isDarkTheme={isDarkTheme}
        onOpenChange={(isOpen) => handlePanelToggle('folders', isOpen)}
      />
      <CalendarPill
        isSearchActive={isSearchActive}
        isMobileView={isMobileView}
        isDarkTheme={isDarkTheme}
        onOpenChange={(isOpen) => handlePanelToggle('calendar', isOpen)}
      />
      <ColorsPill
        isSearchActive={isSearchActive}
        isMobileView={isMobileView}
        isDarkTheme={isDarkTheme}
        onOpenChange={(isOpen) => handlePanelToggle('colors', isOpen)}
      />
    </PillButtonContainer>
  );
};

// Styled Components
const PillButtonContainer = styled.div`
  display: flex;
  gap: 2px; /* Adjust gap as needed */
  align-items: center;
  z-index: 5; /* Ensure it's above other content but below panels */
  border-radius: 16px;
  flex-shrink: 0;
                        
  background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.1)'
  };
                        
  @media (max-width: 600px) {
    gap: 0px;
    border-radius: 18px;  
  }   
`; 

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3); // Similar to ActionMenuBackdrop
  z-index: 999; // Ensure it's below the panel but above other content
  display: ${props => props.$isOpen ? 'block' : 'none'};
`;

// Star button pop animation
const starPop = keyframes`
  0% {
    transform: scale(1) rotate(0deg);
  }
  25% {
    transform: scale(1.4) rotate(-15deg);
  }
  50% {
    transform: scale(0.9) rotate(10deg);
  }
  75% {
    transform: scale(1.15) rotate(-5deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
`;

const PillButton = styled.button`
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 5;

  background-color: ${props => props.theme === 'dark'
    ? props.$isOpen 
      ? 'rgba(255, 255, 255, 0.15)'
      : 'transparent'
    : props.$isOpen
      ? 'rgba(0, 0, 0, 0.15)'
      : 'transparent'};

  color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.8)'
    : 'rgba(0, 0, 0, 0.8)'};

  ${props => props.$shouldAnimate && css`
    animation: ${starPop} 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `}

  @media (hover: hover) {
      &:hover {
        background-color: ${props => props.theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)'};

        color: ${props => props.theme === 'dark'
          ? 'rgba(255, 255, 255, 1)'
          : 'rgba(0, 0, 0, 1)'};
      }
  }

  ${props => props.$isOpen && css`
    background-color: ${props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.2)'
      : 'rgba(0, 0, 0, 0.15)'} !important;
  `}
    
  @media (max-width: 600px) {
    width: 36px;
    height: 36px;  
  }   
`;

const PillButtonWrapper = styled.div`
  position: relative;
  display: inline-block;
`;

const Badge = styled.div`
  position: absolute;
  top: -3px;
  right: -3px;
  border-radius: 10px;
  font-size: 11px;
  padding-left: 4px;
  padding-right: 4px;
  font-weight: 400;
  line-height: 1.3;
  min-height: 15px;
  min-width: 15px;
  width: auto;
  height: auto;    
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 1;
  pointer-events: none;
  background-color: var(--note-border-color);
  color: var(--text-color);
  box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    
  @media (max-width: 600px) {
     top: -4px;
     right: -4px;
  }      
`;

const QuickSearchPanel = styled.div`
  position: fixed;
  top: calc(var(--nav-height) - 10px);
  left: 50%;
  transform: translateX(-50%);
  width: ${props => props.$isSearchActive ? 'calc(700px - 16px)' : '450px'};
  background: var(--background-color);
  border-radius: 12px;
  box-shadow: 0 6px 120px rgba(0, 0, 0, 0.05);
  z-index: 1000;
  max-height: 400px;
  overflow-y: auto;
  padding: 16px;
  padding-top: 8px;

  @media (max-width: 768px) {
    width: calc(100% - 30px);
    top: calc(var(--nav-height) - 10px); 
  }
  @media (max-width: 600px) {
    width: calc(100% - 36px);
    top: calc(var(--nav-height) + 2px);
    border-radius: 0 0 30px 30px;
    border-top: none;
    background: var(--mobile-header-bg-color-glassy, rgba(245, 245, 245, 0.75));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 10px 120px rgba(0, 0, 0, 0.1);
  }

  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.2)'
      : 'rgba(0, 0, 0, 0.2)'};
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.3)'
      : 'rgba(0, 0, 0, 0.3)'};
  }
`;

const Section = styled.div`
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 400;
  color: #8a8f95;
  margin: 0 0 12px 0;
  padding-left: 4px;
  text-align: center;
`;

const ItemsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
     
  @media (max-width: 600px) {
    gap: 6px; 
  }    
`;

// Base styles for clickable items
const BaseItem = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  text-align: center;
  opacity: 0.8;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  height: 28px;
  box-sizing: border-box;
  flex-grow: 0;
  flex-shrink: 0;

  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.07)'
    : 'rgba(0, 0, 0, 0.07)'};
    
  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.12)'};
  }

  & > svg {
    flex-shrink: 0;
  }
`;

const TagItem = styled(BaseItem)`
  max-width: 120px;
`;

const CalendarYearBlock = styled.div`
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const YearChip = styled(BaseItem)`
  margin-bottom: 8px;
  padding: 4px 12px;

  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.12)'};

  &:hover {
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.2)'
      : 'rgba(0, 0, 0, 0.2)'};
  }
`;

const CalendarCount = styled.span`
  margin-left: 6px;
  font-size: 12px;
  color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.5)'
    : 'rgba(0, 0, 0, 0.5)'};
  flex-shrink: 0;
`;

const FolderTagItem = styled(TagItem)`
  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.12)'
    : 'rgba(0, 0, 0, 0.12)'};

  &:hover {
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.2)'
      : 'rgba(0, 0, 0, 0.2)'};
  }
`;

// Vertical folders list styled components
const FoldersVerticalList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FolderListItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease;

  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.07)'
    : 'rgba(0, 0, 0, 0.07)'};

  color: var(--text-color);

  &:hover {
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.12)'};
  }
`;

const FolderName = styled.span`
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 8px;
`;

const FolderCount = styled.span`
  font-size: 13px;
  color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.5)'
    : 'rgba(0, 0, 0, 0.5)'};
  margin-left: 8px;
  margin-right: 8px;
  flex-shrink: 0;
`;

const DeleteFolderButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  flex-shrink: 0;
  opacity: 0.6;

  color: var(--text-color);

  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.15)'};

    color: rgba(255, 50, 50, 1);
  }
`;

const PinFolderButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  flex-shrink: 0;
  opacity: ${props => props.$isPinned ? '0.85' : '0.45'};
  color: var(--text-color);

  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.15)'};
  }
`;

// Sortable Saved Search Item Component
const SortableSavedSearchItem = ({ search, index, isDarkTheme, onSearchClick, onRemoveClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: search });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const formattedLabel = formatMonthSearchLabel(search);
  const displayLabel = formattedLabel ? formattedLabel : truncateText(search, 15);

  const handleItemClick = (e) => {
    if (!isDragging) {
      onSearchClick(search, e);
    }
  };

  return (
    <SavedSearchItem
      ref={setNodeRef}
      style={style}
      theme={isDarkTheme ? 'dark' : 'light'}
      onClick={handleItemClick}
      title={`Run search: ${search}`}
      {...attributes}
      {...listeners}
    >
      {displayLabel}
      <Spacer />
      <RemoveButton
        theme={isDarkTheme ? 'dark' : 'light'}
        onClick={(e) => {
          e.stopPropagation();
          onRemoveClick(search, e);
        }}
        title="Remove saved search"
      >
        <Icon name="close" size={16} strokeWidth="3" />
      </RemoveButton>
    </SavedSearchItem>
  );
};

const SavedSearchItem = styled(BaseItem)`
  max-width: 160px;
  justify-content: space-between;
  padding-right: 0px;
  cursor: pointer;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }
`;

const Spacer = styled.span`
  display: inline-block;
  width: 4px;
  flex-shrink: 0;
`;

const RemoveButton = styled.button`
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 28px;
  border-radius: 0 50% 50% 0;
  transition: background-color 0.2s ease, opacity 0.2s ease;
    
  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.15)'};
  }
`;

const ColorCircle = styled.span`
  display: inline-block;
  width: 30px;
  height: 30px;
  border-radius: 50vh;
  background-color: var(--note-color-${props => props.$color});
  outline: 1px solid var(--border-transparent);
  outline-offset: -1px;
  cursor: pointer;

  &:hover {
    outline: 2px solid var(--foreground-color);
    outline-offset: -2px;  
  }
`;

const FolderInputWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 4px;
  height: 34px;
  border-radius: 8px;
  background-color: var(--input-bg-color);
  margin-bottom: 10px;
`;

const FolderInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 14px;
  color: var(--text-color);
  line-height: normal;
  height: 100%;
  box-sizing: border-box;
  background: transparent;
`;

const FolderActionButton = styled.button`
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0;
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  width: 26px;
  border-radius: 50%;

  &:hover:not(:disabled) {
    background-color: rgba(128, 128, 128, 0.1);
  }
  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background-color: transparent;
  }

  &.create-button {
    background-color: var(--foreground-color);
    color: var(--text-color-contrast);
    &:hover:not(:disabled) { background-color: var(--foreground-color); }
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 20px;
  color: #8a8f95;
`;

export default QuickAccessPills;