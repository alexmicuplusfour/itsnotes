import { useEffect } from 'react';
import styled from 'styled-components';

/**
 * ColorPreloader - Preloads all note color styles to prevent first-render lag
 *
 * This component creates hidden divs with all possible note colors to force
 * the browser and styled-components to parse and cache the CSS styles.
 * Without this, opening a note with a new color causes a noticeable delay
 * as the browser computes styles for the first time.
 */

const COLORS = [
  'default',
  'coral',
  'peach',
  'sand',
  'mint',
  'sage',
  'fog',
  'storm',
  'dusk',
  'blossom',
  'clay',
  'chalk'
];

// Hidden container that won't affect layout
const PreloadContainer = styled.div`
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
  visibility: hidden;
`;

// Preload div with the same styling as NoteCard
const PreloadDiv = styled.div`
  background-color: ${props => {
    if (props.$color && props.$color !== 'default') {
      return `var(--note-color-${props.$color})`;
    }
    return 'var(--note-bg-color)';
  }};
  border: ${props => props.$color === 'default' || !props.$color
    ? '1px solid var(--note-border-color)'
    : 'none'};
  border-radius: 10px;
  padding: 16px;
`;

// Preload scrollable container to force browser to compute scrollbar colors
// This is the key optimization - the browser caches scrollbar color calculations
const PreloadScrollable = styled.div`
  /* Use CSS variable for background (set via inline style) to match NoteForm */
  background-color: var(--preload-color, var(--note-bg-color));

  /* Make it scrollable to trigger scrollbar computation */
  overflow-y: auto;
  height: 100px;
  width: 100px;

  /* Match NoteForm scrollbar styles */
  &::-webkit-scrollbar {
    width: 8px;
    background-color: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
`;

// Inner content to make the container scrollable
const PreloadContent = styled.div`
  height: 500px; /* Taller than container to create scrollbar */
  width: 100%;
`;

export const ColorPreloader = () => {
  useEffect(() => {
    console.log('[ColorPreloader] Preloading all note color styles and scrollbar colors');
  }, []);

  return (
    <PreloadContainer aria-hidden="true">
      {COLORS.map(color => {
        // Compute inline style for CSS variable
        const colorStyle = color && color !== 'default'
          ? { '--preload-color': `var(--note-color-${color})` }
          : {};

        return (
          <div key={color}>
            {/* Preload NoteCard styles */}
            <PreloadDiv $color={color} />

            {/* Preload scrollable container with this color to cache scrollbar calculations */}
            <PreloadScrollable style={colorStyle}>
              <PreloadContent />
            </PreloadScrollable>
          </div>
        );
      })}
    </PreloadContainer>
  );
};

export default ColorPreloader;
