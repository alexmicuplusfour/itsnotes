import styled, { keyframes, css } from "styled-components";

// Define animations
export const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

export const scaleIn = keyframes`
  from {
    transform: scale(0.95);
  }
  to {
    transform: scale(1);
  }
`;

export const slideUp = keyframes`
  from {
    transform: translateY(20px);
  }
  to {
    transform: translateY(0);
  }
`;

export const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

export const Spacer = styled.span`
  display: inline-box;
  width: 4px;
  height: 100%;
`;

export const FormOverlay = styled.div`
  position: ${props => props.$isListView ? 'relative' : 'fixed'};
  top: ${props => props.$isListView ? 'auto' : '0'};
  left: ${props => props.$isListView ? 'auto' : '0'};
  width: 100%;
  height: 100%;
  background-color: ${props => {
    if (props.$isListView) {
      return 'transparent';
    }
    if (props.$fullscreen) {
      return 'var(--form-note-color, var(--note-bg-color))';
    }
    // Light mode: white overlay, dark mode: dark overlay
    return props.$isDarkTheme ? 'rgba(0, 0, 0, 0.4)' : 'rgba(245, 245, 245, 0.7)';
  }};
  backdrop-filter: ${props => (props.$fullscreen || props.$isListView) ? 'none' : 'blur(3px) saturate(15%) contrast(80%)'};
  display: flex;
  justify-content: center;
  align-items: ${props => (props.$fullscreen || props.$isListView) ? 'stretch' : 'center'};
  z-index: ${props => props.$isListView ? 'auto' : '1100'};
  animation: ${props => props.$isListView ? 'none' : css`${fadeIn} 0.2s ease-out`};

  @media (max-width: 768px) {
    background-color: var(--note-bg-color);
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1100;
  }

  @media (max-width: 600px) {
    height: 100%;
    backdrop-filter: none;
    /* Use CSS variable set inline for color - avoids styled-components regenerating styles per color */
    background-color: var(--form-note-color, var(--mobile-note-bg-color));
  }
`;
// Wrapper to position FormContainer and ExternalActionsPill together
export const FormWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: flex-start;
  
  /* Match FormContainer width so centering works correctly */
  width: ${props => (props.$fullscreen || props.$isListView) ? '100%' : '660px'};
  max-width: ${props => (props.$fullscreen || props.$isListView) ? '100%' : '95%'};
  height: ${props => (props.$fullscreen || props.$isListView) ? '100%' : 'auto'};
  
  @media (max-width: 768px) {
    width: 100%;
    max-width: 100%;
    height: 100%;
  }
`;

export const FormContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 100%;
  /* Use CSS variable set inline for color - avoids styled-components regenerating styles per color */
  background-color: var(--form-note-color, var(--note-bg-color));
  /* Only apply border when --form-has-color is not set (default notes) */
  border: ${props => (props.$fullscreen || props.$isListView) ? 'none' : '1px solid var(--noteform-border-color)'};
  border-radius: ${props => (props.$fullscreen || props.$isListView) ? '0' : '8px'};
  box-shadow: ${props => (props.$fullscreen || props.$isListView) ? 'none' : '0 3px 10px var(--shadow-color)'};
  color: var(--text-color);
  display: flex;
  flex-direction: column;

  /* Full height - use 100% for list view to fit container, 100vh for regular fullscreen */
  min-height: ${props => props.$isListView ? '100%' : (props.$fullscreen ? '100vh' : 'min(80vh, 320px)')};
  max-height: ${props => props.$isListView ? '100%' : (props.$fullscreen ? '100vh' : 'calc(100vh - 80px)')};
  height: ${props => props.$isListView ? '100%' : (props.$fullscreen ? '100vh' : 'auto')};

  transition: height 0.1s ease-out; /* Smooth height transitions */
  overflow: hidden; /* Prevent nested scrollbars */
  box-sizing: border-box; /* Include padding in height calculations */

  @media (max-width: 768px) {
    height: 100vh; /* Full-height on mobile */
    max-height: 100vh; /* Full-height on mobile */
    max-width: 98%; /* Wider on mobile */
    margin: 0px;
  }

  /* Animation for a smooth entrance */
  animation:
    ${props => props.$fullscreen ? fadeIn : scaleIn} 0.25s ease-out,
    ${fadeIn} 0.2s ease-out;
  transform-origin: center center;

  /* Mobile styles: full screen */
  @media (max-width: 768px) {
    width: 100%;
    max-width: 100%;
    height: 100%; /* Force full height */
    border-radius: 0;
    display: flex;
    flex-direction: column;
    border: none; /* No borders on mobile regardless of color */
    position: relative; /* Ensure proper positioning context for child elements */
    /* Different animation for mobile - slide up instead of scale */
    animation:
      ${slideUp} 0.25s ease-out,
      ${fadeIn} 0.2s ease-out;
    transform-origin: bottom center;
    overflow: hidden; /* Important to contain the floating footer */
  }

  @media (max-width: 600px) {
    /* Use CSS variable set inline for color */
    background-color: var(--form-note-color, var(--mobile-background-color));
    border: none; /* No border on mobile view */
  }
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  width: 100%;
  flex: 1;
  padding: 0;
  /* Form itself doesn't scroll - ScrollableContent inside handles that */
  overflow: hidden;
  height: 100%; /* Take full height of parent */

  @media (max-width: 768px) {
    position: relative; /* For positioning context */
  }
`;

