import React, { useState, useEffect, useMemo } from 'react';
import styled, { css } from 'styled-components';
import Icon from './Icons'; // Import Icon component
import { useUIPreferences } from '../contexts/UIPreferencesContext';

// Define the same colors as in NoteForm.jsx and QuickAccess.jsx
const COLORS = [
  'default', 'coral', 'peach', 'sand', 'mint', 'sage',
  'fog', 'storm', 'dusk', 'blossom', 'clay', 'chalk'
];

// Reusable component to display color selection circles
const ColorSelectorPills = ({ searchByColor, searchQuery }) => {
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );
  const { getColorLabel } = useUIPreferences();

  // Extract the current search color from the query
  const currentSearchColor = useMemo(() => {
    const colorSearchPattern = /^\$([a-z]+)$/i;
    const match = searchQuery?.match(colorSearchPattern);
    return match ? match[1].toLowerCase() : null;
  }, [searchQuery]);

  // Update theme state when the theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Handler for clicking a color circle
  const handleColorClick = (color) => {
    if (searchByColor) {
      searchByColor(color);
    } else {
      console.warn("searchByColor function not provided to ColorSelectorPills");
    }
  };

  return (
    <PillsContainer>
      <PillsWrapper>
        {/* Render color circles, excluding 'default' */}
        {COLORS.filter(color => color !== 'default').map(color => (
          <ColorCircle
            key={`color-selector-${color}`}
            $color={color}
            theme={isDarkTheme ? 'dark' : 'light'}
            onClick={() => handleColorClick(color)}
            title={`Search color: ${getColorLabel(color)}`}
            className={color === currentSearchColor ? 'selected' : ''} // Add class if selected
          >
            {/* Render checkmark if this color is the current search */}
            {color === currentSearchColor && (
              <Icon name="check" size={16} color="var(--text-color)" strokeWidth="3"/>
            )}
          </ColorCircle>
        ))}
      </PillsWrapper>
    </PillsContainer>
  );
};

// Styled components (similar to QuickAccess and MonthNavigationPills for consistency)
const PillsContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 8px;
  margin-top: 8px; /* Consistent margin */
  margin-bottom: 8px; /* Add some bottom margin */
`;

const PillsWrapper = styled.div`
  display: flex;
  width: fit-content; /* 1. Shrinks the wrapper to exactly fit the contents */
  margin-inline: auto; /* 2. Centers the wrapper horizontally in the container */
  
  flex-wrap: wrap; 
  gap: 8px;
  margin-bottom: 12px; 
  padding: 8px;
  justify-content: center; 
  background-color: var(--container-light);
  border-radius: 50vh;

  @media (max-width: 768px) {
    gap: 6px; 
  }
`;

// Copied from QuickAccess.jsx and modified
const ColorCircle = styled.span`
  display: inline-flex; /* Use flex to center icon */
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: var(--note-color-${props => props.$color}); /* Apply base background color */
  outline: 1px solid var(--border-transparent);
  outline-offset: -1px; /* Default outline */
  cursor: pointer;
  position: relative; /* Needed for potential absolute positioning of icon if required */

  /* Define checkmark color based on theme */
  --checkmark-color: ${props => props.theme === 'dark' ? '#000' : '#fff'};

  &:hover:not(.selected) { /* Don't apply hover outline if selected */
    outline: 2px solid var(--text-color);
  }

  /* Style for the selected circle */
  &.selected {
    outline: 2px solid var(--text-color);
  }

  /* Style for the checkmark icon */
  svg {
    color: var(--checkmark-color);
    pointer-events: none; /* Ensure icon doesn't interfere with click */
  }
`;

export default ColorSelectorPills;
