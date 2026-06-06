import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import Icon from './Icons';
import SuccessToast from './SuccessToast';
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
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const handleSaveMonthSearch = (e) => {
    e.stopPropagation();
    const searchQuery = `yr:${year}:${monthShort}`;
    saveSearch(searchQuery);
    setShowSaveSuccess(true);
    console.log(`Saved search for ${monthLabel}: ${searchQuery}`);
  };

  // Check if this search has been saved
  const searchQuery = `yr:${year}:${monthShort}`;
  const isAlreadySaved = savedSearches.includes(searchQuery);

  return (
    <>
      {/* Only show the star if this search hasn't been saved yet */}
      {!isAlreadySaved && (
        <SaveSearchIcon 
          name="star-outline" 
          size={size}
          onClick={handleSaveMonthSearch}
          title={`Save search for ${monthLabel}`}
          className={className}
        />
      )}

      {/* Render toast in a portal to avoid z-index issues */}
      {showSaveSuccess && ReactDOM.createPortal(
        <SuccessToast
          message="Saved Search created"
          isVisible={showSaveSuccess}
          onHide={() => setShowSaveSuccess(false)}
          duration={2000}
        />,
        document.body
      )}
    </>
  );
};

export default MonthSearchStar;
