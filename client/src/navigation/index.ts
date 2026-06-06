/**
 * Navigation System
 *
 * Centralized navigation for the entire application.
 * Export all public APIs.
 */

// Core Service
export { NavigationService } from './NavigationService';

// React Integration
export { NavigationProvider, useNavigationContext } from './NavigationContext';
export { useNavigation } from './useNavigation';

// Configuration
export { getViewConfig, VIEW_CONFIGS } from './viewConfigs';

// Types
export * from './types';

// URL Utilities (for advanced usage)
export {
  parseUrlToNavigationState,
  buildUrlFromNavigationState,
  updateScrollInUrl,
  getScrollPositionFromUrl,
  isNoteInStack,
  pushNoteToStack,
  popNoteFromStack,
  clearNotesFromUrl,
  setSearchInUrl,
  clearSearchFromUrl,
} from './urlUtils';
