import React from 'react';
import styled from 'styled-components';

// Using div instead of label intentionally: a <label> wrapping a hidden <input>
// causes the browser to fire a native focus event on the input before React's
// synthetic onClick can call preventDefault. On Android this lets the IME
// redirect focus to the nearest empty contenteditable (the note editor),
// making the keyboard pop up whenever a tag is tapped in an empty note.
const CheckboxContainer = styled.div`
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  vertical-align: middle;
  margin-right: 12px;
  width: 100%;
  height: 100%;
  user-select: none;
`;

const SVGWrapper = styled.div`
  display: inline-block;
  width: 18px;
  height: 18px;
  margin-right: 12px;
  flex-shrink: 0;
  transition: all 150ms;
`;

const CheckboxLabel = styled.span`
  font-size: 15px;
  cursor: pointer;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SVGCheckbox = ({ checked, onChange, id, label, className, indeterminate }) => {
  const effectiveChecked = indeterminate || checked;

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(indeterminate || !checked);
  };

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(indeterminate || !checked);
    }
  };

  return (
    <CheckboxContainer
      id={id}
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={label}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : !!checked}
      aria-label={label}
      tabIndex={0}
    >
      <SVGWrapper>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
        >
          <rect
            x="2"
            y="2"
            width="20"
            height="20"
            rx="4"
            stroke={"var(--text-color)"}
            strokeWidth="2"
            fill={effectiveChecked ? "var(--text-color)" : "transparent"}
            style={{
              transition: "fill 150ms ease, stroke 150ms ease"
            }}
          />

          {indeterminate && (
            <line
              x1="7" y1="12" x2="17" y2="12"
              stroke="var(--background-color)"
              strokeWidth="3"
              strokeLinecap="round"
              style={{
                opacity: indeterminate ? 1 : 0,
                transform: indeterminate ? 'scaleX(1)' : 'scaleX(0.5)',
                transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out'
              }}
            />
          )}

          {checked && !indeterminate && (
            <path
              d="M7 13L10 16L17 9"
              stroke="var(--background-color)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 20,
                strokeDashoffset: checked ? 0 : 20,
                transition: 'stroke-dashoffset 0.2s ease-in-out'
              }}
            />
          )}
        </svg>
      </SVGWrapper>
      <CheckboxLabel>{label}</CheckboxLabel>
    </CheckboxContainer>
  );
};

export default SVGCheckbox;
