import { Node, mergeAttributes } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey, Plugin } from 'prosemirror-state';

// Handler for tag mention clicks - can be set from outside
let tagMentionClickHandler = (tagName, tagId) => {
  console.warn(`Tag mention clicked: ${tagName} (${tagId}). Implement setTagMentionClickHandler!`);
};

// Function to set the handler from outside (e.g., from NoteForm)
export const setTagMentionClickHandler = (handler) => {
  tagMentionClickHandler = handler;
};

// Function to get the current handler
export const getTagMentionClickHandler = () => {
  return tagMentionClickHandler;
};

// The inline tag mention node that gets inserted
export const TagMention = Node.create({
  name: 'tagMention',

  // High priority to intercept # before heading input rules
  priority: 101,

  group: 'inline',

  inline: true,

  selectable: false,

  atom: true,

  addAttributes() {
    return {
      tagId: {
        default: null,
        parseHTML: element => element.getAttribute('data-tag-id'),
        renderHTML: attributes => {
          if (!attributes.tagId) return {};
          return { 'data-tag-id': attributes.tagId };
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
        tag: 'span[data-type="tag-mention"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const label = node.attrs.label || '';

    return [
      'span',
      mergeAttributes(
        { 'data-type': 'tag-mention' },
        HTMLAttributes
      ),
      `#${label}`,
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
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
      // Click handler plugin for tag mentions
      new Plugin({
        props: {
          handleClick(view, pos, event) {
            // Check if we clicked on a tag mention element
            if (!(event.target instanceof HTMLElement)) return false;
            
            const mentionEl = event.target.closest('span[data-type="tag-mention"]');
            if (!mentionEl) return false;

            // Get the label and id from the data attributes
            const label = mentionEl.getAttribute('data-label');
            const tagId = mentionEl.getAttribute('data-tag-id');
            if (!label) return false;

            event.preventDefault();
            event.stopPropagation();
            
            // Call the click handler with the label and id
            tagMentionClickHandler(label, tagId);
            return true;
          },
        },
      }),
    ];
  },
});

// Suggestion plugin configuration factory
export const createTagMentionSuggestion = (onSearch, onSelect) => ({
  pluginKey: new PluginKey('tagMentionSuggestion'),
  char: '#',
  allowSpaces: false, // Tags typically don't have spaces
  allowedPrefixes: null, // Allow # anywhere (after any character or at start)

  items: async ({ query }) => {
    // Show all tags if query is empty (just typed #)
    try {
      const results = await onSearch(query);
      return results.slice(0, 10);
    } catch (error) {
      console.error('Error searching tags:', error);
      return [];
    }
  },

  command: ({ editor, range, props }) => {
    // Delete the trigger character (#) and query text, then insert the mention node
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'tagMention',
        attrs: {
          tagId: props.id,
          label: props.name,
        },
      })
      .run();
  },

  render: () => {
    let popup;
    let currentItems = []; // Store current items for keyboard navigation
    let currentCommand = null; // Store current command function

    return {
      onStart: (props) => {
        // Create dropdown container
        popup = document.createElement('div');
        popup.className = 'tag-mention-dropdown';

        // Set individual style properties
        popup.style.position = 'fixed';
        popup.style.zIndex = '99999';
        popup.style.background = 'var(--background-color, #202124)';
        popup.style.border = '1px solid var(--border-color, #5f6368)';
        popup.style.borderRadius = '8px';
        popup.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        popup.style.maxHeight = '300px';
        popup.style.overflowY = 'auto';
        popup.style.minWidth = '160px';
        popup.style.maxWidth = '280px';
        popup.style.pointerEvents = 'auto';
        popup.style.visibility = 'visible';
        popup.style.display = 'block';
        popup.style.opacity = '1';

        document.body.appendChild(popup);

        // Position popup
        const { clientRect } = props;
        if (clientRect) {
          const rect = clientRect();
          if (rect) {
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
          }
        }

        // Store items and command for keyboard navigation
        currentItems = props.items || [];
        currentCommand = props.command;

        // Render items
        renderItems(props.items, props.command, onSelect);
      },

      onUpdate: (props) => {
        if (!popup) return;

        // Store updated items and command
        currentItems = props.items || [];
        currentCommand = props.command;

        // Reposition
        const { clientRect } = props;
        if (clientRect) {
          const rect = clientRect();
          if (rect) {
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
          }
        }

        // Re-render items
        renderItems(props.items, props.command, onSelect);
      },

      onKeyDown: (props) => {
        if (!popup) return false;

        // Always capture Enter/Tab/Escape when popup is visible to prevent
        // Tiptap from interpreting # + Enter as a heading command
        if (props.event.key === 'Enter' || props.event.key === 'Tab') {
          props.event.preventDefault();
          props.event.stopPropagation();
          
          const items = popup.querySelectorAll('.tag-mention-item');
          if (items.length === 0) return true; // Just consume the event, don't do anything
          
          const selected = popup.querySelector('.tag-mention-item.selected');
          let selectedIndex = Array.from(items).indexOf(selected);

          if (selectedIndex >= 0 && selectedIndex < currentItems.length && currentCommand) {
            const item = currentItems[selectedIndex];

            // Map item properties to TagMention node attributes
            const mentionAttrs = {
              id: item.id,
              tagId: item.id,
              label: item.name,
              name: item.name,
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

        const items = popup.querySelectorAll('.tag-mention-item');
        if (items.length === 0) return false;

        const selected = popup.querySelector('.tag-mention-item.selected');
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

        return false;
      },

      onExit: () => {
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

    function renderItems(items, command, onSelect) {
      if (!popup) return;

      if (items.length === 0) {
        popup.innerHTML = `
          <div style="padding: 12px; color: var(--text-secondary-color, #9aa0a6); font-size: 13px;">
            No tags found
          </div>
        `;
        return;
      }

      popup.innerHTML = items.map((item, index) => {
        return `
          <div 
            class="tag-mention-item ${index === 0 ? 'selected' : ''}" 
            data-index="${index}"
            style="
              padding: 8px 12px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
              border-bottom: 1px solid var(--border-transparent, rgba(255,255,255,0.1));
              transition: background-color 0.15s;
            "
          >
            <span style="font-size: 14px; color: var(--link);">#</span>
            <div style="
              font-size: 14px;
              color: var(--text-color, #e8eaed);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">${item.name}</div>
          </div>
        `;
      }).join('');

      // Add hover and click handlers
      popup.querySelectorAll('.tag-mention-item').forEach((el, index) => {
        el.addEventListener('mouseenter', () => {
          updateSelection(popup.querySelectorAll('.tag-mention-item'), index);
        });

        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const item = items[index];

          // Map item properties to TagMention node attributes
          const mentionAttrs = {
            id: item.id,
            tagId: item.id,
            label: item.name,
            name: item.name,
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
        .tag-mention-item:hover,
        .tag-mention-item.selected {
          background-color: var(--button-bg, rgba(255,255,255,0.1)) !important;
        }
        .tag-mention-item:last-child {
          border-bottom: none !important;
        }
      `;
      popup.appendChild(style);
    }
  },
});