// New scrollable wrapper that contains both title and content
export const ScrollableContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: ${props => props.$fullscreen ? '0' : '0 0 0 20px'};
  /* Add top padding when search bar is visible to prevent content from being hidden behind it */
  padding-top: ${props => props.$showSearch ? '56px' : '0'};
  
  /* Fullscreen mode: center content and constrain width */
  display: ${props => props.$fullscreen ? 'flex' : 'block'};
  flex-direction: ${props => props.$fullscreen ? 'column' : 'initial'};
  align-items: ${props => props.$fullscreen ? 'center' : 'stretch'};
  
  /* Customize scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
    background-color: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  @media (max-width: 768px) {
    padding: 0 0 10px 18px;
    padding-top: ${props => props.$showSearch ? '56px' : '0'};
    /* Better touch scrolling */
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: none;
    
    /* Reset fullscreen styles on mobile */
    display: block;
    align-items: stretch;
  }
`;

// Wrapper for content inside ScrollableContent when in fullscreen mode
export const ContentWrapper = styled.div`
  width: ${props => props.$fullscreen ? '660px' : '100%'};
  max-width: ${props => props.$fullscreen ? '95%' : '100%'};
  padding-left: ${props => props.$fullscreen ? '20px' : '0'};
  padding-right: ${props => props.$fullscreen ? '20px' : '0'};
  box-sizing: border-box;
  
  @media (max-width: 768px) {
    width: 100%;
    max-width: 100%;
    padding-left: 0;
    padding-right: 0;
  }
`;

export const TitleInput = styled.input`
  font-family: var(--note-body-font-family, 'Product Sans', Arial, sans-serif);
  font-size: 20px;
  font-weight: 400;
  padding: 15px 0;
  margin-top: 10px;
  width: 100%; /* Take full width of container */
  background-color: transparent;
  color: var(--text-color);
  border: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &::placeholder {
    color: var(--text-color);
    opacity: 0.5;
  }
`;

export const TextareaWrapper = styled.div`
  width: 100%;
  /* Don't handle scrolling here - ScrollableContent handles it */
  overflow: visible;
  /* Let content determine height */
  flex: 0 0 auto;
  min-height: 200px;
  padding-bottom: 0px; /* Space for bottom action bar on mobile */

  @media (max-width: 768px) {
    padding-bottom: 0px; /* More space on mobile for keyboard */
  }
