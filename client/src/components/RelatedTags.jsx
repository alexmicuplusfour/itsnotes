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
    ? 'rgba(255, 255, 255, 0.09)'
    : 'rgba(0, 0, 0, 0.09)'};

  &:hover {
    opacity: 1;
    background-color: ${props => props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.15)'};
  }
`;

const MoreTagsMessage = styled.div`
  display: inline-flex;
  align-items: center;
  color: var(--text-color);
  text-align: center;
  opacity: 0.6;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 13px;
  white-space: nowrap;
  height: 28px;
  box-sizing: border-box;
  justify-content: center;
  
  @media (max-width: 768px) {
    font-size: 12px;
  }
`;

const RelatedTags = ({ searchQuery }) => {
  const { tags } = useTags();
  const { handleSearch, setSearchQuery, setSearchBarActive, searchResults, notes, searchMode } = useNotes();
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
  // Extract the current tag being searched (only for single tag searches)
  const currentTagName = useMemo(() => {
    // Only match single tag searches, similar to SubtagPills
    const tagSearchRegex = /^#((?:[^/]+)(?:\/[^/]+)*)$/;
    const match = searchQuery?.match(tagSearchRegex);
    return match ? match[1] : null;
  }, [searchQuery]);  // Calculate related tags from notes that have the current tag
  const relatedTags = useMemo(() => {
    if (!currentTagName || !Array.isArray(tags)) {
      return [];
    }

    // Check if SubtagPills would be showing - if so, don't show RelatedTags
    // This logic mirrors SubtagPills to determine if subtags exist
    const tagSearchRegex = /^#((?:[^/]+)(?:\/[^/]+)*)$/;
    const match = searchQuery?.match(tagSearchRegex);
    const originalCurrentTagName = match ? match[1] : null;
    
    if (originalCurrentTagName) {
      const lastSlashIndex = originalCurrentTagName.lastIndexOf('/');
      let parentTagPrefix = '';
      
      if (lastSlashIndex !== -1) {
        // It's a subtag search, get prefix up to and including the last slash
        parentTagPrefix = originalCurrentTagName.substring(0, lastSlashIndex + 1);
      } else {
        // It's a parent tag search, add the slash
        parentTagPrefix = `${originalCurrentTagName}/`;
      }
      
      const lowerCasePrefix = parentTagPrefix.toLowerCase();
      const hasSubtags = tags.some(tag => {
        const tagNameLower = tag.name.toLowerCase();
        return tagNameLower.startsWith(lowerCasePrefix);
      });
      
      // If there are subtags, don't show related tags to avoid overlap
      if (hasSubtags) {
        return [];
      }
    }

    // Get the current notes (search results if in search mode, otherwise main notes)
    const currentNotes = searchMode ? searchResults : notes;
    
    if (!currentNotes || currentNotes.length === 0) {
      return [];
    }
    
    // Find all notes that have the current tag
    const notesWithCurrentTag = currentNotes.filter(note => {
      const noteTags = note.tags || [];
      return noteTags.some(tag => 
        tag.name.toLowerCase() === currentTagName.toLowerCase()
      );
    });

    // If no notes have the current tag, return empty
    if (notesWithCurrentTag.length === 0) {
      return [];
    }

    // Collect all other tags from these notes and count their occurrences
    const relatedTagCounts = new Map();
    const currentTagLower = currentTagName.toLowerCase();
    
    notesWithCurrentTag.forEach(note => {
      const noteTags = note.tags || [];
      noteTags.forEach(tag => {
        // Skip the current tag itself
        if (tag.name.toLowerCase() !== currentTagLower) {
          const count = relatedTagCounts.get(tag.id) || 0;
          relatedTagCounts.set(tag.id, count + 1);
        }
      });
    });

    // Get the full tag objects for the related tag IDs and add count info
    const relatedTagObjects = tags
      .filter(tag => relatedTagCounts.has(tag.id))
      .map(tag => ({
        ...tag,
        count: relatedTagCounts.get(tag.id)
      }));
    
    // Sort by count (descending) then by name
    return relatedTagObjects.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
  }, [searchQuery, tags, currentTagName, searchResults, notes, searchMode]);

  const handleRelatedTagClick = (relatedTag) => {
    // Combine the current tag with the related tag
    const newQuery = `#${currentTagName} #${relatedTag.name}`;
    setSearchQuery(newQuery);
    setSearchBarActive(true);
    handleSearch(newQuery);
  };
  // Don't show if we don't have a current tag or no related tags
  if (!currentTagName || relatedTags.length === 0) {
    return null;
  }

  // Limit to 10 displayed tags
  const displayedTags = relatedTags.slice(0, 10);
  const remainingCount = relatedTags.length - displayedTags.length;

  return (
    <div>
      <PillsContainer>
        {displayedTags.map(tag => (
          <TagItem
            key={tag.id}
            theme={isDarkTheme ? 'dark' : 'light'}
            onClick={() => handleRelatedTagClick(tag)}
            title={`Add tag: #${tag.name} (${tag.count} note${tag.count !== 1 ? 's' : ''})`}
          >
            +&nbsp;&nbsp;{truncateText(tag.name, 15)}
          </TagItem>
        ))}
        {remainingCount > 0 && (
          <MoreTagsMessage>
            {remainingCount} other related tag{remainingCount !== 1 ? 's' : ''}
          </MoreTagsMessage>
        )}
      </PillsContainer>
    </div>
  );
};

export default RelatedTags;
