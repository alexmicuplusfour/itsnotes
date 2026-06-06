/**
 * View Configuration
 *
 * Defines view-specific navigation behavior.
 * No more scattered `if (isListView)` checks!
 */

import { ViewType, ViewConfig } from './types';

export const VIEW_CONFIGS: Record<ViewType, ViewConfig> = {
  grid: {
    preserveNoteOnSearch: false,
    closeNoteOnOutsideClick: true,
    historyStrategy: 'push',
  },

  stacked: {
    preserveNoteOnSearch: false,
    closeNoteOnOutsideClick: true,
    historyStrategy: 'push',
  },

  list: {
    preserveNoteOnSearch: true,        // Keep note open during search!
    closeNoteOnOutsideClick: false,    // Clicking sidebar doesn't close
    historyStrategy: 'push',            // Let ListView control replace via replaceHistory param
  },
};

/**
 * Get configuration for a specific view type
 */
export function getViewConfig(viewType: ViewType): ViewConfig {
  return VIEW_CONFIGS[viewType];
}
