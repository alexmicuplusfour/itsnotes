import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import Icon from './Icons';

const ENTER_DURATION = 200;
const EXIT_DURATION = 160;

const overlayFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const overlayFadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const containerSlideDown = keyframes`
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const containerSlideUp = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-8px); }
`;

const Overlay = styled.div`
  position: ${props => props.$position || 'fixed'};
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: ${props => props.$zIndex ?? 1100};
  animation: ${props => props.$closing
    ? css`${overlayFadeOut} ${EXIT_DURATION}ms ease-in forwards`
    : css`${overlayFadeIn} ${ENTER_DURATION}ms ease-out`};

  @media (max-width: 768px) {
    background-color: var(--note-bg-color);
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Container = styled.div`
  position: relative;
  background-color: var(--note-bg-color);
  border: ${props => props.theme === 'dark' ? 'none' : '1px solid var(--note-border-color)'};
  border-radius: 8px;
  box-shadow: 0 3px 10px var(--shadow-color);
  color: var(--text-color);
  display: flex;
  flex-direction: column;
  animation: ${props => props.$closing
    ? css`${containerSlideUp} ${EXIT_DURATION}ms ease-in forwards`
    : css`${containerSlideDown} ${ENTER_DURATION}ms ease-out`};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  width: ${props => props.$width || 'auto'};
  max-width: ${props => props.$maxWidth || '90%'};
  height: ${props => props.$height || 'auto'};
  ${props => props.$maxHeight && `max-height: ${props.$maxHeight};`}

  @media (max-width: 768px) {
    width: 100%;
    max-width: 100%;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  box-shadow: 1px 3px 9px 0px rgba(0,0,0,0.2);
`;

const Title = styled.h2`
  font-size: 18px;
  font-weight: 500;
  margin: 0;
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  opacity: 0.8;
  cursor: pointer;
  &:hover { opacity: 1; }
`;

const Modal = forwardRef(({
  title,
  onClose,
  position = 'fixed',
  zIndex = 1100,
  width,
  maxWidth = '90%',
  height,
  maxHeight,
  closeIconSize = 20,
  guardDragSelection = false,
  closeOnOverlayClick = true,
  overlayClassName,
  children,
}, ref) => {
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    !document.documentElement.classList.contains('light-theme')
  );
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkTheme(!document.documentElement.classList.contains('light-theme'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      onCloseRef.current?.();
      return;
    }
    setClosing(true);
    setTimeout(() => onCloseRef.current?.(), EXIT_DURATION);
  }, [closing]);

  const handleOverlayMouseDown = guardDragSelection
    ? (e) => { if (e.target === e.currentTarget) e.stopPropagation(); }
    : undefined;
  const handleContainerMouseDown = guardDragSelection
    ? (e) => e.stopPropagation()
    : undefined;

  return (
    <Overlay
      ref={ref}
      $position={position}
      $zIndex={zIndex}
      $closing={closing}
      onClick={closeOnOverlayClick ? requestClose : undefined}
      onMouseDown={handleOverlayMouseDown}
      className={overlayClassName}
    >
      <Container
        theme={isDarkTheme ? 'dark' : 'light'}
        $width={width}
        $maxWidth={maxWidth}
        $height={height}
        $maxHeight={maxHeight}
        $closing={closing}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleContainerMouseDown}
      >
        <Header>
          <Title>{title}</Title>
          <CloseBtn onClick={requestClose} aria-label="Close">
            <Icon name="close" size={closeIconSize} />
          </CloseBtn>
        </Header>
        {children}
      </Container>
    </Overlay>
  );
});

export default Modal;
