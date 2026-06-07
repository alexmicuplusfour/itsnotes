import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { useTags } from '../contexts/TagsContext';
import { useNotes } from '../contexts/NotesContext';
import Icon from './Icons';

const slideDown = keyframes`
  from { opacity: 0; transform: translateY(-30px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideUp = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-30px); }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const HeaderContainer = styled.div`
  margin-bottom: 12px;
`;

const FolderBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  width: 100%;
  padding: 10px 14px;
  box-sizing: border-box;
  border-radius: 18px;
  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(0, 0, 0, 0.07)'};
`;

const FolderName = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  min-width: 0;
  overflow: hidden;
  flex-shrink: 1;
`;

const FolderNameText = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const RightSide = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 5px;
  border-radius: 4px;
  color: var(--text-color);
  cursor: pointer;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.1);
  }
`;

const FolderChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 2px 0;
`;

const ParentChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 2px 8px;
`;

const FolderChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  opacity: 0.9;
  background-color: ${props => props.$isParent
    ? (props.theme === 'dark' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)')
    : (props.theme === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)')};
  color: ${props => props.$isParent
    ? (props.theme === 'dark' ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)')
    : 'var(--text-color)'};

  &:hover {
    opacity: 1;
    background-color: ${props => props.$isParent
      ? (props.theme === 'dark' ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0.9)')
      : (props.theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.14)')};
  }
`;

const DropdownOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1998;
  display: none;

  @media (max-width: 768px) {
    display: block;
    pointer-events: auto;
    animation: ${props => props.$isClosing ? fadeOut : fadeIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
`;

const MoreDropdown = styled.div`
  position: absolute;
  top: 36px;
  right: 0;
  background-color: var(--dropdown-bg-color, var(--note-bg-color));
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 1999;
  min-width: max-content;
  overflow: hidden;
  padding-top: 6px;
  padding-bottom: 6px;

  @media (max-width: 768px) {
    position: fixed;
    left: 12px;
    right: 12px;
    width: auto;
    min-width: unset;
    bottom: auto;
    top: ${props => props.$mobileTop ?? 60}px;
    border-radius: 12px;
    border: none;
    box-sizing: border-box;
    box-shadow: 0 -2px 60px var(--shadow-color);
    background-color: var(--dropdown-bg-color-glassy);
    padding-top: 8px;
    padding-bottom: 8px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    animation: ${props => props.$isClosing ? slideUp : slideDown} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
`;

const DropdownItem = styled.button`
  width: 100%;
  padding: 12px 12px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  font-size: 14px;
  color: ${props => props.$danger ? 'var(--error-color, #f44336)' : 'var(--text-color)'};

  @media (max-width: 768px) {
    font-size: 16px;
    padding: 16px 12px;
    padding-left: 20px;
  }

  &:hover:not(:disabled) {
    background-color: ${props => props.$isDark
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.05)'};
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  & > svg {
    margin-right: 14px;

    @media (max-width: 768px) {
      margin-right: 20px;
      width: 24px;
      height: 24px;
    }
  }
`;

const SubfolderFormSection = styled.div`
  padding: 4px 12px 8px;

  @media (max-width: 768px) {
    padding: 4px 20px 12px;
  }
`;

const SubfolderInputWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 4px;
  height: 34px;
  border-radius: 8px;
  background-color: var(--input-bg-color);

  @media (max-width: 768px) {
    height: 42px;
  }
`;

const SubfolderInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  font-size: 14px;
  color: var(--text-color);
  line-height: normal;
  height: 100%;
  box-sizing: border-box;
  background: transparent;

  @media (max-width: 768px) {
    font-size: 15px;
  }
`;

const SubfolderActionButton = styled.button`
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
  }

  &.create-button {
    background-color: var(--foreground-color);
    color: var(--text-color-contrast);
    &:hover:not(:disabled) {
      background-color: var(--foreground-color);
    }
  }

  @media (max-width: 768px) {
    height: 32px;
    width: 32px;
  }
`;

const FolderHeader = ({ searchQuery }) => {
  const { tags, createTag, deleteTag, toggleTagVisibility, toggleTagHidden, isTagHidden } = useTags();
  const { searchByTag, handleSearch, resolvedTagIds } = useNotes();

  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  const [showDropdown, setShowDropdown] = useState(false);
  const [isDropdownClosing, setIsDropdownClosing] = useState(false);
  const [shouldRenderDropdown, setShouldRenderDropdown] = useState(false);

  const [isCreatingSubfolder, setIsCreatingSubfolder] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState('');

  const dropdownRef = useRef(null);
  const subfolderInputRef = useRef(null);
  const moreButtonRef = useRef(null);
  const [dropdownTop, setDropdownTop] = useState(60);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (showDropdown) {
      setShouldRenderDropdown(true);
      setIsDropdownClosing(false);
    } else if (shouldRenderDropdown) {
      if (window.innerWidth <= 768) {
        setIsDropdownClosing(true);
        const timer = setTimeout(() => {
          setShouldRenderDropdown(false);
          setIsDropdownClosing(false);
          setIsCreatingSubfolder(false);
          setNewSubfolderName('');
        }, 300);
        return () => clearTimeout(timer);
      } else {
        setShouldRenderDropdown(false);
        setIsCreatingSubfolder(false);
        setNewSubfolderName('');
      }
    }
  }, [showDropdown, shouldRenderDropdown]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (window.innerWidth <= 768) return; // overlay handles closing on mobile
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    if (isCreatingSubfolder && subfolderInputRef.current) {
      subfolderInputRef.current.focus();
    }
  }, [isCreatingSubfolder]);

  const currentFolder = useMemo(() => {
    if (!searchQuery) return null;
    const tagMatches = [...searchQuery.matchAll(/#([^\s#]+)/g)].map(m => m[1]);
    for (const tagName of tagMatches) {
      const resolvedId = resolvedTagIds[tagName.toLowerCase()];
      const tag = resolvedId
        ? tags.find(t => t.id === resolvedId)
        : tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
      if (tag?.is_folder) return tag;
    }
    return null;
  }, [searchQuery, tags, resolvedTagIds]);

  const parentFolder = useMemo(() => {
    if (!currentFolder?.parent_id) return null;
    return tags.find(t => t.id === currentFolder.parent_id) || null;
  }, [currentFolder, tags]);

  const subfolders = useMemo(() => {
    if (!currentFolder || currentFolder.parent_id) return [];
    return tags
      .filter(t => t.parent_id === currentFolder.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tags, currentFolder]);

  const closeDropdown = useCallback(() => setShowDropdown(false), []);

  const handleCreateSubfolder = useCallback(async () => {
    const trimmed = newSubfolderName.trim();
    if (!trimmed || !currentFolder) return;
    if (subfolders.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) return;
    await createTag(trimmed, true, true, currentFolder.id);
    setNewSubfolderName('');
    setIsCreatingSubfolder(false);
    closeDropdown();
  }, [newSubfolderName, currentFolder, createTag, closeDropdown]);

  const handleToggleVisibility = useCallback(async () => {
    if (!currentFolder) return;
    const currentlyHidden = isTagHidden(currentFolder.id);
    toggleTagHidden(currentFolder.id);
    closeDropdown();
    try {
      await toggleTagVisibility(currentFolder.id, currentlyHidden);
    } catch {
      toggleTagHidden(currentFolder.id); // revert on failure
    }
  }, [currentFolder, isTagHidden, toggleTagHidden, toggleTagVisibility, closeDropdown]);

  const handleDelete = useCallback(async () => {
    if (!currentFolder) return;
    closeDropdown();

    const hasSubfolders = subfolders.length > 0;
    const msg = hasSubfolders
      ? `Delete "${currentFolder.name}" and its ${subfolders.length} subfolder${subfolders.length !== 1 ? 's' : ''}? All notes inside will be moved to trash.`
      : `Delete "${currentFolder.name}"? All notes inside will be moved to trash.`;

    if (!window.confirm(msg)) return;

    await deleteTag(currentFolder.id, { withNotes: true });

    if (parentFolder) {
      searchByTag(parentFolder.id, parentFolder.name);
    } else {
      handleSearch('');
    }
  }, [currentFolder, subfolders, parentFolder, deleteTag, searchByTag, handleSearch, closeDropdown]);

  if (!currentFolder) return null;

  const theme = isDarkTheme ? 'dark' : 'light';

  const dropdownContent = (
    <MoreDropdown $isClosing={isDropdownClosing} $mobileTop={dropdownTop} onClick={e => e.stopPropagation()}>
      {!parentFolder && (
        <>
          <DropdownItem
            type="button"
            $isDark={isDarkTheme}
            onClick={() => setIsCreatingSubfolder(true)}
            disabled={isCreatingSubfolder}
          >
            <Icon name="folder" size={18} />
            Create subfolder
          </DropdownItem>
          {isCreatingSubfolder && (
            <SubfolderFormSection>
              <SubfolderInputWrapper>
                <SubfolderInput
                  ref={subfolderInputRef}
                  value={newSubfolderName}
                  onChange={e => setNewSubfolderName(e.target.value.replace(/[\s#/]/g, '-'))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateSubfolder();
                    if (e.key === 'Escape') {
                      setIsCreatingSubfolder(false);
                      setNewSubfolderName('');
                    }
                  }}
                  placeholder="Subfolder name..."
                />
                <SubfolderActionButton
                  className="create-button"
                  style={{ visibility: newSubfolderName.trim() ? 'visible' : 'hidden' }}
                  disabled={!newSubfolderName.trim() || subfolders.some(
                    s => s.name.toLowerCase() === newSubfolderName.trim().toLowerCase()
                  )}
                  onClick={handleCreateSubfolder}
                  title="Create subfolder"
                >
                  <Icon name="add" size={20} strokeWidth="2.5" />
                </SubfolderActionButton>
                <SubfolderActionButton
                  onClick={() => {
                    setIsCreatingSubfolder(false);
                    setNewSubfolderName('');
                  }}
                  title="Cancel"
                >
                  <Icon name="close" size={20} strokeWidth="2.5" />
                </SubfolderActionButton>
              </SubfolderInputWrapper>
            </SubfolderFormSection>
          )}
        </>
      )}
      <DropdownItem
        type="button"
        $isDark={isDarkTheme}
        disabled={isCreatingSubfolder}
        onClick={handleToggleVisibility}
      >
        <Icon name={isTagHidden(currentFolder.id) ? 'eye' : 'eye-slash'} size={18} />
        {isTagHidden(currentFolder.id) ? 'Show folder' : 'Hide folder'}
      </DropdownItem>
      <DropdownItem
        type="button"
        $isDark={isDarkTheme}
        $danger
        disabled={isCreatingSubfolder}
        onClick={handleDelete}
      >
        <Icon name="trash" size={18} />
        Delete with notes
      </DropdownItem>
    </MoreDropdown>
  );

  return (
    <HeaderContainer>
      {parentFolder && (
        <ParentChips>
          <FolderChip
            theme={theme}
            $isParent
            onClick={() => searchByTag(parentFolder.id, parentFolder.name)}
            title={`Back to: ${parentFolder.name}`}
          >
            <Icon name="folder" size={12} strokeWidth={2} />
            {parentFolder.name}
          </FolderChip>
        </ParentChips>
      )}

      <FolderBar theme={theme}>
        <FolderName>
          <Icon name="folder" size={20} strokeWidth={2} style={{ flexShrink: 0 }} />
          <FolderNameText>{currentFolder.name}</FolderNameText>
        </FolderName>
        <RightSide>
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <IconButton
              ref={moreButtonRef}
              type="button"
              title="Folder options"
              onClick={() => {
                if (!showDropdown && moreButtonRef.current) {
                  const rect = moreButtonRef.current.getBoundingClientRect();
                  setDropdownTop(rect.bottom + 8);
                }
                setShowDropdown(prev => !prev);
              }}
            >
              <Icon name="more" size={18} />
            </IconButton>

            {shouldRenderDropdown && !isMobile && dropdownContent}
          </div>
        </RightSide>
      </FolderBar>

      {shouldRenderDropdown && isMobile && createPortal(
        <>
          <DropdownOverlay
            $isClosing={isDropdownClosing}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              closeDropdown();
            }}
          />
          {dropdownContent}
        </>,
        document.body
      )}

      {subfolders.length > 0 && (
        <FolderChips>
          {subfolders.map(sf => (
            <FolderChip
              key={sf.id}
              theme={theme}
              onClick={() => searchByTag(sf.id, sf.name)}
              title={`Open subfolder: ${sf.name}`}
            >
              <Icon name="folder" size={12} strokeWidth={2} />
              {sf.name}
            </FolderChip>
          ))}
        </FolderChips>
      )}
    </HeaderContainer>
  );
};

export default FolderHeader;
