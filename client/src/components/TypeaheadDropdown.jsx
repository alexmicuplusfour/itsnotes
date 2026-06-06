import React, { useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useUIPreferences } from '../contexts/UIPreferencesContext';

const DropdownContainer = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: var(--dropdown-bg-color);
  box-shadow: 0 2px 8px var(--shadow-color);
  border-radius: 8px;
  max-height: 230px;
  width: calc(100% - 32px);
  max-width: calc(700px - 16px);
  top: calc(var(--nav-height) - 10px);
  left: 50%;
  transform: translateX(-50%);
  overflow-y: auto;
  z-index: 1000;
  margin-top: 4px;
  -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
  scroll-behavior: smooth; /* Smooth scrolling for all browsers */

  @media (max-width: 600px) {
    width: 100%;
    max-width: 100%;
    margin-top: 4px;
    border-top: none;
    border-radius: 16px;
    background: var(--typeahead-mobile-bg-color);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  }
`;

const SuggestionItem = styled.div`
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  color: var(--text-color);
  min-height: 24px; /* Make touch targets bigger */
  
  /* Add spacing between items for better touch targets */
  &:not(:last-child) {
    border-bottom: 1px solid var(--border-color);
  }
  
  &:hover, &.selected {
    background-color: var(--button-hover-color);
  }
  
  /* Make the active/hover state more visible */
  &:active {
    background-color: var(--button-active-color, var(--button-hover-color));
    opacity: 0.8;
  }
`;

const ColorCircle = styled.div`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-right: 10px;
  background-color: ${props => `var(--note-color-${props.$color})`};
  border: 1px solid var(--border-color);
`;

const AliasHint = styled.span`
  opacity: 0.5;
  margin-left: 6px;
  font-size: 0.9em;
`;

const NoResultsItem = styled.div`
  padding: 10px 16px;
  color: var(--text-secondary-color);
  font-style: italic;
`;

const TypeaheadDropdown = ({ 
  items, 
  type, 
  onSelect, 
  selectedIndex, 
  visible 
}) => {
  // Refs for the dropdown container and selected items
  const dropdownRef = useRef(null);
  const selectedItemRef = useRef(null);
  const itemRefs = useRef({});
  
  // Track touch start position to distinguish between scrolls and taps
  const touchStartRef = useRef({ x: 0, y: 0, itemIndex: -1 });

  // Get color label from context
  const { getColorLabel } = useUIPreferences();
  
  // Auto-scroll to keep the selected item in view
  useEffect(() => {
    if (!visible || !dropdownRef.current || selectedIndex === undefined) return;
    
    const selectedItem = itemRefs.current[selectedIndex];
    if (!selectedItem) return;
    
    const container = dropdownRef.current;
    const itemTop = selectedItem.offsetTop;
    const itemBottom = itemTop + selectedItem.offsetHeight;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.offsetHeight;
    
    // If the item is not fully visible, scroll to make it visible
    if (itemTop < containerTop) {
      // Item is above the visible area, scroll up
      container.scrollTop = itemTop - 4; // Small padding
    } else if (itemBottom > containerBottom) {
      // Item is below the visible area, scroll down
      container.scrollTop = itemBottom - container.offsetHeight + 4; // Small padding
    }
  }, [selectedIndex, visible]);
  
  const handleItemClick = useCallback((item, e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(item);
  }, [onSelect]);
  
  const handleTouchStart = useCallback((e, index) => {
    const touch = e.touches[0];
    touchStartRef.current = { 
      x: touch.clientX, 
      y: touch.clientY,
      itemIndex: index
    };
  }, []);
  
  const handleTouchEnd = useCallback((item, index, e) => {
    // Only process if this is the same item that received touchStart
    if (touchStartRef.current.itemIndex !== index) {
      return;
    }
    
    // Get touch end position
    const touchEndX = e.changedTouches[0]?.clientX || 0;
    const touchEndY = e.changedTouches[0]?.clientY || 0;
    
    // Calculate distance moved
    const distX = Math.abs(touchEndX - touchStartRef.current.x);
    const distY = Math.abs(touchEndY - touchStartRef.current.y);
    
    // If moved less than threshold in any direction, treat as a tap
    if (distX < 10 && distY < 10) {
      e.preventDefault();
      onSelect(item);
    }
    
    // Reset touch tracking
    touchStartRef.current = { x: 0, y: 0, itemIndex: -1 };
  }, [onSelect]);

  // Helper to extract color name from item (handles both string and object format)
  const getColorName = (item) => {
    return typeof item === 'object' && item.color ? item.color : item;
  };

  // Early return AFTER all hooks have been called
  if (!visible || items.length === 0) return null;

  return (
    <DropdownContainer ref={dropdownRef}>
      {items.map((item, index) => {
        const colorName = getColorName(item);
        const colorLabel = getColorLabel(colorName);
        const hasCustomLabel = colorLabel !== colorName;
        
        return (
          <SuggestionItem 
            key={index}
            ref={el => itemRefs.current[index] = el}
            onClick={(e) => handleItemClick(item, e)}
            onTouchStart={(e) => handleTouchStart(e, index)}
            onTouchEnd={(e) => handleTouchEnd(item, index, e)}
            className={`SuggestionItem ${index === selectedIndex ? 'selected' : ''}`}
            role="option"
              aria-selected={index === selectedIndex}
            >
              {type === 'color' && <ColorCircle $color={colorName} />}
              {type === 'tag' ? (
                <>
                  #{item.name}
                  {item._parentName && <AliasHint> ({item._parentName})</AliasHint>}
                </>
              ) : (
                <>
                  ${colorLabel}
                  {/* Show original name if custom label is set */}
                  {hasCustomLabel && <AliasHint> ({colorName})</AliasHint>}
                  {/* Show matched alias if searching by alias and no custom label */}
                  {!hasCustomLabel && item.matchedAlias && (
                    <AliasHint> ({item.matchedAlias})</AliasHint>
                  )}
                </>
              )}
            </SuggestionItem>
          );
        })}
    </DropdownContainer>
  );
};

export default TypeaheadDropdown;