import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import { useTags } from '../contexts/TagsContext';
import Icon from './Icons';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`;

const InputWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  background-color: var(--input-bg-color, transparent);
  color: var(--text-color);
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: var(--primary-color, #fbbc04);
  }
  
  &::placeholder {
    color: var(--text-secondary-color);
  }
`;

const Dropdown = styled.div`
  position: fixed;
  max-height: 200px;
  overflow-y: auto;
  background-color: var(--note-bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 10001;
`;

const DropdownItem = styled.div`
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-color);
  
  &:hover {
    background-color: var(--button-bg);
  }
  
  ${props => props.$highlighted && `
    background-color: var(--button-bg);
  `}
`;

const NoResults = styled.div`
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text-secondary-color);
  font-style: italic;
`;

const SelectedTagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: ${props => props.$hasItems ? '32px' : '0'};
`;

const SelectedTag = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background-color: var(--tag-bg-color, var(--button-bg));
  border-radius: 20px;
  font-size: 13px;
  color: var(--text-color);
`;

const RemoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  margin-left: 2px;
  cursor: pointer;
  color: var(--text-secondary-color);
  
  &:hover {
    color: var(--text-color);
  }
`;

/**
 * TagMultiSelect - A multi-select input for selecting multiple tags
 * @param {string[]} selectedTagIds - Array of currently selected tag IDs
 * @param {function} onChange - Callback when selection changes: (tagIds: string[]) => void
 * @param {string} placeholder - Placeholder text for the input
 */
const TagMultiSelect = ({ selectedTagIds = [], onChange, placeholder = "Type to search tags..." }) => {
  const { tags } = useTags();
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const dropdownRef = useRef(null);

  // Filter tags based on input and exclude already selected
  const filteredTags = tags.filter(tag => {
    const matchesSearch = tag.name.toLowerCase().includes(inputValue.toLowerCase());
    const notSelected = !selectedTagIds.includes(tag.id);
    return matchesSearch && notSelected;
  });

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedInContainer = containerRef.current && containerRef.current.contains(e.target);
      const clickedInDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!clickedInContainer && !clickedInDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlighted index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredTags.length, inputValue]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleSelectTag = useCallback((tag) => {
    onChange([...selectedTagIds, tag.id]);
    setInputValue('');
    setIsOpen(false);
  }, [selectedTagIds, onChange]);

  const handleRemoveTag = useCallback((tagId) => {
    onChange(selectedTagIds.filter(id => id !== tagId));
  }, [selectedTagIds, onChange]);

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredTags.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredTags[highlightedIndex]) {
          handleSelectTag(filteredTags[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'Backspace':
        if (inputValue === '' && selectedTagIds.length > 0) {
          handleRemoveTag(selectedTagIds[selectedTagIds.length - 1]);
        }
        break;
      default:
        break;
    }
  };

  // Get tag name from ID
  const getTagName = (tagId) => {
    const tag = tags.find(t => t.id === tagId);
    return tag?.name || tagId;
  };

  return (
    <Container ref={containerRef}>
      <InputWrapper>
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
        />
        
        {isOpen && ReactDOM.createPortal(
          <Dropdown 
            ref={dropdownRef}
            style={{ top: dropdownPosition.top, left: dropdownPosition.left, width: dropdownPosition.width }}
          >
            {filteredTags.length > 0 ? (
              filteredTags.map((tag, index) => (
                <DropdownItem
                  key={tag.id}
                  $highlighted={index === highlightedIndex}
                  onClick={() => handleSelectTag(tag)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {tag.name}
                </DropdownItem>
              ))
            ) : (
              <NoResults>
                {inputValue ? 'No matching tags' : 'No more tags available'}
              </NoResults>
            )}
          </Dropdown>,
          document.body
        )}
      </InputWrapper>

      {selectedTagIds.length > 0 && (
        <SelectedTagsContainer $hasItems={true}>
          {selectedTagIds.map(tagId => (
            <SelectedTag key={tagId}>
              {getTagName(tagId)}
              <RemoveButton 
                onClick={() => handleRemoveTag(tagId)}
                type="button"
                aria-label="Remove tag"
              >
                <Icon name="close" size={16} strokeWidth="3"/>
              </RemoveButton>
            </SelectedTag>
          ))}
        </SelectedTagsContainer>
      )}
    </Container>
  );
};

export default TagMultiSelect;