`;

export const ContentInput = styled.div`
  // <-- Change to div
  font-family: var(--note-body-font-family, 'Product Sans', Arial, sans-serif);
  font-size: var(--note-body-font-size, 16px);
  margin: 0;
  padding: 0; // Keep padding, adjust if necessary
  width: 100%;
  min-height: 140px; /* Keep minimum height */
  background-color: transparent;
  color: var(--text-color);
  border: none;
  // resize: none; /* REMOVE this */
  line-height: 1.4;
  flex-grow: 1;
  outline: none; // Add this to remove focus ring if desired
  white-space: pre-wrap; // Important for preserving whitespace and line breaks
  word-wrap: break-word; // Ensure long words wrap

  // Placeholder Styling (using ::before pseudo-element)
  &:empty::before {
    content: attr(data-placeholder); // Get placeholder text from data attribute
    color: var(--text-color);
    opacity: 0.7;
    pointer-events: none; // Make placeholder non-interactive
    display: block; // Ensure it takes up space
  }

  // ... Keep other relevant styles like overflow, scrollbar, media queries ...

  /* Customize scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
    background-color: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  /* Desktop-specific styling */
  @media (min-width: 769px) {
    overflow-y: hidden; /* Remove scrolling - let TiptapEditor handle it */
  }

  @media (max-width: 768px) {
    // Keep mobile height/padding rules, adjust if needed
    height: calc(100vh - 60px);
    min-height: calc(100vh - 60px);
    max-height: calc(100vh - 60px);
    margin: 0;
    padding: 0 0 260px 0;
    font-size: var(--note-body-font-size, 16px);
    overflow-y: hidden; /* Remove scrolling - let TiptapEditor handle it */
    scroll-padding-bottom: 10px;
    flex: 1;
    line-height: 1.3;
  }
`;

export const BackButton = styled.button`
  background: none;
  border: none;
  margin-right: 8px;
  border-radius: 50%;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;

  &:hover {
    background-color: ${(props) =>
    props.theme === "dark"
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(0, 0, 0, 0.1)"};
  }
`;

export const TitleRow = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  position: relative;
  /* Add right padding to make room for floating actions pill */
  padding-right: 160px;
  /* Don't shrink - maintain natural height */
  flex-shrink: 0;

  @media (max-width: 768px) {
    padding-right: 140px;
  }
`;

export const TitleInputWrapper = styled.div`
  flex: 1;
  min-width: 0; /* Important for text-overflow to work */
  margin-right: 0;

  @media (max-width: 768px) {
    margin-right: 0;
  }
`;

export const SearchBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  width: 100%;
  margin-left: 0px;
  padding: 0;
  min-height: 56px; /* Fixed height to prevent resizing */
  /* Use CSS variable set inline via style prop to avoid regenerating classes per color */
  background-color: var(--search-bar-color, var(--mobile-note-bg-color));
  border-bottom: 1px solid
    ${(props) =>
    props.theme === "dark"
      ? "rgba(255, 255, 255, 0.2)"
      : "rgba(0, 0, 0, 0.1)"};
  display: flex;
  align-items: center;
  overflow: hidden;
`;

export const SearchInput = styled.input`
  width: 100%;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--text-color);
  font-size: 16px;
  padding: 0 0 0 12px;
  line-height: 56px;

  &::placeholder {
    color: var(--text-color);
    opacity: 0.7;
  }

  &:focus {
    outline: none;
  }
`;

export const SearchNavigation = styled.div`
  display: flex;
  align-items: center;
  height: 100%;
  padding-right: 10px;
`;

export const NavButton = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  opacity: ${(props) => (props.disabled ? "0.3" : "0.8")};
  margin: 0 2px;
  cursor: ${(props) => (props.disabled ? "default" : "pointer")};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  box-sizing: content-box;
  line-height: 1;
  position: relative;

  @media (hover: hover) {
      &:hover {
        opacity: ${(props) => (props.disabled ? "0.3" : "1")};  
        background-color: var(--button-hover-color);
      }
    }
`;

