import React, { useState, useEffect, memo, useCallback, useRef, useMemo } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { useNoteActions } from '../contexts/NoteActionsContext'; // Use stable actions context
import { selectionModeRef } from '../contexts/NoteSelectionContext';
import { tagsApi, getServerUrl } from '../services/api';
import NoteTagPicker, { TagPicker } from './NoteTagPicker';
import { ColorPicker as SharedColorPicker } from './ColorPicker'; // Import the new ColorPicker
import Icon from './Icons';
import SavingIndicator from './SavingIndicator';
import ImageGallery from './ImageGallery';
import ProgressFlyout from './ProgressFlyout';
import CompactBookCard from './CompactBookCard';
import CompactImdbCard from './CompactImdbCard';
import env from '../../env.js';
import { loadNoteImages, deleteImage } from '../services/imageManager';


// Define highlight animation - simpler scale effect without glow
const highlightAnimation = keyframes`
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(0.95);
  }
  100% {
    transform: scale(1);
  }
`;

// New styled component for the selection checkbox
const SelectionCheckbox = styled.div`
  position: absolute;
  top: -6px; /* Position slightly outside the card */
  left: -6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: var(--note-bg-color);
  border: 2px solid var(--note-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10; /* Ensure it's above the card content */
  opacity: ${props => props.$visible ? 1 : 0};
  transform: ${props => props.$visible ? 'scale(1)' : 'scale(0.5)'};
  /* Add a class name for easier DOM targeting */
  &.selection-checkbox-class {} 
  /* Add a class name for easier DOM targeting */
  &.selection-checkbox-class {} 
  transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out;

  /* Style when selected */
  ${props => props.$isSelected && css`
    background-color: var(--foreground-color);
    border-color: var(--text-color);
    opacity: 1;
    transform: scale(1);
  `}

  /* Show checkbox for all cards when any note is selected (selection mode) */
  .selection-mode & {
    opacity: 1;
    transform: scale(1);
  }

  /* Checkmark icon */
  & > svg {
    color: var(--background-color); /* White checkmark */
    font-size: 16px;
    opacity: ${props => props.$isSelected ? 1 : 0};
    transition: opacity 0.1s ease-in-out;
  }
  &:hover {
    border: 2px solid var(--foreground-color);
  }      
  @media (max-width: 600px) {
    width: 24px;
    height: 24px; 
   }
`;


const Card = styled.div`
  /* Use CSS variable set via inline style to avoid regenerating classes per color */
  background-color: var(--card-bg-color, var(--note-bg-color));
  /* Only apply border to default color notes, unless it's a direct ID match */
  border: ${props => props.$isDirectIdMatch
    ? '3px solid var(--text-color)'
    : 'var(--card-border, 1px solid var(--note-border-color))'};
  border-radius: 10px;
  padding: 16px;
  padding-bottom: 8px;
  height: fit-content; /* Key for masonry layout: use fit-content instead of min-height */
  max-height: ${props => props.$hasImages ? '620px' : '460px'};
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s ease, transform 0.2s ease, opacity 0.3s ease;
  overflow: visible; /* Changed from hidden to visible to allow the color picker to show */
  cursor: pointer;
  color: var(--text-color);
  position: relative; /* Ensure proper positioning of absolute elements like the shimmer */
  align-self: start; /* Prevent stretching - important for masonry layout */
  line-height: 1.3;
  width: 100%; /* Ensure the card takes full column width */
  box-sizing: border-box; /* Include padding and border in element's width and height */
  
  /* Apply highlight animation when flagged as recently edited - with performance optimizations */
  animation: ${props => props.$justEdited ? css`${highlightAnimation} 0.3s ease-out` : 'none'};
  will-change: ${props => props.$justEdited ? 'transform' : 'auto'};
  contain: layout;
  
  /* Apply loading effect when tags or images are still loading */
  opacity: ${props => props.$isLoading ? '0.3' : '1'};

  /* Apply outline when selected */
  outline: ${props => props.$isSelected ? '3px solid var(--text-color)' : 'none'};
  outline-offset: ${props => props.$isSelected ? '-3px' : '0'}; /* Adjust offset if needed */

  @media (max-width: 600px) {
      padding: 12px;
      font-size: 0.9em;
      max-height: ${props => props.$hasImages ? '440px' : props.$hasTags ? '380px' :  '250px'};
      /* Use CSS variable for mobile background */
      background-color: var(--card-bg-color, var(--mobile-background-color));
      border: ${props => props.$isDirectIdMatch
        ? '3px solid var(--text-color)'
        : 'var(--card-border, 1px solid var(--mobile-note-border-color))'};
    }

  @media (hover: hover) {
      &:hover .selection-checkbox-class {
        box-shadow: 0 1px 5px var(--shadow-color);
      }
      .selection-mode &:hover .selection-checkbox-class {
        border: 2px solid var(--foreground-color);
      }
    }
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 500;
  margin-bottom: 8px;
  overflow-wrap: break-word;
  
  @media (max-width: 600px) {
    font-size: 16px;
    margin-bottom: 4px;
  }
  
  @media (max-width: 400px) {
    font-size: 15px;
    margin-bottom: 3px;
  }
`;

