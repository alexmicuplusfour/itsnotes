import React from 'react';
import styled, { keyframes } from 'styled-components';
import Icon from './Icons';
import { buildNoteStateActions } from '../utils/noteCardActions';

// Mobile note cards and list rows have no room to reserve for an action row, so the strip
// floats over the bottom-right corner of whichever one hosts it. Summoned by long press;
// see useMobileActionStrip for the open/dismiss behavior.

const stripFadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const Strip = styled.div`
  position: absolute;
  right: 6px;
  bottom: 6px;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 24px;
  color: var(--text-color);

  /* Same glassy treatment the note form's floating mobile bar uses. The host sets exactly
     one of these vars inline for colored notes - --card-bg-color on a card, --item-bg-color
     on a list row - and both fall back to the plain mobile background. */
  background-color: color-mix(
    in srgb,
    var(--card-bg-color, var(--item-bg-color, var(--mobile-background-color))) 88%,
    transparent
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--border-transparent);
  box-shadow: 0 2px 12px var(--shadow-color);
  animation: ${stripFadeIn} 0.15s ease-out;

  /* Bulk selection owns the screen when it's active - same rule the desktop bars use. */
  .selection-mode & {
    display: none;
  }
`;

const StripButton = styled.button`
  background: none;
  border: none;
  border-radius: 50%;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  flex-shrink: 0;
  line-height: 1;
  cursor: pointer;

  &:active {
    background-color: var(--button-hover-color);
  }
`;

/**
 * `actions` is the NoteActionsContext value; `onDismiss` closes the strip before the action
 * runs.
 */
const MobileNoteActionStrip = ({ note, view, actions, onDismiss }) => (
  <Strip onClick={(e) => e.stopPropagation()}>
    {buildNoteStateActions({ note, view, actions }).map(action => (
      <StripButton
        key={action.key}
        type="button"
        title={action.title}
        aria-label={action.title}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
          action.run();
        }}
      >
        <Icon name={action.icon} size={20} />
      </StripButton>
    ))}
  </Strip>
);

export default MobileNoteActionStrip;