export const ActionButton = styled.button`
  background: none;
  border: none;
  border-radius: 50%;
  font-size: 16px;
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  position: relative;
  box-sizing: content-box;
  line-height: 1;

  @media (hover: hover) {
      &:hover {
        background-color: var(--button-hover-color);
      }
    }
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  color: var(--text-color);
  opacity: 0.8;
  margin-left: auto;
  margin-right: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 36px;
  padding: 0 10px 0 10px;
  position: relative;
  box-sizing: content-box;
  line-height: 1;
  border-radius: 18px;

  &:hover {
    opacity: 1;
    background-color: var(--button-hover-color);
  }

  @media (max-width: 768px) {
    margin-right: 4px;
  }
`;

export const SaveIndicator = styled.div`
  width: 18px;
  height: 18px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top: 2px solid var(--foreground-color);
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

export const CircleIconWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: var(--foreground-color);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
`;

export const HighlightedButton = styled(NavButton)`
  background: transparent;
  padding: 0px;
  &:hover ${CircleIconWrapper} {
    opacity: 1;
  }
`;

export const HighlightContainer = styled.div`
  width: 100%;
  min-height: 120px;
  background-color: transparent;
  color: var(--text-color);
  font-family: var(--note-body-font-family, 'Product Sans', Arial, sans-serif);
  font-size: var(--note-body-font-size, 16px);
  line-height: 1.4; /* Match Tiptap's base line-height */
  padding: 0px 0; /* Adjust padding as needed */
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
  padding-right: 14px;
  /* Don't handle scrolling here - ScrollableContent handles it */
  overflow: visible;
  /* Let content flow naturally */
  height: auto;
  flex: 0 0 auto;
  box-sizing: border-box;

  @media (max-width: 768px) {
    line-height: 1.3;
    padding-bottom: 230px;
  }

  /* --- Key CSS rules to add --- */
  p {
      margin: 0;
      padding: 0px 0;
      /* Ensure empty paragraphs take up space visually */
      min-height: 1.3em; /* Or match your line-height */
    }

    /* Adjust placeholder styling to only affect truly empty first paragraph */
    p:first-child:empty::before {
        color: #9aa0a6;
        content: attr(data-placeholder);
        float: left;
        height: 0;
        pointer-events: none;
    }

    /* Hide placeholder if first paragraph is not empty OR if it's not the first paragraph */
    p:first-child:not(:empty)::before,
    p:not(:first-child)::before {
        display: none;
        content: none;
    }

    ul, ol {
      padding-left: 1.5rem;
    }
   a {
      color: var(--link);
      text-decoration: none;
      &:hover {
        text-decoration: underline;
      }
    }
   blockquote {
      border-left: 3px solid var(--border-transparent);
      padding-left: 0.8rem;
      font-weight: 400;
      opacity: 0.8;
    }

    code {
      background-color: var(--border-transparent);
      border-radius: 3px;
      padding: 0.2rem 0.2rem;
      font-family: monospace;
      line-height: 1.6;
      font-size: 14px;
      text-wrap-mode: wrap;
      white-space: break-spaces;
    }  

  /* Optional: You can also define highlight styles here */
  .highlighted-match {
    background-color: var(--accent-color);
    color: var(--text-color);
    border-radius: 2px;
    padding: 0;
    margin: 0;
    /* box-shadow: 0 0 0 1px var(--accent-color); */ /* Optional subtle outline */
  }

  .highlighted-match.current-match {
    background-color: #ffec3d !important; /* Yellow for current match */
    color: #333 !important; /* Ensure text contrast */
    /* box-shadow: 0 0 0 2px #ffec3d; */ /* Optional thicker outline */
  }
  /* --- End Key CSS --- */

  /* Inherit scrollbar styles if needed */
  &::-webkit-scrollbar {
    width: 8px;
    background-color: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
`;

export const ReminderStatusText = styled.div`
  font-style: italic;
  color: var(--text-secondary-color);
  font-size: 14px;
  margin: 4px 12px;
  padding-bottom: 8px;
`;

