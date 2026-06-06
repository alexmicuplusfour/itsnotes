import React from 'react';
import styled from 'styled-components';

// Hidden native checkbox (still accessible)
const HiddenCheckbox = styled.input.attrs({ type: 'checkbox' })`
  // Hide the checkbox visually but remain accessible to screen readers
  position: absolute;
  opacity: 0;
  height: 0;
  width: 0;
  margin: 0;
`;

// SVG Container
const CheckboxContainer = styled.label`
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  vertical-align: middle;
  margin-right: ${props => props.label ? '12px' : '0'};
  width: ${props => props.label ? '100%' : 'auto'};
  height: 100%;
`;

// SVG wrapper styles
const SVGWrapper = styled.div`
  display: inline-block;
  width: 24px;
  height: 24px;
  margin-right: 4px;
  transition: all 150ms;

  @media (max-width: 768px) {
    width: 24px;
    height: 24px;
  }
`;

// The checkbox label
const CheckboxLabel = styled.span`
  font-size: 15px;
  cursor: pointer;
  flex: 1;
  // Add ellipsis for long labels within the flex container
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// Define the SVG Checkbox Circle component for task lists
// Add indeterminate prop
const SVGCheckboxCircle = ({ checked, onChange, id, label, className, indeterminate }) => {
  const effectiveChecked = indeterminate || checked; // Circle is filled if checked or indeterminate

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Cycle: unchecked -> checked, indeterminate -> checked, checked -> unchecked
    onChange(indeterminate || !checked);
  };
  return (
    <CheckboxContainer
      className={className}
      onClick={handleClick}
      // Add title attribute for better accessibility, especially for truncated labels
      title={label}
      label={label}
    >
      {/* Use a ref for the native input if needed, but keep readOnly */}
      <HiddenCheckbox id={id} checked={!!checked} readOnly ref={input => {
        if (input) {
          input.indeterminate = !!indeterminate; // Set native indeterminate state
        }
      }} />
      <SVGWrapper checked={effectiveChecked}>        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
        >          {/* Checkbox background - changed from rect to circle */}
          <circle
            cx="12"
            cy="12"
            r="10"
            // Stroke color remains consistent
            stroke={"var(--text-color)"}
            strokeWidth="2"
            // Fill based on effectiveChecked
            fill={effectiveChecked ? "var(--text-color)" : "transparent"}
            style={{
              transition: "fill 150ms ease, stroke 150ms ease"
            }}
          />

          {/* Indeterminate state: Render a line */}
          {indeterminate && (
            <line
              x1="7" y1="12" x2="17" y2="12"
              stroke="var(--background-color)" // Use background color for contrast
              strokeWidth="3"
              strokeLinecap="round"
              style={{
                opacity: indeterminate ? 1 : 0,
                transform: indeterminate ? 'scaleX(1)' : 'scaleX(0.5)',
                transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out'
              }}
            />
          )}

          {/* Checked state (only if not indeterminate) */}
          {checked && !indeterminate && (
            <path
              d="M7 13L10 16L17 9"
              stroke="var(--background-color)" // Use background color for contrast
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
      {/* Only render label if it exists */}
      {label && <CheckboxLabel>{label}</CheckboxLabel>}
    </CheckboxContainer>
  );
};

export default SVGCheckboxCircle;