const ContentWrapper = styled.div`
  position: relative;
  /* flex-grow: 1; - removed to prevent stretching */
  margin-bottom: 10px;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 20px;
    /* Use CSS variable for gradient - avoids class regeneration */
    background: linear-gradient(transparent, var(--card-bg-color, var(--note-bg-color)));
    pointer-events: none;
  }

  @media (max-width: 600px) {
    margin-bottom: 10px;

    &::after {
      height: 30px;
      background: linear-gradient(transparent, var(--card-bg-color, var(--mobile-background-color)));
    }
  }
`;

const Content = styled.div`
  font-family: var(--note-body-font-family, 'Product Sans', Arial, sans-serif);
  font-size: var(--note-card-body-font-size, 15px);
  white-space: pre-wrap;
  overflow-wrap: break-word;
  overflow: hidden;
  padding-bottom: 4px;
  text-overflow: ellipsis;
  min-height: 30px;
  max-height: ${props => props.$layoutView === 'stacked' ? '100px' : '260px'};

  & > p:empty {
     height: 1em; 
  }

  p {
      margin: 0;
      padding: 0px 0;
  }

  /* --- CONSOLIDATED RESOURCE CARD STYLING --- */
  
  /* 1. Shared Layout & Base Logic */
  span.note-reference-link,
  div[data-type="attachment"],
  div[objecttype="book"],
  div[data-type="book-card"],
  div[data-type="movie-card"],
  div[objecttype="movie"],
  reminder-card {
      /* Define Icon Variables (Defaults) */
      --card-icon: none;
      --card-icon-light: none;

      font-size: 0px;
      background-color: var(--fill-subtle);
      width: calc(100% - 3px);
      height: 40px;
      border-radius: 8px;
      padding: 10px 12px;
      margin: 6px 0 16px 1px; /* Consolidated margins */
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: row;
      align-items: center;
      position: relative;
      overflow: visible;
      user-select: none;
      box-sizing: border-box;

      /* Icon Configuration */
      background-image: var(--card-icon);
      background-repeat: no-repeat;
      background-position: center;
      background-size: 24px;

      /* Global Light Mode Switch */
      .light-theme & {
        background-image: var(--card-icon-light);
      }
  }

  /* Note Reference Link */
  span.note-reference-link {
      --card-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10 9 9 9 8 9'/%3E%3C/svg%3E");
      --card-icon-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3Cline x1='16' y1='13' x2='8' y2='13'/%3E%3Cline x1='16' y1='17' x2='8' y2='17'/%3E%3Cpolyline points='10 9 9 9 8 9'/%3E%3C/svg%3E");
  }

  /* Attachment */
  div[data-type="attachment"] {
      --card-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'/%3E%3C/svg%3E");
      --card-icon-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'/%3E%3C/svg%3E");
  }

  /* Book Card */
  div[data-type="book-card"] {
      --card-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/%3E%3Cpath d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/%3E%3C/svg%3E");
      --card-icon-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/%3E%3Cpath d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/%3E%3C/svg%3E");
  }
  div[objecttype="book"] {
      --card-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/%3E%3Cpath d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/%3E%3C/svg%3E");
      --card-icon-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/%3E%3Cpath d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/%3E%3C/svg%3E");
  }
      
  /* Movie Card */
  div[data-type="movie-card"] {
      --card-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M23 7l-7 5 7 5V7z'/%3E%3Cpath d='M14 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'/%3E%3C/svg%3E");
      --card-icon-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M23 7l-7 5 7 5V7z'/%3E%3Cpath d='M14 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'/%3E%3C/svg%3E");
  }
  div[objecttype="movie"] {
      --card-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M23 7l-7 5 7 5V7z'/%3E%3Cpath d='M14 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'/%3E%3C/svg%3E");
      --card-icon-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M23 7l-7 5 7 5V7z'/%3E%3Cpath d='M14 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'/%3E%3C/svg%3E");
  }
  /* Reminder Card */
  reminder-card {
      --card-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'/%3E%3Cpath d='M13.73 21a2 2 0 0 1-3.46 0'/%3E%3C/svg%3E");
      --card-icon-light: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' opacity='0.35'%3E%3Cpath d='M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'/%3E%3Cpath d='M13.73 21a2 2 0 0 1-3.46 0'/%3E%3C/svg%3E");
  }

  /* Adjust placeholder styling to only affect truly empty first paragraph */
  p:first-child:empty::before {
      color: #9aa0a6;
      content: attr(data-placeholder);
      float: left;
      height: 0;
      pointer-events: none;
  }

  /* Hide placeholder if first paragraph is not empty OR if it's not the first paragraph */
  p:first-child:not(:empty)::before,
  p:not(:first-child)::before {
      display: none;
      content: none;
  }

  ul, ol {
    padding-left: 1.5rem;
  }
  a {
    color: var(--link);
    text-decoration: none;
    pointer-events: none;  
    &:hover {
      text-decoration: underline;
    }
  }

  blockquote {
    border-left: 3px solid var(--border-transparent);
    padding-left: 0.8rem;
    font-weight: 400;
    opacity: 0.8;
  }

  code {
    background-color: var(--border-transparent);
    border-radius: 3px;
    padding: 0.2rem 0.2rem;
    font-family: monospace;
    line-height: 1.6;
  }

  /* Object mentions (e.g., @High Maintenance) - truncate to ~16 characters */
  span[data-type="object-mention"] {
    display: inline-block;
    max-width: 20ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
  
  @media (max-width: 600px) {
    font-size: 15px;
    padding-bottom: 8px;
    min-height: 40px;
    max-height: ${props => props.$layoutView === 'stacked' ? '100px' : '200px'};
  }
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  width: calc(100% + 12px);
  margin-left: -6px; 
  transition: opacity 0.2s ease;
  color: inherit;
  position: relative; /* Added to ensure ColorPicker and TagPicker positioning works */
  
  padding-top: 8px;
  margin-top: auto;

  ${Card}:hover & {
    opacity: 1;
  }

  .selection-mode & {
    visibility: hidden;
  }
`;