function convertToRGBA(color) {
  // Create a temporary element to compute the color
  const temp = document.createElement('div');
  temp.style.color = color;
  temp.style.display = 'none';
  document.body.appendChild(temp);

  // Get computed color (which will be in rgb/rgba format)
  const computedColor = window.getComputedStyle(temp).color;
  document.body.removeChild(temp);

  // If it's already rgba, return it
  if (computedColor.startsWith('rgba')) {
    return computedColor;
  }

  // If it's rgb, convert to rgba
  if (computedColor.startsWith('rgb(')) {
    return computedColor.replace('rgb(', 'rgba(').replace(')', ', 0.8)');
  }

  return computedColor;
}

// Floating actions pill - like ChatGPT interface
export const FloatingActionsPill = styled.div`
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 100;
  
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;

  border-radius: 22px;

  /* Glassy background effect with opacity - use color-mix to avoid JavaScript */
  background-color: color-mix(in srgb, var(--note-color-for-opacity, var(--note-bg-color)) 85%, transparent);
  
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  
  /* Subtle shadow for floating effect */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15),
              0 1px 3px rgba(0, 0, 0, 0.1);
  
  /* Subtle border for definition */
  border: 1px solid ${props => 
    props.$isDarkTheme 
      ? 'rgba(255, 255, 255, 0.05)' 
      : 'rgba(255, 255, 255, 0.3)'
  };

  /* Transition for smooth appearance */
  transition: opacity 0.2s ease, transform 0.2s ease;

  @media (max-width: 768px) {
    top: 12px;
    right: 14px;
    padding: 3px;
    border-radius: 20px;
  }
  
  @media (max-width: 600px) {
    right: 12px;
    background-color: color-mix(in srgb, var(--note-color-for-opacity, var(--mobile-note-bg-color)) 85%, transparent);
  }
`;

// External floating pill - positioned outside form container, vertical layout
export const ExternalActionsPill = styled.div`
  position: absolute;
  top: ${props => props.$fullscreen ? '12px' : '0px'};
  /* Position to the left of FormContainer in windowed mode, fixed left in fullscreen */
  right: ${props => props.$fullscreen ? 'auto' : 'calc(100% + 10px)'};
  left: ${props => props.$fullscreen ? '16px' : 'auto'};
  z-index: 100;
  
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;

  border-radius: 22px;
 
  /* Use CSS variable set inline via style prop to avoid regenerating classes per color */
  background-color: ${props => {
    // 1. If NOT in full screen, use the generic background color
    if (!props.$fullscreen) {
      return 'var(--background-color)';
    }

    // 2. If in full screen, use the color variable (set via inline style)
    // Fallback to default note bg if not set
    return 'var(--external-pill-color, var(--note-bg-color))';
  }};
  
  /* Subtle shadow for floating effect */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15),
              0 1px 3px rgba(0, 0, 0, 0.1);
  
  /* Subtle border for definition */
  border: 1px solid ${props => 
    props.$isDarkTheme 
      ? 'rgba(255, 255, 255, 0.05)' 
      : 'rgba(255, 255, 255, 0.3)'
  };

  /* Transition for smooth appearance */
  transition: opacity 0.2s ease, transform 0.2s ease;

  /* Hide on mobile */
  @media (max-width: 768px) {
    display: none;
  }
`;

// Floating pill for in-note search navigation (match count + prev/next).
// Fixed to the right edge, vertically centered — occupies the same spot as the
// starred note tabs, which are hidden while search is active.
export const InNoteSearchPill = styled.div`
  position: fixed;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  z-index: 1102;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;

  /* Large radius keeps the top/bottom fully rounded (capsule) at any width */
  border-radius: 999px;

  background-color: var(--search-pill-color, var(--note-bg-color));

  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15),
              0 1px 3px rgba(0, 0, 0, 0.1);

  border: 1px solid ${props =>
    props.$isDarkTheme
      ? 'rgba(255, 255, 255, 0.05)'
      : 'rgba(255, 255, 255, 0.3)'};

  transition: opacity 0.2s ease, transform 0.2s ease;

  /* Match count readout */
  .search-pill-count {
    font-size: 11px;
    font-weight: normal;
    opacity: 0.9;
    padding: 8px 0 4px;
    text-align: center;
  }
`;
