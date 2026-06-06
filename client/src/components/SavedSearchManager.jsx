import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import Icon from './Icons';
import SuccessToast from './SuccessToast';
import { useUIPreferences } from '../contexts/UIPreferencesContext';

const SaveSearchButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-color);
  transition: opacity 0.3s ease;
  opacity: ${props => props.$visible ? (props.$saving ? '0.4' : '1') : '0'};
  pointer-events: ${props => props.$visible ? 'auto' : 'none'};
  display: ${props => props.$visible ? 'flex' : 'none'};
  padding: 4px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const SavedSearchManager = ({ 
  searchInput, 
  isSearchActive,
  className 
}) => {
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const { saveSearch, savedSearches } = useUIPreferences();

  const handleSaveSearch = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const trimmedInput = searchInput?.trim();
    if (!trimmedInput) return;

    // Check if search is already saved
    if (savedSearches.includes(trimmedInput)) {
      return;
    }    try {
      setIsSavingSearch(true);

      // Save the search
      saveSearch(trimmedInput);
      
      // Show success toast
      setShowSaveSuccess(true);

      // Reset the saving state after animation completes
      setTimeout(() => {
        setIsSavingSearch(false);
      }, 500);

    } catch (error) {
      console.error('Error saving search:', error);
      setIsSavingSearch(false);
    }
  };

  const isVisible = searchInput?.trim().length > 0 && 
                   isSearchActive && 
                   !savedSearches.includes(searchInput?.trim());
  return (
    <>
      <SaveSearchButton
        type="button"
        className={className}
        $visible={isVisible}
        $saving={isSavingSearch}
        onClick={handleSaveSearch}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        title="Save this search"
      >
        <Icon name="star-outline" size={22} />
      </SaveSearchButton>

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

export default SavedSearchManager;