const ActionBarPlaceholder = styled.div`
  height: 44px; /* The exact height the ActionBar occupies */
  width: 100%; /* Take full width */
  margin-top: auto; /* Push to the bottom of the flex container (Card) */
  flex-shrink: 0; /* Prevent shrinking if card content is large */
`; 

const ActionButton = styled.button`
  margin-left: 0px;
  background: none;
  border: none;
  border-radius: 50%;
  font-size: 16px;
  color: inherit; /* Use inherited color from parent */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;
  
  &:hover {
    background-color: ${props => props.theme === 'dark' 
      ? 'rgba(255, 255, 255, 0.1)' 
      : 'rgba(0, 0, 0, 0.1)'};
  }
  
  @media (max-width: 600px) {
    width: 32px;
    height: 32px;
    margin-left: 2px;
    font-size: 14px;
  }
`;

// Removed inline ColorPicker styled component

const BackButton = styled.button`
  background: none;
  border: none;
  margin-right: 8px;
  border-radius: 50%;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;
  
  &:hover {
    background-color: ${props => props.theme === 'dark' 
      ? 'rgba(255, 255, 255, 0.1)' 
      : 'rgba(0, 0, 0, 0.1)'};
  }
`;

// Removed inline ColorButton styled component

// Removed inline ColorCheckmark styled component

// Tag styling
const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow: clip;
  max-height: 268px;
  padding: 1px;
  > * {
    opacity: 0.85;
    transition: opacity 0.2s ease-in-out;
    
    &:hover {
      opacity: 1;
    }
  }
`;

const Tag = styled.div`
  display: inline-flex;
  align-items: center;
  outline: ${props => props.$isFolder ? 'none' : `1px solid ${props.theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.08)'}`};
  background-color: ${props => {
    if (props.$isFolder) {
      // Folders: dark background in light theme, white background in dark theme
      return props.theme === 'dark'
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(0, 0, 0, 0.8)';
    }
    return 'transparent';
  }};
  color: ${props => {
    if (props.$isFolder) {
      // Folders: light text in light theme (dark bg), dark text in dark theme (white bg)
      return props.theme === 'dark'
        ? 'rgba(0, 0, 0, 0.9)'
        : 'rgba(255, 255, 255, 0.95)';
    }
    return 'var(--text-color)';
  }};
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  max-width: 100px;
  white-space: nowrap;
  cursor: pointer;

  .selection-mode & {
    pointer-events: none;
    cursor: default;
  }

  @media (hover: hover) {
    &:hover {
      background-color: ${props => {
        if (props.$isFolder) {
          return props.theme === 'dark'
            ? 'rgba(255, 255, 255, 1)'
            : 'rgba(0, 0, 0, 0.9)';
        }
        return props.theme === 'dark'
          ? 'rgba(255, 255, 255, 0.1)'
          : 'rgba(0, 0, 0, 0.1)';
      }};
      outline: none;
    }
  }
`;

const TagText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
`;

const UrlLink = styled(Tag)`

`;

const BookReference = styled(Tag)`

`;

const NoteReference = styled(Tag)`

`;

const ObjectChip = styled(Tag)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
`;

const DonutChart = styled.svg`
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transform: rotate(-90deg);
  margin-left: -3px;
`;

const ObjectChipText = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ColorIndicator = styled.div`
  display: inline-flex;
  align-items: center;
  background-color: ${props => props.theme === 'dark' 
    ? 'rgba(255, 255, 255, 0.08)' 
    : 'rgba(0, 0, 0, 0.08)'};
  color: var(--text-color);
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  margin-right: 4px;
  cursor: pointer;
  
  &:hover {
    background-color: ${props => props.theme === 'dark' 
      ? 'rgba(255, 255, 255, 0.15)' 
      : 'rgba(0, 0, 0, 0.15)'};
  }
  
  & > span {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 4px;
    border-radius: 50%;
    /* Use CSS variable set via inline style */
    background-color: var(--color-dot-bg, var(--note-bg-color));
    border: 1px solid var(--note-border-color);
  }
