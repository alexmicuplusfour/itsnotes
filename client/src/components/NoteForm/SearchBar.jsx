import React from 'react';
import Icon from '../Icons';
import {
  SearchBar as StyledSearchBar,
  SearchInput,
  ActionButton,
  SearchNavigation,
  NavButton,
  Spacer,
  HighlightedButton,
  CircleIconWrapper
} from './NoteForm.styles';

const SearchBar = ({
  isDarkTheme,
  searchInputRef,
  searchQuery,
  onSearchChange,
  onClearSearch,
  matchCount,
  currentMatch,
  onPrevMatch,
  onNextMatch,
  onCloseSearch,
  color
}) => {
  // Set color via CSS variable to avoid styled-components regenerating classes per color
  const colorStyle = color && color !== 'default'
    ? { '--search-bar-color': `var(--note-color-${color})` }
    : {};

  return (
    <StyledSearchBar theme={isDarkTheme ? "dark" : "light"} style={colorStyle}>
      <SearchInput
        ref={searchInputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search in note..."
      />
      {searchQuery && (
        <ActionButton
          type="button"
          onClick={onClearSearch}
          style={{
            flexShrink: "0",
          }}
          theme={isDarkTheme ? "dark" : "light"}
        >
          <Icon name="close" size={20} strokeWidth="3" />
        </ActionButton>
      )}
      <SearchNavigation>
        {matchCount > 0 && (
          <div
            style={{
              margin: "0 8px",
              fontSize: "14px",
              opacity: 0.9,
              paddingTop: "2px",
            }}
          >
            {/* Display current match index (adjusting for -1) */}
            {currentMatch + 1 > 0 ? `${currentMatch + 1}` : "0"}/
            {matchCount}
          </div>
        )}
        <NavButton
          onClick={onPrevMatch}
          disabled={matchCount === 0}
          type="button"
          theme={isDarkTheme ? "dark" : "light"}
        >
          <Icon name="sortNewest" size={20} strokeWidth="3" />
        </NavButton>
        <NavButton
          onClick={onNextMatch}
          disabled={matchCount === 0}
          type="button"
          theme={isDarkTheme ? "dark" : "light"}
        >
          <Icon name="sortOldest" size={20} strokeWidth="3" />
        </NavButton>{" "}
        <Spacer />
        <Spacer />
        <Spacer />
        <HighlightedButton
          onClick={onCloseSearch}
          type="button"
          title="Exit search"
          theme={isDarkTheme ? "dark" : "light"}
          style={{ marginLeft: "auto" }}
        >
          <CircleIconWrapper>
            <Icon
              name="close"
              size={18}
              strokeWidth="3"
              color={
                color && color !== "default"
                  ? `var(--note-color-${color})`
                  : "var(--note-bg-color)"
              }
            />
          </CircleIconWrapper>
        </HighlightedButton>
      </SearchNavigation>
    </StyledSearchBar>
  );
};

export default SearchBar;
