import React from 'react';
import styled from 'styled-components';

// Variant determines which background the switch is placed on:
// - default: white on light theme, dark on dark theme (original design for opposite-colored menus)
// - "inverse": uses opposite colors (for when switch is on same-colored background as theme)
const getColors = (variant) => {
  if (variant === 'inverse') {
    // Inverse: use theme-matching colors (dark on dark theme bg, light on light theme bg)
    return null;
  }
  // Default: white on light theme, dark on dark theme
  return {
    activeColor: 'var(--switch-inverse-active)',
    inactiveColor: 'var(--switch-inverse-inactive)',
    activeKnobColor: 'var(--switch-inverse-knob-active)',
    inactiveKnobColor: 'var(--switch-inverse-knob-inactive)',
  };
};

const SwitchContainer = styled.div`
  display: flex;
  align-items: center;
  margin-left: auto;
  height: 20px;
  width: 34px;
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  @media (max-width: 768px) {
    width: 38px;
    height: 24px;
  }
`;

const SwitchInput = styled.input`
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
`;

const SwitchSlider = styled.span`
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${props => props.checked ? (props.$activeColor || 'var(--background-color)') : 'transparent'};
  outline: ${props => props.checked ? 'none' : `2px solid ${props.$inactiveColor || 'var(--background-color)'}`};
  outline-offset: -2px;
  transition: 0.4s;
  border-radius: 34px;
  
  &:before {
    position: absolute;
    content: "";
    height: ${props => props.checked ? '14px' : '12px'};
    width: ${props => props.checked ? '14px' : '12px'};
    left: 2px;
    bottom: ${props => props.checked ? '3px' : '4px'};
    background-color: ${props => props.checked ? (props.$activeKnobColor || 'var(--foreground-color)') : (props.$inactiveKnobColor || 'var(--background-color)')};
    transition: 0.4s;
    border-radius: 50%;
    transform: ${props => props.checked ? 'translateX(14px)' : 'translateX(2px)'};
    
      @media (max-width: 768px) {
        bottom: ${props => props.checked ? '3px' : '4px'};
        height: ${props => props.checked ? '18px' : '16px'};
        width: ${props => props.checked ? '18px' : '16px'};
        transform: ${props => props.checked ? 'translateX(15px)' : 'translateX(2px)'};
      }
  }
`;

const Switch = ({ checked, onChange, id, variant }) => {
  const colors = getColors(variant);
  
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(e);
  };

  return (
    <SwitchContainer onClick={handleClick}>
      <SwitchInput
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          e.stopPropagation();
        }}
      />
      <SwitchSlider 
        checked={checked} 
        $activeColor={colors?.activeColor}
        $inactiveColor={colors?.inactiveColor}
        $activeKnobColor={colors?.activeKnobColor}
        $inactiveKnobColor={colors?.inactiveKnobColor}
      />
    </SwitchContainer>
  );
};

export default Switch;