`;

// Removed COLORS constant

// URL extraction function
const extractUrls = (text) => {
  if (!text) return [];
  
  // Regular expression to match URLs
  // Matches common URL patterns starting with http://, https://, or www.
  const urlRegex = /(https?:\/\/|www\.)[^\s/$.?#].[^\s]*/gi;
  
  // Extract URLs and return unique values
  const urls = text.match(urlRegex) || [];
  return [...new Set(urls)].map(url => {
    // Ensure URL has a protocol for the href attribute
    const href = url.startsWith('www.') ? `https://${url}` : url;
    
    // Get domain name for display
    let domain = url;
    try {
      // Parse the URL to extract the hostname
      if (url.startsWith('www.')) {
        domain = url; // Keep as is for display
      } else {
        const urlObj = new URL(href);
        domain = urlObj.hostname.replace(/^www\./, '');
      }
    } catch (e) {
      console.error('Error parsing URL:', e);
    }
    
    return { url: href, domain };
  });
};

// Book references extraction function - format {book title}
const extractBookReferences = (text) => {
  if (!text) return [];
  
  // Regular expression to match book references in {book title} format
  const bookRegex = /\{([^{}]+)\}/g;
  
  // Extract book references and return unique values
  const matches = text.match(bookRegex) || [];
  return [...new Set(matches)].map(match => {
    // Remove curly braces to get the title
    const title = match.substring(1, match.length - 1);
    return title;
  });
};

