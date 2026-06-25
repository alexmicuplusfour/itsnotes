import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactDOM, { flushSync } from 'react-dom';
import styled, { keyframes, css } from 'styled-components';
import Icon from './Icons';
import { useUIPreferences } from '../contexts/UIPreferencesContext';

const slideUp = keyframes`
  from { transform: translateY(60px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const slideDown = keyframes`
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(60px); opacity: 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const fadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

export const COLORS = [
    'default', 'coral', 'peach', 'sand', 'mint', 'sage', 'fog',
    'storm', 'dusk', 'blossom', 'clay', 'chalk'
];

// Color aliases for search autocomplete - maps actual color names to intuitive aliases
// When user types "$blue", colors with 'blue' as an alias will appear in dropdown
export const COLOR_ALIASES = {
    coral:   ['red', 'orange'],
    peach:   ['orange', 'pink', 'salmon'],
    sand:    ['yellow', 'brown', 'tan', 'beige'],
    mint:    ['green', 'teal', 'cyan'],
    sage:    ['green', 'blue'],
    fog:     ['blue', 'light', 'gray', 'grey'],
    storm:   ['blue', 'gray', 'grey', 'dark'],
    dusk:    ['purple', 'violet', 'lavender'],
    blossom: ['pink', 'red', 'magenta'],
    clay:    ['brown', 'orange', 'terracotta'],
    chalk:   ['white', 'gray', 'grey', 'light'],
};

const PADDING = 10;
const GAP = 8;

// --- Styled Components ---

// Overlay Component - Now conditionally displayed based on prop
const ColorPickerOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1999;

  /* --- Base state (Hidden) --- */
  opacity: 0;
  pointer-events: none;

  /* --- Conditional Mobile Styles based on $mobileBottomSheet prop --- */
  ${props => props.$mobileBottomSheet && css`
    @media (max-width: 768px) {
      display: block; // Only displayed if mobileBottomSheet is true AND screen is mobile
      pointer-events: auto;
      animation: ${props.$isClosing ? fadeOut : fadeIn} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
  `}
  /* Default display: none effectively hides it on desktop OR if mobileBottomSheet is false */
  display: none;
  @media (max-width: 768px) {
    ${props => props.$mobileBottomSheet && css` display: block; `}
  }
`;


// Picker Container - Mobile styles conditional on prop
const PickerContainer = styled.div`
  /* --- Default (Desktop / Popover) Styles --- */
  position: absolute; /* Default */
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: ${GAP}px;
  padding: 12px;
  background-color: var(--dropdown-bg-color, var(--note-bg-color));
  border-radius: 8px;
  box-shadow: 0 2px 10px var(--shadow-color);
  z-index: 2000;

  opacity: ${props => props.$isPositioned ? 1 : 0};
  transform: ${props => props.$isPositioned ? 'scale(1)' : 'scale(0.95)'};
  pointer-events: ${props => props.$isPositioned ? 'auto' : 'none'};
  transform-origin: top left;
  transition: opacity 0.1s ease-out, transform 0.1s ease-out;

  /* --- Conditional Mobile Styles based on $mobileBottomSheet prop --- */
  ${props => props.$mobileBottomSheet && css`
    @media (max-width: 768px) {
      position: fixed; /* Override default */
      width: 100%;
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      border-radius: 12px 12px 0 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
      box-sizing: border-box;
      box-shadow: 0 -2px 60px var(--shadow-color);
      background-color: ${props => props.$noteColor && props.$noteColor !== 'default' 
        ? `var(--note-color-${props.$noteColor})` 
        : 'var(--mobile-overlay-bg, var(--dropdown-bg-color))'};

      grid-template-columns: repeat(auto-fit, minmax(45px, 1fr));
      /* Let rows be created automatically as items wrap */
      grid-auto-rows: min-content;

      /* Mobile slide-up animation */
      transform: translateY(0);
      transform-origin: bottom center;
      animation: ${props.$isClosing ? slideDown : slideUp} 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;

      padding: 16px;
      gap: 16px;
    }
  `}
`;

// Color Button - Mobile styles conditional on prop
const ColorButton = styled.button`
  /* --- Base Styles --- */
  width: 28px;
  height: 28px;
  border-radius: 50%;
  outline: 1px solid var(--border-transparent);
  outline-offset: -1px;
  /* Use CSS variable set via inline style to avoid regenerating classes per color */
  background-color: var(--color-btn-bg, var(--note-bg-color));
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border 0.1s ease-in-out, box-shadow 0.1s ease-in-out;

  &:hover { outline: 2px solid var(--text-color); }
  ${props => props.$isSelected && css`
    outline: 2px solid var(--text-color);
  `}

  /* --- Conditional Mobile Styles --- */
  ${props => props.$mobileBottomSheet && css`
    @media (max-width: 768px) {
      width: 52px;
      height: 52px;
    }
  `}
`;

// Color Checkmark (Keep as is)
/*const ColorCheckmark = styled.div`
  color: var(--text-color);
  font-size: 20px;
  line-height: 1;
