import React from 'react';
import styled from 'styled-components';
import Icon from './Icons';
import { useToast } from '../contexts/ToastContext';
import { useUIPreferences } from '../contexts/UIPreferencesContext';

const SaveSearchIcon = styled(Icon)`
  margin-left: 8px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s ease-in-out;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    opacity: 1;
  }
`;

const MonthSearchStar = ({ year, monthShort, monthLabel, size = 16, className }) => {
  const { saveSearch, savedSearches } = useUIPreferences();
  const { showToast } = useToast();

  const handleSaveMonthSearch = (e) => {
    e.stopPropagation();
    const searchQuery = `yr:${year}:${monthShort}`;
    saveSearch(searchQuery);
    showToast('Saved Search created', { duration: 'short' });
    console.log(`Saved search for ${monthLabel}: ${searchQuery}`);
  };

  // Check if this search has been saved
  const searchQuery = `yr:${year}:${monthShort}`;
  const isAlreadySaved = savedSearches.includes(searchQuery);

  // Only show the star if this search hasn't been saved yet
  if (isAlreadySaved) return null;

  return (
    <SaveSearchIcon
      name="star-outline"
      size={size}
      onClick={handleSaveMonthSearch}
      title={`Save search for ${monthLabel}`}
      className={className}
    />
  );
};

export default MonthSearchStar;