// Note references extraction function - UUID format
// Extract UUIDs from text, excluding those that are part of URLs
const extractNoteReferences = (text, urlsToExclude = []) => {
  if (!text) return [];

  // Get the string representations of the URLs to exclude
  const urlStrings = urlsToExclude.map(urlItem => urlItem.url);

  // UUID pattern - matches standard UUID format, optionally followed by #<digits>
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(#\d+)?\b/gi;

  const references = new Set();
  let match;
  uuidPattern.lastIndex = 0; // Reset lastIndex

  while ((match = uuidPattern.exec(text)) !== null) {
    const reference = match[0];

    // Check if this reference string is part of any URL to exclude
    const isInUrl = urlStrings.some(url => url.includes(reference));

    if (!isInUrl) {
      references.add(reference);
    }
  }

  return Array.from(references);
};
 
const NoteCard = memo(function NoteCard({ note, searchQuery, layoutView, onPickerOpen, isSelected, onToggleSelect }) {
  console.log('[NoteCard] Rendering note:', note.id);
  const [justEdited, setJustEdited] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [openProgressFlyout, setOpenProgressFlyout] = useState(null); // Track which object's flyout is open
  const [flyoutPosition, setFlyoutPosition] = useState({ top: 0, left: 0 });
  const [tempPage, setTempPage] = useState('');
  const flyoutRef = useRef(null);
  const chipRefs = useRef({});

  // Use tags directly from the note prop, default to empty array if not present
  const noteTags = useMemo(() => note?.tags || [], [note?.tags]);
  // Use images directly from the note prop, default to empty array if not present
  const images = useMemo(() => note?.images || [], [note?.images]);
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );
  //const isMobile = useState(() => window.innerWidth <= 768)[0];
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [isHovered, setIsHovered] = useState(false); // Hover state

  // Extract URLs from note content
  const noteUrls = useMemo(() => {
    // return extractUrls(note.content);    // ------DISABLED
    return [];  // <---- DISABLED                        
  }, [note.content]);
  
  // Extract book references from note content
  const bookReferences = useMemo(() => {
    //return extractBookReferences(note.content);   // ------DISABLED
    return [];  // <---- DISABLED                        
  }, [note.content]);
  
  // Extract note references from note content
  const noteReferences = useMemo(() => {
    // Pass noteUrls result to avoid recalculation
    //return extractNoteReferences(note.content, noteUrls);  // ------DISABLED
    return [];  // <---- DISABLED
  }, [note.content, noteUrls]);

  // Get objects from note prop (fetched from backend)
  const noteObjects = useMemo(() => note?.objects || [], [note?.objects]);

  // Ref for tracking timer to clear highlight effect
  const highlightTimerRef = useRef(null);
  const tagButtonRef = useRef(null);
  const tagPickerRef = useRef(null);
  const colorButtonRef = useRef(null); // Ref for the color palette button
  
  // Ref to keep note.id current for event listener (prevents stale closures)
  const noteIdRef = useRef(note.id);
  useEffect(() => { noteIdRef.current = note.id; }, [note.id]);
  
  // Use NoteActionsContext for stable action references (prevents re-renders when openedNote changes)
  const {
    togglePin,
    archiveNote,
    unarchiveNote,
    trashNote,
    restoreNote,
    deleteNote,
    changeNoteColor,
    updateNote,
    openNoteById,
    view,
    searchByTag,
    searchByColor,
    searchByBook,
    searchById,
    searchMode,
    openNote, // NEW: Stable wrapper for new navigation system
    openReferencedNote, // NEW: Stable wrapper for new navigation system
  } = useNoteActions();

  // Check if the current search query is a direct match for this note's ID
  const isDirectIdMatch = useMemo(() => {
    return searchQuery && searchQuery.startsWith('!') && searchQuery.substring(1) === note.id;
  }, [searchQuery, note.id]);
  
  // Update theme when it changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    // Handle window resize for mobile detection
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 600);
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      // Clear highlight timer when component unmounts
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Define a local function to handle the animation
  const triggerAnimation = useCallback(() => {
    // Clear any existing timer
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }

    // Add a small delay before starting the animation
    requestAnimationFrame(() => {
      // Set the highlight effect in the next animation frame
      setJustEdited(true);

      // Clear the highlight effect after animation completes
      highlightTimerRef.current = setTimeout(() => {
        setJustEdited(false);
      }, 300); // Same as animation duration to ensure no delay
    });
  }, []);

  // Listen for note-closed events to trigger bounce animation
  // This uses a custom event pattern to avoid context re-renders
  // Uses noteIdRef to prevent stale closure issues when note is open for a long time
  useEffect(() => {
    const handleNoteClosed = (e) => {
      if (e.detail?.noteId === noteIdRef.current) {
        triggerAnimation();
      }
    };
    window.addEventListener('note-closed', handleNoteClosed);
    return () => window.removeEventListener('note-closed', handleNoteClosed);
  }, [triggerAnimation]); // Only depends on triggerAnimation, uses ref for note.id

  // NOTE: useNavigate intentionally removed - navigateToNote from context uses ref pattern
  // to prevent NoteCard from re-rendering when URL changes

  const isNoteDeleted = useMemo(() => note?.is_deleted === true, [note]);
  const isNoteArchived = useMemo(() => note?.is_archived === true, [note]);

  // Updated click handler - MIGRATED to new navigation system
  const handleCardClick = useCallback((e) => {
    // Prevent click from propagating if clicking on interactive elements inside
    // Added check for the selection checkbox using its class name
    if (e.target.closest('a, button, .tag-button, .color-button, .palette-button, .selection-checkbox-class')) {
      return;
    }

    if (selectionModeRef.current) {
      // If in selection mode, toggle selection
      onToggleSelect(note.id);
    } else {
      // Otherwise, open the note
      if (note?.id && !note.id.toString().startsWith('temp-')) {
        console.log("Opening note:", note.id, "Search mode:", searchMode);

        // NEW: Use centralized navigation system
        openNote(note.id, 'card');

      } else if (note) {
        // For temporary notes, just open directly (no URL change)
        openNoteById(note.id);
      }
    }
  }, [note, openNoteById, onToggleSelect, searchMode, openNote]);
  
  const handleCloseEdit = useCallback(() => {
    triggerAnimation();
  }, [triggerAnimation]);
  
  const handleTagsModalClose = useCallback(() => {
    setShowTagsModal(false);
    onPickerOpen(null);
  }, [onPickerOpen]);
  
  const handleLongPress = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    setShowActions(true);
    /*if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }*/
    // *** Immediately select the note that was long-pressed ***
    onToggleSelect(note.id);
  }, [note?.id, onToggleSelect]);

  const handleColorSelect = useCallback(async (color) => {
    await changeNoteColor(note.id, color);
    setShowColorPicker(false); // Close picker after selection
  }, [note?.id, changeNoteColor]);

  const handleToggleColorPicker = useCallback((e) => {
    e.stopPropagation();
    setShowColorPicker(prev => !prev);
  }, []);

  const handleCloseColorPicker = useCallback(() => {
    setShowColorPicker(false);
  }, []);

  const handleTagsClick = useCallback((e) => {
    e.stopPropagation();
    const opening = !showTagsModal;
    setShowTagsModal(opening);
    onPickerOpen(opening ? note.id : null);
  }, [showTagsModal, note.id, onPickerOpen]);
  
  // Add handler for tag click to search by tag
  const handleTagClick = useCallback((e, tag) => {
    if (selectionModeRef.current) return;
    e.stopPropagation();
    searchByTag(tag.id, tag.name);
  }, [searchByTag]);
  
  // Add handler for color click to search by color
  const handleColorClick = useCallback((e, color) => {
    e.stopPropagation(); // Prevent triggering note selection
    if (color && color !== 'default') {
      searchByColor(color);
    }
  }, [searchByColor]);
  
  // Add handler for book click to search by book title with curly braces
  const handleBookClick = useCallback((e, bookTitle) => {
    e.stopPropagation(); // Prevent triggering note selection
    
    // Use the dedicated searchByBook function
    searchByBook(bookTitle);
  }, [searchByBook]);
  
  // Add handler for note reference click to open the referenced note
  const handleNoteReferenceClick = useCallback((e, noteRef) => { // Argument is the full reference string
    e.stopPropagation(); // Prevent triggering note selection or card click

    // --- START SCROLL MODIFICATION ---
    let targetNoteId = noteRef;
    let targetScrollTop = 0;

    if (noteRef.includes('#')) {
      const parts = noteRef.split('#');
      targetNoteId = parts[0];
      targetScrollTop = parseInt(parts[1], 10) || 0;
    }
    // --- END SCROLL MODIFICATION ---

    console.log(`Opening referenced note from NoteCard: ID=${targetNoteId}, Scroll=${targetScrollTop}`);

    // NEW: Use centralized navigation system for reference links
    // This automatically handles scroll position saving and circular reference prevention
    openReferencedNote(targetNoteId, targetScrollTop);

  }, [openReferencedNote]);

  // Memoize mouse enter/leave handlers
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  // Handle image removal
  const handleRemoveImage = useCallback(async (imageId) => {
    if (!note?.id) return;
    
    try {
      console.log(`Deleting image ${imageId}`);
      
      // Get token directly from localStorage like the axios interceptor does
      const authToken = localStorage.getItem('authToken');
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      // Use direct fetch call
      const response = await fetch(`${env.SERVER_BASE_URL}/api/images/${imageId}`, {
        method: 'DELETE',
        headers: headers
      });
      
      if (!response.ok) {
        console.error(`Error deleting image: ${response.status}`);
        return;
      }
      
      console.log('Image deleted successfully');
      
      // No need to update local state - the socket will handle updating the note data
      // The NotesContext will receive the 'note_image_deleted' event and update the note
    } catch (error) {
      console.error('Error removing image:', error);
    }
  }, [note?.id]);

  // Handle progress flyout
  const handleObjectChipClick = useCallback((e, obj) => {
    e.stopPropagation();
    if (obj.type === 'book') {
      if (openProgressFlyout === obj.id) {
        setOpenProgressFlyout(null);
      } else {
        // Calculate position based on chip location
        const chipElement = chipRefs.current[obj.id];
        if (chipElement) {
          const rect = chipElement.getBoundingClientRect();
          // Position above the chip (estimate flyout height ~120px)
          const flyoutHeight = 120;
          setFlyoutPosition({
            top: rect.top - flyoutHeight + 6,
            left: rect.left
          });
        }
        setOpenProgressFlyout(obj.id);
        setTempPage(obj.metadata?.user?.progress?.current_page || '');
      }
    } else if (obj.source_url) {
      window.open(obj.source_url, '_blank');
    }
  }, [openProgressFlyout]);


  // Close flyout when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if click is outside both the flyout and the chip
      const isClickOnChip = openProgressFlyout && chipRefs.current[openProgressFlyout]?.contains(e.target);
      const isClickOnFlyout = flyoutRef.current?.contains(e.target);

      if (!isClickOnChip && !isClickOnFlyout) {
        setOpenProgressFlyout(null);
      }
    };

    if (openProgressFlyout) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openProgressFlyout]);

  // Filter hidden tags
  const visibleTags = useMemo(() => {
    return noteTags.filter(tag => tag.visible !== false);
  }, [noteTags]);

  // Check if the note has any hidden tags that would affect display
  const hasHiddenTags = useMemo(() => {
    return noteTags.some(tag => tag.visible === false);
  }, [noteTags]);

  // Compute inline style for color CSS variables - avoids styled-components class regeneration
  const cardColorStyle = useMemo(() => {
    const color = note.color || 'default';
    if (color && color !== 'default') {
      return {
        '--card-bg-color': `var(--note-color-${color})`,
        '--card-border': 'none',
        '--color-dot-bg': `var(--note-color-${color})`
      };
    }
    return {};
  }, [note.color]);

  return (
    <>
      <Card
        style={cardColorStyle}
        $isPinned={note.is_pinned}
        $hasImages={images.length > 0}
        $hasTags={visibleTags.length > 0} // Use visibleTags for layout check
        $justEdited={justEdited}
        $isSelected={isSelected}
        $isDirectIdMatch={isDirectIdMatch}
        onClick={handleCardClick} // Use updated click handler
        onMouseEnter={handleMouseEnter} // Use memoized handler
        onMouseLeave={handleMouseLeave} // Use memoized handler
        onContextMenu={handleLongPress}
        className={showActions && !isMobile ? 'active' : ''}
      >
        {/* Selection Checkbox */}
        <SelectionCheckbox
          className="selection-checkbox-class" // Add class name
          $visible={(isHovered && !isMobile) || isSelected}
          $isSelected={isSelected}
          onClick={(e) => {
            e.stopPropagation(); // Prevent card click when clicking checkbox
            onToggleSelect(note.id);
          }}
        >
          {isSelected && <Icon name="check" size={16} strokeWidth="3"/>}
        </SelectionCheckbox>

        {/* Compact Object Card Preview */}
        {noteObjects.length > 0 && noteObjects[0].type === 'book' && (
          <CompactBookCard book={noteObjects[0]} />
        )}
        {noteObjects.length > 0 && (noteObjects[0].type === 'movie' || noteObjects[0].type === 'show') && (
          <CompactImdbCard item={noteObjects[0]} />
        )}

        {note.title && <Title>{note.title}</Title>}
        {note.content && (
          <ContentWrapper $layoutView={layoutView}>
            <Content dangerouslySetInnerHTML={{ __html: note.content }} />
          </ContentWrapper>
        )}
        
        {/* Display images if any */}
        {images.length > 0 && (
          <div>
            <ImageGallery 
              images={images} 
              onRemoveImage={handleRemoveImage} 
              noteColor={note.color || 'default'}
            />
          </div>
        )}
        
        {/* Display tags, URLs, book references, note references, and objects if any */}
        {(noteTags.length > 0 || noteUrls.length > 0 || bookReferences.length > 0 || noteReferences.length > 0 || noteObjects.length > 0) && (
          <TagsContainer style={{
            marginTop: images.length > 0 ?
              (isMobile ? '2px' : '4px') : '0'
          }}>
        {/* Display object chips */}
        {noteObjects.map((obj) => {
          const isBook = obj.type === 'book';
          const progress = obj.metadata?.user?.progress;
          const percent = progress?.percent || 0;
          const status = obj.metadata?.user?.status;
          const isFinished = status === 'finished';

          // Render donut chart for books
          const renderDonut = () => {
            if (!isBook) return null;

            const radius = 6;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (percent / 100) * circumference;

            return (
              <DonutChart viewBox="0 0 16 16">
                {/* Background circle */}
                <circle
                  cx="8"
                  cy="8"
                  r={radius}
                  fill="none"
                  stroke={isDarkTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}
                  strokeWidth="2"
                />
                {isFinished ? (
                  <>
                    {/* Filled circle for finished books (14x14) */}
                    <circle
                      cx="8"
                      cy="8"
                      r="7"
                      fill="var(--text-color)"
                    />
                    {/* Checkmark - counter-rotate to account for parent rotation */}
                    <g transform="rotate(90 8 8)">
                      <path
                        d="M 5.5 8 L 7 9.5 L 10.5 6"
                        fill="none"
                        stroke="var(--text-color-contrast)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  </>
                ) : (
                  /* Progress circle for in-progress books */
                  <circle
                    cx="8"
                    cy="8"
                    r={radius}
                    fill="none"
                    stroke="var(--link, #8ab4f8)"
                    strokeWidth="2"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                )}
              </DonutChart>
            );
          };

          const isFlyoutOpen = openProgressFlyout === obj.id;

          return (
            <React.Fragment key={`object-${obj.id}`}>
              <ObjectChip
                ref={(el) => chipRefs.current[obj.id] = el}
                theme={isDarkTheme ? 'dark' : 'light'}
                title={obj.title}
                onClick={(e) => handleObjectChipClick(e, obj)}
              >
                {isBook && renderDonut()}
                {!isBook && <Icon name={(obj.type === 'movie' || obj.type === 'show') ? 'video' : 'link'} size={14} />}
                <ObjectChipText>
                  {obj.title.length > 24 ? `${obj.title.substring(0, 24)}...` : obj.title}
                </ObjectChipText>
              </ObjectChip>

              {isFlyoutOpen && isBook && (
                <ProgressFlyout
                  ref={flyoutRef}
                  object={obj}
                  position={flyoutPosition}
                  chipElement={chipRefs.current[obj.id]}
                  onClose={() => setOpenProgressFlyout(null)}
                  tempPage={tempPage}
                  setTempPage={setTempPage}
                  noteId={note.id}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Display note references */}
        {noteReferences.map((noteRef, index) => ( // noteRef can be UUID or UUID#scroll
          <NoteReference
            key={`note-ref-${index}`}
            theme={isDarkTheme ? 'dark' : 'light'}
            title={`Open referenced note ${noteRef}`}
            onClick={(e) => handleNoteReferenceClick(e, noteRef)} // Pass the full noteRef
          >
            <Icon name="notes" size={16} />
            {/* Display only the UUID part (first 8 chars) */}
            <span>{noteRef.split('#')[0].substring(0, 8)}...</span>
          </NoteReference>
        ))}
            
            {/* Display book references */}
            {bookReferences.map((title, index) => (
              <BookReference 
                key={`book-${index}`}
                theme={isDarkTheme ? 'dark' : 'light'}
                title={`Search for {${title}}`}
                onClick={(e) => handleBookClick(e, title)}
              >
                <Icon name="book" size={16} />
                <span>{title.length > 18 ? `${title.substring(0, 18)}...` : title}</span>
              </BookReference>
            ))}
            
            {/* Display URLs */}
            {noteUrls.map((urlItem, index) => (
              <UrlLink 
                key={`url-${index}`}
                href={urlItem.url}
                target="_blank"
                rel="noopener noreferrer"
                theme={isDarkTheme ? 'dark' : 'light'}
                title={`Open ${urlItem.url}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Icon name="link" size={16} />
                <span>{urlItem.domain}</span>
              </UrlLink>
            ))}
            
            {/* Display all tags, sorted with folders first */}
            {[...noteTags]
              .sort((a, b) => {
                // Convert to boolean to handle undefined
                const aIsFolder = !!a.is_folder;
                const bIsFolder = !!b.is_folder;
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return a.name.localeCompare(b.name);
              })
              .map(tag => (
                <Tag
                  key={tag.id}
                  theme={isDarkTheme ? 'dark' : 'light'}
                  $isFolder={tag.is_folder}
                  title={`${tag.name}${tag.is_folder ? ' (folder)' : ''}`}
                  onClick={(e) => handleTagClick(e, tag)}
                  name={tag.name}
                >
                  {tag.visible === false && <Icon name="eye-slash" size={10} style={{ marginRight: 4, flexShrink: 0, opacity: 0.6 }} />}
                  {tag.is_folder && <Icon name="folder" size={11} style={{ marginRight: 4, flexShrink: 0 }} />}
                  <TagText>{tag.name.length > 12 ? `${tag.name.substring(0, 12)}...` : tag.name}</TagText>
                </Tag>
              ))}
          </TagsContainer>
        )}
        
        {/* Conditionally render ActionBar on non-mobile: show on hover OR if a picker/modal is open */}
      {/* Conditionally render ActionBar or Placeholder on non-mobile */}
      { !isMobile && (
          (isHovered || showColorPicker || showTagsModal) ? (
            // Render the actual ActionBar when hovered or pickers are open
            <ActionBar
              onClick={(e) => e.stopPropagation()}
            >
              <>
                <ActionButton
                  ref={colorButtonRef}
                  className="palette-button"
                  title="Change color"
                  onClick={handleToggleColorPicker}
                  theme={isDarkTheme ? 'dark' : 'light'}
                >
                  <Icon name="palette" size={18} />
                </ActionButton>
                <ActionButton
                  ref={tagButtonRef}
                  className="tag-button"
                  title="Add tags"
                  onClick={handleTagsClick}
                  theme={isDarkTheme ? 'dark' : 'light'}
                >
                  <Icon name="tag" size={18} />
                </ActionButton>

                {/* ... rest of the ActionButtons based on view ... */}
                {!isNoteArchived && !isNoteDeleted && (
                  <ActionButton
                    title="Archive"
                    onClick={() => archiveNote(note.id)}
                    theme={isDarkTheme ? 'dark' : 'light'}
                  >
                    <Icon name="archive" size={18} />
                  </ActionButton>
                )}
                {isNoteArchived && (
                  <ActionButton
                    title="Unarchive"
                    onClick={() => unarchiveNote(note.id)}
                    theme={isDarkTheme ? 'dark' : 'light'}
                  >
                    <Icon name="unarchive" size={18} />
                  </ActionButton>
                )}
                <ActionButton
                  title={note.is_pinned ? "Unpin" : "Pin"}
                  onClick={() => togglePin(note.id)}
                  theme={isDarkTheme ? 'dark' : 'light'}
                >
                  <Icon name={note.is_pinned ? "pinned" : "pin"} size={18} />
                </ActionButton>
                {(view === 'main' || view === 'archive') && (
                  <ActionButton
                    title="Move to trash"
                    onClick={() => trashNote(note.id)}
                    theme={isDarkTheme ? 'dark' : 'light'}
                  >
                    <Icon name="trash" size={18} />
                  </ActionButton>
                )}
                {view === 'trash' && (
                  <>
                    <ActionButton
                      title="Restore"
                      onClick={() => restoreNote(note.id)}
                      theme={isDarkTheme ? 'dark' : 'light'}
                    >
                      <Icon name="restore" size={18} />
                    </ActionButton>
                    <ActionButton
                      title="Delete permanently"
                      onClick={() => deleteNote(note.id)}
                      theme={isDarkTheme ? 'dark' : 'light'}
                    >
                      <Icon name="deleteForever" size={18} />
                    </ActionButton>
                  </>
                )}
              </>
            </ActionBar>
          ) : (
            // Render the Placeholder when not hovered and pickers are closed
            <ActionBarPlaceholder />
          )
      )}
      </Card>

      {/* Render SharedColorPicker using Portal - Removed targetRef.current check */}
      {showColorPicker && (
        <SharedColorPicker
          currentColor={note.color || 'default'}
          onColorSelect={handleColorSelect}
          onClose={handleCloseColorPicker}
          targetRef={colorButtonRef}
          position="top-left"
        />
      )}

      {/* Render TagPicker outside the Card if showTagsModal is true */}
      {showTagsModal && note && note.id && tagButtonRef.current && (
         <TagPicker
            noteId={note.id}
            onClose={handleTagsModalClose} // Use existing close handler
            triggerRef={tagButtonRef} // Pass the ref
            forwardedRef={tagPickerRef}
            forceAutoApply={true}
         />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function that only checks essential properties
  
  // Different note ID means it's a completely different note
  if (prevProps.note.id !== nextProps.note.id) return false;
  
  // Check selection state and search query state
  if (prevProps.searchQuery !== nextProps.searchQuery) return false;
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  
  // Core visual properties that affect rendering
  if (prevProps.note.title !== nextProps.note.title) return false;
  if (prevProps.note.color !== nextProps.note.color) return false;
  if (prevProps.note.is_pinned !== nextProps.note.is_pinned) return false;
  
  // Check update timestamp as a proxy for content changes
  if (prevProps.note.updated_at !== nextProps.note.updated_at) return false;

  // Check for image updates
  const prevImagesLength = (prevProps.note.images?.length || 0);
  const nextImagesLength = (nextProps.note.images?.length || 0);
  if (prevImagesLength !== nextImagesLength) return false;
  
  // Check for tag updates - just compare length for efficiency
  const prevTagsLength = (prevProps.note.tags?.length || 0);
  const nextTagsLength = (nextProps.note.tags?.length || 0);
  if (prevTagsLength !== nextTagsLength) return false;

  // Check for object updates - compare the objects array
  const prevObjects = prevProps.note.objects || [];
  const nextObjects = nextProps.note.objects || [];
  if (prevObjects.length !== nextObjects.length) return false;
  // Check if any object has changed (by reference or by updated_at)
  for (let i = 0; i < prevObjects.length; i++) {
    if (prevObjects[i] !== nextObjects[i]) {
      // Object reference changed, or check metadata changes
      const prevMetadata = JSON.stringify(prevObjects[i]?.metadata);
      const nextMetadata = JSON.stringify(nextObjects[i]?.metadata);
      if (prevMetadata !== nextMetadata) return false;
    }
  }

  // For large content, only check length to avoid expensive comparison
  const prevContent = prevProps.note.content || '';
  const nextContent = nextProps.note.content || '';
  if (prevContent.length !== nextContent.length) return false;

  // Consider equal if we got here (skip comparing other properties)
  return true;
});
NoteCard.displayName = 'NoteCard';

export default NoteCard;
