import React, { useState, useEffect, useMemo } from 'react';
import styled, { css } from 'styled-components';

const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};
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

const SectionTitle = styled.div`
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  opacity: 0.7;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TagItem = styled.div`
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
  transition: background-color 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
  height: 28px;
  box-sizing: border-box;
  justify-content: center;
  flex-grow: 1;
  border: 1px solid transparent;

  @media (max-width: 768px) {
    flex-grow: 1;
  }

  background-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 200, 200, 0.12)'
    : 'rgba(200, 100, 100, 0.12)'};

  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 150, 150, 0.18)'
      : 'rgba(200, 80, 80, 0.18)'};
  }
`;

const CurrentTags = ({ searchQuery }) => {
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

  // Extract all tags and strings from the search query
  const { currentTags, currentStrings } = useMemo(() => {
    if (!searchQuery || !Array.isArray(tags)) {
      return { currentTags: [], currentStrings: [] };
    }

    // Find all tag patterns in the search query (#tagname)
    const tagRegex = /#([^\s#]+)/g;
    const tagMatches = [];
    let match;
    
    while ((match = tagRegex.exec(searchQuery)) !== null) {
      tagMatches.push(match[1]);
    }

    // Extract strings by removing all tags from the query
    let stringPart = searchQuery.replace(/#[^\s#]+/g, '').trim();
    stringPart = stringPart.replace(/\s+/g, ' '); // Clean up extra spaces
    
    const strings = stringPart ? stringPart.split(' ').filter(s => s.length > 0) : [];

    // Only show if there are multiple tags (original behavior)
    if (tagMatches.length <= 1) {
      return { currentTags: [], currentStrings: [] };
    }

    // Find the corresponding tag objects
    const tagObjects = tagMatches
      .map(tagName => {
        return tags.find(tag => 
          tag.name.toLowerCase() === tagName.toLowerCase()
        );
      })
      .filter(tag => tag !== undefined); // Remove any tags that weren't found

    // Combine all strings into a single string and truncate if needed
    const combinedString = strings.length > 0 ? strings.join(' ') : '';
    const truncatedString = combinedString.length > 15 ? combinedString.substring(0, 15) + '...' : combinedString;
    
    return { 
      currentTags: tagObjects, 
      currentStrings: combinedString ? [{ display: truncatedString, original: combinedString }] : [] 
    };
  }, [searchQuery, tags]);

  const handleTagRemoval = (tagToRemove) => {
    if (!searchQuery) return;

    // Remove the specific tag from the search query
    const tagPattern = new RegExp(`#${tagToRemove.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'gi');
    let newQuery = searchQuery.replace(tagPattern, '').trim();
    
    // Clean up any extra spaces
    newQuery = newQuery.replace(/\s+/g, ' ').trim();

    setSearchQuery(newQuery);
    setSearchBarActive(true);
    handleSearch(newQuery);
  };

  const handleStringRemoval = () => {
    if (!searchQuery) return;

    // Keep only the tags by matching #word patterns
    const tagMatches = searchQuery.match(/#[^\s#]+/g) || [];
    let newQuery = tagMatches.join(' ').trim();

    setSearchQuery(newQuery);
    setSearchBarActive(true);
    handleSearch(newQuery);
  };

  // Don't show if we don't have multiple tags
  if (currentTags.length <= 1) {
    return null;
  }

  return (
    <div>
      <PillsContainer>
        {currentTags.map(tag => (
          <TagItem
            key={tag.id}
            theme={isDarkTheme ? 'dark' : 'light'}
            onClick={() => handleTagRemoval(tag)}
            title={`Remove tag: #${tag.name}`}
          >
            -&nbsp;&nbsp;#{truncateText(tag.name, 15)}
          </TagItem>
        ))}
        {currentStrings.map((stringObj, index) => (
          <TagItem
            key={`string-${index}`}
            theme={isDarkTheme ? 'dark' : 'light'}
            onClick={handleStringRemoval}
            title={`Remove search terms: ${stringObj.original}`}
          >
            -&nbsp;&nbsp;{stringObj.display}
          </TagItem>
        ))}
      </PillsContainer>
    </div>
  );
};

export default CurrentTags;
