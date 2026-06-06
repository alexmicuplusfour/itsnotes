import styled from 'styled-components';

// Sticky Month Header Component
export const StickyMonthHeader = styled.div`
  position: fixed;
  top: var(--nav-height);
  left: 50%;
  transform: translateX(-50%) translateY(${props => props.$show ? '0' : '-100%'});
  width: auto;
  height: 48px;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
  opacity: ${props => props.$show ? 1 : 0};
  visibility: ${props => props.$show ? 'visible' : 'hidden'};
  transition: opacity 0.2s ease-in-out, visibility 0.2s ease-in-out, transform 0.2s ease-in-out;
  pointer-events: ${props => props.$show ? 'auto' : 'none'};

  @media (max-width: 600px) {
    padding: 0 16px;
  }
`;

export const StickyMonthLabel = styled.span`
  background-color: ${props => props.theme === 'dark' 
    ? 'rgb(46, 46, 46)' : 'rgba(226, 225, 221, 1)'};
  font-size: 13px;
  font-weight: 600;
  color: ${props => props.theme === 'dark' 
    ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'};
  border-radius: 16px;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  box-shadow: rgba(0, 0, 0, 0.2) 0px 1px 100px 0px;
`;
