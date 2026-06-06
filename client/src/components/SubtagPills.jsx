import React, { useState, useEffect, useMemo } from 'react';
import styled, { css } from 'styled-components'; // Import css helper
import { useTags } from '../contexts/TagsContext';
import { useNotes } from '../contexts/NotesContext';

// --- Styled Components ---
const PillsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  padding: 8px 0 16px;
  margin-bottom: 8px;
  @media (max-width: 768px) {
    gap: 5px;
    padding: 4px 0 12px;
  }
`;

// Define selected styles using the css helper for better organization
const selectedStyles = css`
  
  outline: 2px solid var(--foreground-color);

`;

const BaseItem = styled.div`
  display: inline-flex;
  align-items: center;
  color: var(--text-color);
  text-align: center;
  max-width: 150px;
  opacity: 0.8;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.2s ease, opacity 0.2s ease, border-color 0.2s ease; /* Add border-color transition if using border */
  height: 28px;
  box-sizing: border-box;
  justify-content: center;
  flex-grow: 1; /* Keep flex-grow */
  border: 1px solid transparent; /* Add transparent border to prevent layout shift */

  @media (max-width: 768px) {
    flex-grow: 1;
  }

  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.09)'
    : 'rgba(0, 0, 0, 0.09)'};

  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.15)'};
  }

  /* Apply selected styles conditionally */
  ${props => props.isSelected && selectedStyles}
`;

const TagItem = styled(BaseItem)`
  max-width: 120px; /* Max width for tags */
`;
// --- End Styled Components ---

const SubtagPills = ({ searchQuery }) => {
  const { tags } = useTags();
  const { handleSearch, setSearchQuery, setSearchBarActive } = useNotes();
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Calculate the current tag name *once* for efficiency and use in multiple places
  const currentTagNameWithoutHash = useMemo(() => {
      const tagSearchRegex = /^#((?:[^/]+)(?:\/[^/]+)*)$/;
      const match = searchQuery?.match(tagSearchRegex);
      // Return the name in lower case for consistent comparison
      return match ? match[1].toLowerCase() : null;
  }, [searchQuery]);


  const relatedTags = useMemo(() => {
    // If it's not a valid tag search according to our calculation, return empty
    if (!currentTagNameWithoutHash || !Array.isArray(tags)) {
      return [];
    }

    // We need the original case tag name to find the correct prefix
    const tagSearchRegex = /^#((?:[^/]+)(?:\/[^/]+)*)$/;
    const match = searchQuery?.match(tagSearchRegex);
    const originalCurrentTagName = match ? match[1] : null; // e.g., "Book/Fiction"

    if (!originalCurrentTagName) return []; // Should not happen if currentTagNameWithoutHash is set, but good safety check

    const lastSlashIndex = originalCurrentTagName.lastIndexOf('/');

    let parentTagPrefix = '';
    if (lastSlashIndex !== -1) {
      // It's a subtag search, get prefix up to and including the last slash
      parentTagPrefix = originalCurrentTagName.substring(0, lastSlashIndex + 1);
    } else {
      // It's a parent tag search, add the slash
      parentTagPrefix = `${originalCurrentTagName}/`;
    }

    // Use case-insensitive comparison for the prefix
    const lowerCasePrefix = parentTagPrefix.toLowerCase();

    const filteredTags = tags.filter(tag => {
      const tagNameLower = tag.name.toLowerCase();
      // Only check if the tag starts with the parent prefix
      // DO NOT filter out the currently selected tag anymore
      return tagNameLower.startsWith(lowerCasePrefix);
    });

    return filteredTags.sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

  }, [searchQuery, tags, currentTagNameWithoutHash]); // Add currentTagNameWithoutHash dependency


  const handleSubtagClick = (subtag) => {
    // Check if this subtag is currently selected
    const isCurrentlySelected = subtag.name.toLowerCase() === currentTagNameWithoutHash;
    
    if (isCurrentlySelected) {
      // If clicking on the already selected subtag, revert to parent tag
      const parentTag = subtag.name.substring(0, subtag.name.lastIndexOf('/'));
      const newQuery = `#${parentTag}`;
      setSearchQuery(newQuery);
      setSearchBarActive(true);
      handleSearch(newQuery);
    } else {
      // Normal behavior - search for the clicked subtag
      const newQuery = `#${subtag.name}`;
      setSearchQuery(newQuery);
      setSearchBarActive(true);
      handleSearch(newQuery);
    }
  };

  if (relatedTags.length === 0) {
    return null;
  }

  return (
    <PillsContainer>
      {relatedTags.map(tag => {
        // Determine if this tag is the one currently being searched (case-insensitive)
        const isSelected = tag.name.toLowerCase() === currentTagNameWithoutHash;

        return (
          <TagItem
            key={tag.id}
            theme={isDarkTheme ? 'dark' : 'light'}
            onClick={() => handleSubtagClick(tag)}
            title={isSelected ? `Back to parent tag: #${tag.name.substring(0, tag.name.lastIndexOf('/'))}` : `Search tag: #${tag.name}`}
            isSelected={isSelected} // <-- Pass the isSelected prop
          >
            {tag.name.substring(tag.name.lastIndexOf('/') + 1)}
          </TagItem>
        );
      })}
    </PillsContainer>
  );
};

export default SubtagPills;