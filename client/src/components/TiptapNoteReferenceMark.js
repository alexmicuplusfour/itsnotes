import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin } from 'prosemirror-state';

// Basic UUID regex with word boundaries (\b) added
// This helps prevent matching UUIDs embedded within words or URLs without spacing.
export const UUID_REGEX_GLOBAL = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi; // Capture group for the match

// Regex for exact match validation (usually doesn't need word boundaries)
export const UUID_REGEX_EXACT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Placeholder for the actual function to open a note.
let openNoteHandler = (uuid) => {
  console.warn(`Note reference clicked: ${uuid}. Implement openNoteHandler!`);
};

// Function to set the handler from outside
export const setOpenNoteHandler = (handler) => {
  openNoteHandler = handler;
};

// Function to get the current handler (for use by preview plugin)
export const getOpenNoteHandler = () => {
  return openNoteHandler;
};

export const NoteReferenceMark = Mark.create({
  name: 'noteReference',

  inclusive: false, // Changed from true to prevent mark continuation
  excludes: '',

  // Define attributes for the mark
  addAttributes() {
    return {
      'data-note-uuid': {
        default: null,
        parseHTML: element => element.getAttribute('data-note-uuid'),
        renderHTML: attributes => {
          // Only render the data-note-uuid attribute if it's present and valid
          if (!attributes['data-note-uuid'] || !UUID_REGEX_EXACT.test(attributes['data-note-uuid'])) {
            return {}; // Don't render the attribute if invalid/missing
          }
          return { 'data-note-uuid': attributes['data-note-uuid'] };
        },
        keepOnSplit: true,
      },
      // Class attribute definition
      class: {
        default: 'note-reference-link',
        parseHTML: element => element.getAttribute('class'),
        // renderHTML removed from here, handled in main renderHTML
      },
    };
  },

  // How to parse this mark from HTML
  parseHTML() {
    return [
      {
        // Primarily match based on the data attribute
        tag: 'span[data-note-uuid]',
        // Optional: Add `.note-reference-link` if class must be present on parse
        getAttrs: node => {
          if (typeof node === 'string') return false;
          const uuid = node.getAttribute('data-note-uuid');
          // Use the EXACT regex here for parsing specific attributes
          return UUID_REGEX_EXACT.test(uuid) ? { 'data-note-uuid': uuid } : false;
        },
      },
      {
        // Support legacy links if they were used, but render as span
        tag: 'a[data-note-uuid]',
        getAttrs: node => {
          if (typeof node === 'string') return false;
          const uuid = node.getAttribute('data-note-uuid');
          // Use the EXACT regex here for parsing specific attributes
          return UUID_REGEX_EXACT.test(uuid) ? { 'data-note-uuid': uuid } : false;
        },
      }
    ];
  },

  // How to render this mark as HTML
  renderHTML({ HTMLAttributes }) {
    const finalAttributes = { ...HTMLAttributes };

    // Step 1: Validate the essential data-note-uuid attribute
    if (!finalAttributes['data-note-uuid'] || !UUID_REGEX_EXACT.test(finalAttributes['data-note-uuid'])) {
      // If the UUID is missing or invalid, don't render the mark's span.
      console.warn('NoteReferenceMark: Invalid or missing UUID, not rendering span wrapper.', finalAttributes);
      return 0; // Render only content
    }

    // Step 2: Ensure the correct class is always set for rendering
    finalAttributes.class = 'note-reference-link';

    // Step 3: Render the span with validated attributes
    return ['span', mergeAttributes(this.options.HTMLAttributes, finalAttributes), 0]; // 0 means render content inside
  },

  // addPasteRules() remains removed to avoid conflict with custom paste handling

  // Add a ProseMirror plugin to handle clicks
  addProseMirrorPlugins() {
    // Note: We use the hardcoded class name 'note-reference-link' for the click check,
    // as `this.name` ('noteReference') might not always match the rendered class if customized.
    const targetClassName = 'note-reference-link';
    const markTypeName = this.name; // Use this to find the mark in the state

    return [
      new Plugin({
        props: {
          handleClick(view, pos, event) {
            const { state } = view;
            const { schema } = state;

            const range = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!range) return false;

            const $pos = state.doc.resolve(range.pos);
            // Find the mark by its type name in the schema
            const mark = schema.marks[markTypeName];
            if (!mark) return false; // Mark definition not found

            const markInstance = $pos.marks().find(m => m.type === mark);

            if (markInstance) {
              const uuid = markInstance.attrs['data-note-uuid'];
              // Check UUID validity and if the click target is within an element having the specific class
              if (uuid && event.target instanceof HTMLElement && event.target.closest(`.${targetClassName}`)) {
                event.preventDefault();
                event.stopPropagation();
                openNoteHandler(uuid);
                return true; // Click handled
              }
            }
            return false; // Click not handled by this plugin
          },
        },
      }),
    ];
  },
});
