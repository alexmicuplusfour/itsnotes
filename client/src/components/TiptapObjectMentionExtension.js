import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey, Plugin } from 'prosemirror-state';

// Handler for object mention clicks - can be set from outside
let objectMentionClickHandler = (label) => {
  console.warn(`Object mention clicked: ${label}. Implement setObjectMentionClickHandler!`);
};

// Function to set the handler from outside (e.g., from NoteForm)
export const setObjectMentionClickHandler = (handler) => {
  objectMentionClickHandler = handler;
};

// Function to get the current handler
export const getObjectMentionClickHandler = () => {
  return objectMentionClickHandler;
};

// The inline mention node that gets inserted
export const ObjectMention = Node.create({
  name: 'objectMention',

  group: 'inline',

  inline: true,

  selectable: false,

  atom: true,

  addAttributes() {
    return {
      objectId: {
        default: null,
        parseHTML: element => element.getAttribute('data-object-id'),
        renderHTML: attributes => {
          if (!attributes.objectId) return {};
          return { 'data-object-id': attributes.objectId };
        },
      },
      objectType: {
        default: null,
        parseHTML: element => element.getAttribute('data-object-type'),
        renderHTML: attributes => {
          if (!attributes.objectType) return {};
          return { 'data-object-type': attributes.objectType };
        },
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
        renderHTML: attributes => {
          if (!attributes.label) return {};
          return { 'data-label': attributes.label };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="object-mention"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Store full label - truncation is applied via CSS for display only
    const label = node.attrs.label || '';

    return [
      'span',
      mergeAttributes(
        { 'data-type': 'object-mention' },
        HTMLAttributes
      ),
      `@${label}`,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isMention = false;
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isMention = true;
              tr.insertText('', pos, pos + node.nodeSize);
              return false;
            }
          });

          return isMention;
        }),
    };
  },

  addProseMirrorPlugins() {
    const nodeName = this.name;

    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
      // Click handler plugin for object mentions
      new Plugin({
        props: {
          handleClick(view, pos, event) {
            // Check if we clicked on an object mention element
            if (!(event.target instanceof HTMLElement)) return false;
            
            const mentionEl = event.target.closest('span[data-type="object-mention"]');
            if (!mentionEl) return false;

            // Get the label from the data attribute
            const label = mentionEl.getAttribute('data-label');
            if (!label) return false;

            event.preventDefault();
            event.stopPropagation();
            
            // Call the click handler with the label
            objectMentionClickHandler(label);
            return true;
          },
        },
      }),
    ];
  },
});

