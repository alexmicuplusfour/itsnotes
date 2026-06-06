import React from 'react';
import styled from 'styled-components';

const ProgressContainer = styled.div`
  position: absolute;
  width: 32px;
  height: 32px;
  top: 1px;
  left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10; /* Ensure it's above other elements */
`;

const ProgressSvg = styled.svg`
  width: 100%;
  height: 100%;
  transform: rotate(-90deg); // Start from top
`;

const ProgressCircle = styled.circle`
  fill: none;
  stroke-width: 2; /* Increased from 2 for better visibility */
  stroke-linecap: round;
`;

const BackgroundCircle = styled(ProgressCircle)`
  stroke: ${props => props.$noteColor && props.$noteColor !== 'default' 
    ? 'rgba(255, 255, 255, 0.2)' /* Increased opacity for better visibility */
    : 'rgba(128, 128, 128, 0.2)'}; /* More visible grey */
  opacity: 0.6; /* Increased base opacity */
`;

const ProgressCircleActive = styled(ProgressCircle)`
  stroke: var(--progress-highlight);
  stroke-dasharray: ${props => props.$circumference};
  stroke-dashoffset: ${props => props.$circumference * (1 - props.$progress)};
  transition: stroke-dashoffset 0.3s ease-in-out;
`;

const CircularProgress = ({ 
  progress = 0, 
  size = 32, 
  noteColor = 'default',
  show = true 
}) => {
  // Don't render if explicitly hidden or progress is very small
  if (!show) {
    return null;
  }

  const radius = (size - 6) / 2; // Account for increased stroke width (3 * 2)
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;


  return (
    <ProgressContainer>
      <ProgressSvg width={size} height={size}>
        <BackgroundCircle
          cx={center}
          cy={center}
          r={radius}
          $noteColor={noteColor}
        />
        <ProgressCircleActive
          cx={center}
          cy={center}
          r={radius}
          $circumference={circumference}
          $progress={progress}
          $noteColor={noteColor}
        />
      </ProgressSvg>
    </ProgressContainer>
  );
};

export default CircularProgress;
