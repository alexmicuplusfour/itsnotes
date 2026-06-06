import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNotes } from '../contexts/NotesContext';
import Icon from './Icons';

const MonthNavigationPills = ({ searchQuery }) => {
  const { handleSearch, setSearchQuery, setSearchBarActive } = useNotes();
  const [isDarkTheme, setIsDarkTheme] = useState(() => 
    !document.documentElement.classList.contains('light-theme')
  );
  const [prevMonthSearch, setPrevMonthSearch] = useState(null);
  const [nextMonthSearch, setNextMonthSearch] = useState(null);
  const [currentMonthLabel, setCurrentMonthLabel] = useState(null);
  
  // Update theme state when the theme changes
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
  
  // Parse the search query and generate navigation pills if it's a month search
  useEffect(() => {
    // Check if the search query contains exactly one month search pattern (yr:YYYY:MMM)
    // This allows other search tokens to be present, but only one month token
    const monthSearchPattern = /yr:(\d{4}):(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/gi;
    const matches = searchQuery?.match(monthSearchPattern);

    // Only show navigation pills if there's exactly one month token
    if (matches && matches.length === 1) {
      // Extract year and month from the single match
      const singleMatchPattern = /yr:(\d{4}):(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
      const match = matches[0].match(singleMatchPattern);

    if (match) {
      const year = parseInt(match[1]);
      const monthShort = match[2].toLowerCase();
      
      // Map month short names to their index (0-11)
      const monthMap = {
        "jan": 0, "feb": 1, "mar": 2, "apr": 3, "may": 4, "jun": 5, 
        "jul": 6, "aug": 7, "sep": 8, "oct": 9, "nov": 10, "dec": 11
      };
      
      // Get the current month index from the search query
      const searchMonthIndex = monthMap[monthShort];
      
      // Get the current date for comparison
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11
      
      // Calculate previous month
      let prevMonthIndex = searchMonthIndex - 1;
      let prevYear = year;
      if (prevMonthIndex < 0) {
        prevMonthIndex = 11; // December
        prevYear = year - 1;
      }
      
      // Calculate next month
      let nextMonthIndex = searchMonthIndex + 1;
      let nextYear = year;
      if (nextMonthIndex > 11) {
        nextMonthIndex = 0; // January
        nextYear = year + 1;
      }
      
      // Month short names array
      const monthShortNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

      // Set current month label
      const monthLongNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      setCurrentMonthLabel(`${monthLongNames[searchMonthIndex]} ${year}`);

      // Preserve other search tokens by replacing only the month token
      const otherTokens = searchQuery.replace(matches[0], '').trim();

      // Set previous month search
      const prevMonthToken = `yr:${prevYear}:${monthShortNames[prevMonthIndex]}`;
      setPrevMonthSearch({
        query: otherTokens ? `${prevMonthToken} ${otherTokens}` : prevMonthToken,
        label: `${monthShortNames[prevMonthIndex].charAt(0).toUpperCase() + monthShortNames[prevMonthIndex].slice(1)} ${prevYear}`
      });

      // Only set next month search if it's not in the future
      const isNextMonthInFuture =
        (nextYear > currentYear) ||
        (nextYear === currentYear && nextMonthIndex > currentMonth);

      if (!isNextMonthInFuture) {
        const nextMonthToken = `yr:${nextYear}:${monthShortNames[nextMonthIndex]}`;
        setNextMonthSearch({
          query: otherTokens ? `${nextMonthToken} ${otherTokens}` : nextMonthToken,
          label: `${monthShortNames[nextMonthIndex].charAt(0).toUpperCase() + monthShortNames[nextMonthIndex].slice(1)} ${nextYear}`
        });
      } else {
        setNextMonthSearch(null);
      }
    }
    } else {
      // Reset if not exactly one month token in the search query
      setPrevMonthSearch(null);
      setNextMonthSearch(null);
      setCurrentMonthLabel(null);
    }
  }, [searchQuery]);
  
  // If no month navigation pills to show, return null
  if (!prevMonthSearch && !nextMonthSearch) {
    return null;
  }
  
  const handleSearchClick = (query) => {
    setSearchQuery(query);
    setSearchBarActive(true);
    handleSearch(query);
  };
  
  return (
    <PillsContainer>
      <PillsWrapper>
        {prevMonthSearch && (
          <NavigationPill
            theme={isDarkTheme ? 'dark' : 'light'}
            onClick={() => handleSearchClick(prevMonthSearch.query)}
          >
            <Icon name="arrow_left" size={16} />
            <PillLabel>{prevMonthSearch.label}</PillLabel>
          </NavigationPill>
        )}
        
        {currentMonthLabel && (
          <CurrentMonthLabel>{currentMonthLabel}</CurrentMonthLabel>
        )}

        {nextMonthSearch && (
          <NavigationPill
            theme={isDarkTheme ? 'dark' : 'light'}
            onClick={() => handleSearchClick(nextMonthSearch.query)}
          >
            <PillLabel>{nextMonthSearch.label}</PillLabel>
            <Icon name="arrow_right" size={16} />
          </NavigationPill>
        )}
      </PillsWrapper>
    </PillsContainer>
  );
};

const PillsContainer = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 8px;
  margin-top: 8px;
`;

const PillsWrapper = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  padding-left: 8px;
  justify-content: center;
  padding-left: 0;
`;

const NavigationPill = styled.div`
  display: inline-flex;
  align-items: center;
  background-color: ${props => props.theme === 'dark' 
    ? 'rgba(255, 255, 255, 0.12)' 
    : 'rgba(0, 0, 0, 0.12)'};
  color: var(--text-color);
  opacity: 0.8;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 13px;
  cursor: pointer;
  gap: 6px;
  
  @media (hover: hover) {
      &:hover {
        background-color: ${props => props.theme === 'dark' 
          ? 'rgba(255, 255, 255, 0.2)' 
          : 'rgba(0, 0, 0, 0.2)'};
      }
  }
`;

const CurrentMonthLabel = styled.span`
  font-size: 13px;
  color: var(--text-color);
  opacity: 0.5;
  white-space: nowrap;
  padding: 4px 6px;
`;

const PillLabel = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export default MonthNavigationPills;
