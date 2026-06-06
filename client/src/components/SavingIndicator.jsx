import React from 'react';
import styled, { keyframes } from 'styled-components';

// Shimmer animation keyframes
const shimmer = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: 200px 0;
  }
`;

// Pulse animation for dot indicator
const pulse = keyframes`
  0% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.3;
  }
`;

// Shimmer effect container
export const ShimmerIndicator = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 100%;
  width: 100%;
  background: linear-gradient(to right, transparent, var(--text-color), transparent);
  opacity: 0.1;
  background-size: 300% 100%;
  animation: ${shimmer} 1.5s infinite;
  z-index: 10;
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  pointer-events: none; /* Make sure it doesn't interfere with clicks */
`;

// Pulsing dot indicator
export const PulsingDot = styled.div`
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--text-color);
  animation: ${pulse} 1.5s infinite;
  z-index: 10;
  pointer-events: none; /* Make sure it doesn't interfere with clicks */
`;

// Component that can render either a shimmer or a dot based on preference
const SavingIndicator = ({ type = 'shimmer' }) => {
  return type === 'shimmer' ? <ShimmerIndicator /> : <PulsingDot />;
};

export default SavingIndicator;