// Suggestion plugin configuration factory
export const createObjectMentionSuggestion = (onSearch, onSelect) => ({
  pluginKey: new PluginKey('objectMentionSuggestion'),
  char: '@',
  allowSpaces: true, // Allow spaces for multi-word titles like "The Great Gatsby"
  allowedPrefixes: [' ', '\n', '\t', null], // Allow @ at start of line or after whitespace
  
  // Exit mention mode if query starts with a space (e.g., "@ " should close dropdown)
  allow: ({ state, range }) => {
    const text = state.doc.textBetween(range.from, range.to, '\0', '\0');
    // Text includes the @ char, so check if second char is a space
    if (text.length > 1 && text[1] === ' ') {
      return false;
    }
    return true;
  },

  items: async ({ query }) => {
    if (!query || query.length < 1) {
      return [];
    }
    try {
      const results = await onSearch(query);
      return results.slice(0, 8);
    } catch (error) {
      console.error('Error searching objects:', error);
      return [];
    }
  },

  command: ({ editor, range, props }) => {
    // Delete the trigger character (@) and query text, then insert the mention node
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'objectMention',
        attrs: {
          objectId: props.id,
          objectType: props.type,
          label: props.title,
        },
      })
      .run();
  },

  render: () => {
    let component;
    let popup;
    let currentItems = []; // Store current items for keyboard navigation
    let currentCommand = null; // Store current command function
    let latestClientRect = null;
    let scrollHandler = null;

    function repositionPopup() {
      if (!popup || !latestClientRect) return;
      const rect = latestClientRect();
      if (rect) {
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 4}px`;
      }
    }

    return {
      onStart: (props) => {
        // Create dropdown container
        popup = document.createElement('div');
        popup.className = 'object-mention-dropdown';

        // Set individual style properties for better debugging
        popup.style.position = 'fixed';
        popup.style.zIndex = '99999';
        popup.style.background = 'var(--background-color, #202124)';
        popup.style.border = '1px solid var(--border-color, #5f6368)';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        popup.style.maxHeight = '300px';
        popup.style.overflowY = 'auto';
        popup.style.minWidth = '200px';
        popup.style.maxWidth = '320px';
        popup.style.pointerEvents = 'auto';
        popup.style.visibility = 'visible';
        popup.style.display = 'block';
        popup.style.opacity = '1';

        document.body.appendChild(popup);

        // Position popup
        latestClientRect = props.clientRect;
        repositionPopup();

        // Keep popup anchored to cursor during scroll
        scrollHandler = repositionPopup;
        document.addEventListener('scroll', scrollHandler, true);

        // Store items and command for keyboard navigation
        currentItems = props.items || [];
        currentCommand = props.command;

        // Render items
        renderItems(props.items, props.command);
      },

      onUpdate: (props) => {
        if (!popup) return;

        // Store updated items and command
        currentItems = props.items || [];
        currentCommand = props.command;

        // Reposition
        latestClientRect = props.clientRect;
        repositionPopup();

        // Re-render items
        renderItems(props.items, props.command);
      },

      onKeyDown: (props) => {
        if (!popup) return false;

        const items = popup.querySelectorAll('.mention-item');
        if (items.length === 0) return false;

        const selected = popup.querySelector('.mention-item.selected');
        let selectedIndex = Array.from(items).indexOf(selected);

        if (props.event.key === 'ArrowDown') {
          props.event.preventDefault();
          props.event.stopPropagation();
          selectedIndex = selectedIndex < 0 ? 0 : Math.min(selectedIndex + 1, items.length - 1);
          updateSelection(items, selectedIndex);
          return true;
        }

        if (props.event.key === 'ArrowUp') {
          props.event.preventDefault();
          props.event.stopPropagation();
          selectedIndex = selectedIndex < 0 ? 0 : Math.max(selectedIndex - 1, 0);
          updateSelection(items, selectedIndex);
          return true;
        }

        if (props.event.key === 'Enter' || props.event.key === 'Tab') {
          props.event.preventDefault();
          props.event.stopPropagation();

          if (selectedIndex >= 0 && selectedIndex < currentItems.length && currentCommand) {
            const item = currentItems[selectedIndex];

            // Map item properties to ObjectMention node attributes
            const mentionAttrs = {
              id: item.id,
              objectId: item.id,
              objectType: item.type,
              label: item.title,
              title: item.title,
              type: item.type,
            };

            currentCommand(mentionAttrs);

            if (onSelect) {
              onSelect(item);
            }
          }
          return true;
        }

        if (props.event.key === 'Escape') {
          props.event.preventDefault();
          props.event.stopPropagation();
          return true;
        }

        return false;
      },

      onExit: () => {
        if (scrollHandler) {
          document.removeEventListener('scroll', scrollHandler, true);
          scrollHandler = null;
        }
        if (popup) {
          popup.remove();
          popup = null;
        }
      },
    };

    function updateSelection(items, index) {
      items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
      });
      // Scroll into view
      if (items[index]) {
        items[index].scrollIntoView({ block: 'nearest' });
      }
    }

    function renderItems(items, command) {
      if (!popup) return;

      if (items.length === 0) {
        popup.innerHTML = `
          <div style="padding: 12px; color: var(--text-secondary-color, #9aa0a6); font-size: 13px;">
            No results found
          </div>
        `;
        return;
      }

      popup.innerHTML = items.map((item, index) => {
        const typeIcon = getTypeIcon(item.type);
        const subtitle = getSubtitle(item);
        
        return `
          <div 
            class="mention-item ${index === 0 ? 'selected' : ''}" 
            data-index="${index}"
            style="
              padding: 6px 12px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 10px;
              border-bottom: 1px solid var(--border-transparent, rgba(255,255,255,0.1));
              transition: background-color 0.15s;
            "
          >
            <span style="font-size: 16px;">${typeIcon}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="
                font-size: 14px;
                color: var(--text-color, #e8eaed);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">${item.title}</div>
              ${subtitle ? `<div style="
                font-size: 12px;
                color: var(--text-secondary-color, #9aa0a6);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">${subtitle}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Add hover and click handlers
      popup.querySelectorAll('.mention-item').forEach((el, index) => {
        el.addEventListener('mouseenter', () => {
          updateSelection(popup.querySelectorAll('.mention-item'), index);
        });

        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const item = items[index];

          // Map item properties to ObjectMention node attributes
          const mentionAttrs = {
            id: item.id,
            objectId: item.id,
            objectType: item.type,
            label: item.title,
            title: item.title,
            type: item.type,
          };

          command(mentionAttrs);

          if (onSelect) {
            onSelect(item);
          }
        });

        // Prevent mousedown from bubbling (important for focus issues)
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      });

      // Add styles for selected state
      const style = document.createElement('style');
      style.textContent = `
        .mention-item:hover,
        .mention-item.selected {
          background-color: var(--button-bg, rgba(255,255,255,0.1)) !important;
        }
        .mention-item:last-child {
          border-bottom: none !important;
        }
      `;
      popup.appendChild(style);
    }

    function getTypeIcon(type) {
      const icons = {
        book: '📖',
        movie: '🎞️',
        show: '📺',
        attachment: '📎',
        link: '🔗',
      };
      return icons[type] || '📄';
    }

    function getSubtitle(item) {
      const source = item.metadata?.source || {};
      switch (item.type) {
        case 'book':
          return source.author || '';
        case 'movie':
          return source.director ? `Dir. ${source.director}` : (source.year || '');
        case 'attachment':
          return source.filename || '';
        default:
          return '';
      }
    }
  },
});