`;*/

// --- Portal Component ---
const Portal = ({ children }) => {
    const el = useRef(document.createElement('div'));
    useEffect(() => {
        const currentEl = el.current;
        document.body.appendChild(currentEl);
        return () => {
            if (document.body.contains(currentEl)) {
                document.body.removeChild(currentEl);
            }
        };
    }, []);
    return ReactDOM.createPortal(children, el.current);
};

// --- Main ColorPicker Component ---
export const ColorPicker = ({
    currentColor,
    onColorSelect,
    onClose,
    targetRef,
    position = 'bottom-right',
    mobileBottomSheet = false,
    noteColor = null, // Background color for mobile bottom sheet
    // Note: isMobile prop is no longer needed here,
    // we derive it internally from window size when needed.
}) => {
    const pickerRef = useRef(null);
    const [isPositioned, setIsPositioned] = useState(false);
    const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
    // Internal state for mobile view detection
    const [isMobileView, setIsMobileView] = useState(() => window.innerWidth <= 768);
    // Closing animation state
    const [isClosing, setIsClosing] = useState(false);
    const [shouldRender, setShouldRender] = useState(true);
    const isClosingRef = useRef(false);
    // Get color label function from context
    const { getColorLabel } = useUIPreferences();

    // Handle close with animation
    const handleCloseWithAnimation = useCallback(() => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;
        setIsClosing(true);
        setTimeout(() => {
            setShouldRender(false);
            onClose();
            isClosingRef.current = false;
        }, 300);
    }, [onClose]);

    // Update mobile view state on resize
    useEffect(() => {
        const handleResize = () => {
            const mobileCheck = window.innerWidth <= 768;
            // console.log("Resize check: isMobileView =", mobileCheck); // Debug log
            setIsMobileView(mobileCheck);
        }
        window.addEventListener('resize', handleResize);
        // Initial check in case window size changed before mount
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    // --- Positioning Logic ---
    useEffect(() => {
        console.log("[ColorPicker Effect] Running. mobileBottomSheet:", mobileBottomSheet, "isMobileView:", isMobileView, "targetRef:", !!targetRef?.current);
        let animationFrameId;
        let handleResize;
        // Don't reset isPositioned here immediately, set it only when needed

        // Determine the mode for this effect run
        const useBottomSheet = mobileBottomSheet && isMobileView;

        // *** Handle Mobile Bottom Sheet Case ***
        if (useBottomSheet) {
            console.log("[ColorPicker Effect] Mode: BottomSheet");
            setIsPositioned(false); // Reset first for animation trigger
            setPickerPosition({ top: 0, left: 0 }); // Reset JS position state
            const timer = setTimeout(() => {
                console.log("[ColorPicker Effect] BottomSheet: Setting isPositioned = true");
                if (flushSync) { flushSync(() => setIsPositioned(true)); }
                else { setIsPositioned(true); }
            }, 10); // Small delay for transition setup
            return () => clearTimeout(timer);
        }
        // *** Handle Desktop / Popover Case ***
        else if (targetRef?.current) {
            console.log("[ColorPicker Effect] Mode: Popover, targetRef available");
            setIsPositioned(false); // Reset first for animation trigger

            // Calculate the popover position relative to its trigger. Returns null
            // if refs/dimensions aren't ready yet.
            const computePosition = () => {
                if (!targetRef.current || !pickerRef.current) return null;
                const targetRect = targetRef.current.getBoundingClientRect();
                const pickerHeight = pickerRef.current.offsetHeight;
                const pickerWidth = pickerRef.current.offsetWidth;
                if (pickerHeight === 0 || pickerWidth === 0) return null;

                let top, left;
                const windowHeight = window.innerHeight;
                const windowWidth = window.innerWidth;

                // Horizontal position
                switch (position) {
                    case 'top-left':
                    case 'bottom-left': left = targetRect.left; break;
                    case 'top-right':
                    case 'bottom-right':
                    default: left = targetRect.right - pickerWidth; break;
                }

                // Vertical position with smart fallback (mirrors NoteTagPicker logic)
                const topAbove = targetRect.top - pickerHeight - GAP;
                const topBelow = targetRect.bottom + GAP;
                if (position.startsWith('top')) {
                    top = topAbove >= PADDING
                        ? topAbove
                        : (topBelow + pickerHeight <= windowHeight - PADDING ? topBelow : Math.max(PADDING, windowHeight - pickerHeight - PADDING));
                } else {
                    top = topBelow + pickerHeight <= windowHeight - PADDING
                        ? topBelow
                        : (topAbove >= PADDING ? topAbove : Math.max(PADDING, windowHeight - pickerHeight - PADDING));
                }

                if (left + pickerWidth > windowWidth - PADDING) left = windowWidth - pickerWidth - PADDING;
                if (left < PADDING) left = PADDING;

                return { top: top + window.scrollY, left: left + window.scrollX };
            };

            animationFrameId = requestAnimationFrame(() => {
                const newPosition = computePosition();
                if (newPosition) {
                    // Set position state *then* trigger animation. flushSync ensures
                    // state is updated before setting isPositioned.
                    const applyPositionAndAnimate = () => {
                        setPickerPosition(newPosition);
                        setIsPositioned(true);
                    }
                    if (flushSync) { flushSync(applyPositionAndAnimate); }
                    else { applyPositionAndAnimate(); }
                } else {
                     console.warn("[ColorPicker Effect] Popover: targetRef or pickerRef not ready during rAF.");
                     if (flushSync) { flushSync(() => setIsPositioned(false)); }
                     else { setIsPositioned(false); }
                }
            });

            // Keep the popover anchored to its trigger button on window resize.
            // Only the position is updated (no isPositioned reset) so it follows
            // smoothly without re-running the open animation.
            handleResize = () => {
                const newPosition = computePosition();
                if (newPosition) setPickerPosition(newPosition);
            };
            window.addEventListener('resize', handleResize);
        } else {
            console.log("[ColorPicker Effect] Conditions not met (No targetRef for Popover mode). Setting isPositioned = false.");
            // Ensure picker is hidden if no target ref is available for popover mode
            setIsPositioned(false);
        }

        return () => {
            console.log("[ColorPicker Effect] Cleanup");
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (handleResize) window.removeEventListener('resize', handleResize);
        };
    // Depend on the derived boolean `useBottomSheet` or individual states
    }, [targetRef, position, mobileBottomSheet, isMobileView]); // Dependencies are key

    // --- Click Outside Logic ---
     useEffect(() => {
         const handleClickOutside = (event) => {
             const isClickInsidePicker = event.target.closest('[data-color-picker-container]');
             const isClickInsideOverlay = event.target.closest('[data-color-picker-overlay]');
             const isClickOnTrigger = targetRef?.current?.contains(event.target);

             if (!isClickInsidePicker && !isClickInsideOverlay && !isClickOnTrigger) {
                  // console.log("ColorPicker: Click outside detected, closing.");
                  onClose();
             }
         };
         const timerId = setTimeout(() => { document.addEventListener('mousedown', handleClickOutside); }, 0);
         return () => { clearTimeout(timerId); document.removeEventListener('mousedown', handleClickOutside); };
     }, [onClose, targetRef]);

    const handleSelect = (colorOption) => {
        onColorSelect(colorOption);
        if (mobileBottomSheet && isMobileView) {
            handleCloseWithAnimation();
        } else {
            onClose();
        }
    };

    // console.log("[ColorPicker Render] isPositioned:", isPositioned, "mobileBottomSheet:", mobileBottomSheet, "isMobileView:", isMobileView);

    // Don't render if closing animation is complete
    if (!shouldRender) return null;

    // Use animated close for mobile bottom sheet
    const handleMobileClose = (e) => {
        e.stopPropagation();
        if (mobileBottomSheet && isMobileView) {
            handleCloseWithAnimation();
        } else {
            onClose();
        }
    };

    return (
        <Portal>
            {/* Conditionally render Overlay */}
            {mobileBottomSheet && isMobileView && ( // Render overlay only in this specific mode
                <ColorPickerOverlay
                    $isVisible={isPositioned} // Controlled by isPositioned state
                    $isClosing={isClosing}
                    onClick={handleMobileClose}
                    data-color-picker-overlay
                    $mobileBottomSheet={mobileBottomSheet}
                />
            )}

            {/* Render Picker Container */}
            <PickerContainer
                ref={pickerRef}
                onClick={(e) => e.stopPropagation()}
                $isPositioned={isPositioned} // Controls visibility/animation
                $isClosing={isClosing}
                data-color-picker-container
                $mobileBottomSheet={mobileBottomSheet}
                $noteColor={noteColor || currentColor}
                // Apply dynamic styles only for the popover case
                style={!mobileBottomSheet || !isMobileView ? {
                    top: `${pickerPosition.top}px`,
                    left: `${pickerPosition.left}px`,
                } : {}}
            >
                {COLORS.map(colorOption => {
                    // Compute inline style for color CSS variable - avoids styled-components class regeneration
                    const btnColorStyle = colorOption && colorOption !== 'default'
                        ? { '--color-btn-bg': `var(--note-color-${colorOption})` }
                        : {};

                    return (
                        <ColorButton
                            className="color-button"
                            key={colorOption}
                            $isSelected={currentColor === colorOption}
                            $mobileBottomSheet={mobileBottomSheet}
                            style={btnColorStyle}
                            onClick={(e) => {
                                e.preventDefault();
                                handleSelect(colorOption);
                            }}
                            title={getColorLabel(colorOption).charAt(0).toUpperCase() + getColorLabel(colorOption).slice(1)}
                            type="button"
                        >
                            {currentColor === colorOption && <Icon name="check" size={16} color="var(--text-color)" strokeWidth="3.5"/>}
                        </ColorButton>
                    );
                })}
            </PickerContainer>
        </Portal>
    );
};