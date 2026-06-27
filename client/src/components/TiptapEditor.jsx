// --- START OF FILE TiptapEditor.jsx ---

import React, { useEffect, useState, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline'; // Add this line
import Highlight from '@tiptap/extension-highlight';
import Heading from '@tiptap/extension-heading'; // Add this line
import TaskList from '@tiptap/extension-task-list';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import DetailsSummary from '@tiptap/extension-details-summary';
import DetailsContent from '@tiptap/extension-details-content';
import { CustomDetails } from './CustomDetailsExtension';
import TaskItemExtension from './TaskItemExtension';
import TabInsertExtension from './TabInsertExtension';
import { NoteReferenceMark, UUID_REGEX_EXACT, UUID_REGEX_GLOBAL } from './TiptapNoteReferenceMark';
import { prepareInlineImageInsert } from '../services/inlineImageResolver';
import { NotePreviewPlugin } from './TiptapNotePreviewPlugin';
import { NotePreviewExtension } from './TiptapNotePreviewExtension';
import { TiptapImageExtension } from './TiptapImageExtension';
import { TiptapSketchExtension } from './TiptapSketchExtension';
import TiptapBubbleMenu from './TiptapBubbleMenu';
import TiptapFixedMenu from './TiptapFixedMenu';
import TiptapDisabledMenu from './TiptapDisabledMenu';
import { AttachmentExtension } from './TiptapAttachmentExtension';
import { BookCardExtension } from './TiptapBookCardExtension';
import { MovieCardExtension } from './TiptapMovieCardExtension';
import { ObjectCardExtension } from './TiptapObjectCardExtension';
import { ObjectMention, createObjectMentionSuggestion } from './TiptapObjectMentionExtension';
import { TagMention, createTagMentionSuggestion } from './TiptapTagMentionExtension';
import TiptapReminderExtension from './TiptapReminderExtension';
import { AIPlaceholderExtension } from './TiptapAIPlaceholderExtension';
import { objectsApi } from '../services/api';
import styled from 'styled-components';
// Import DOMSerializer and Slice from prosemirror-model
import { DOMParser, Slice, DOMSerializer } from 'prosemirror-model';
// Import your conversion function (adjust path if necessary)
import { convertHtmlToPlainText } from '../utils/htmlToPlainText';
import { formatPlainTextPasteToHtml } from '../utils/textToHtml.js';
import { useUIPreferences } from "../contexts/UIPreferencesContext"; // Import UIPreferences for fullscreen setting

const EditorContainer = styled.div`
  position: relative;
  width: 100%;
  height: auto; /* Let content determine height, Form handles scrolling */
  min-height: 200px; /* Ensure minimum height for editor */
  display: flex;
  flex-direction: column;
  overflow: visible;

  .ProseMirror {
    min-height: 100px;
    outline: none;
    padding: 0;
    font-family: var(--note-body-font-family, 'Product Sans', Arial, sans-serif);
    font-size: var(--note-body-font-size, 16px);
    color: var(--text-color, inherit);
    line-height: 1.4;
    width: 100%;
    flex: 1;
    /* Disable internal scrolling - let parent handle scrolling */
    overflow-y: visible;
    overflow-x: hidden;
    white-space: pre-wrap;
    padding-bottom: ${props => props.$fullscreen ? '100px' : '50px'}; 
    padding-right: 14px;

    @media (max-width: 768px) {
      line-height: 1.3;
      padding-bottom: 230px;
    }

    &:focus {
      outline: none;
    }

    p {
      margin: 0;
      padding: 0px 0;
      min-height: 1.3em;
      white-space: pre-wrap;
      tab-size: 8;
    }

    p:first-child:empty::before {
        color: #9aa0a6;
        content: attr(data-placeholder);
        float: left;
        height: 0;
        pointer-events: none;
    }

    p:first-child:not(:empty)::before,
    p:not(:first-child)::before {
        display: none;
        content: none;
    }

    ul, ol {
      padding-left: 1.5rem;
    }

    /* Details extension styles */
    .details, details {
      border: 0px solid var(--border-transparent);
      border-radius: 8px;
      padding: 0.5rem;
      padding-bottom: 10px;
      padding-right: 16px;
      margin: 0.5rem 0;
      background-color: var(--fill-subtle);
      display: flex;
      gap: 0.4rem;
      font-size: 14px;
      line-height: 1.2;
    }

    .details p {
      margin-bottom: 8px;
    }

    /* The toggle button provided by the extension */
    .details > button {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem 0.4rem;
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--text-color, inherit);
      display: flex;
      align-items: flex-start;
      height: fit-content;
      margin-top: -3px; /* Optical alignment with text */
    }

    .details > button::before {
      content: '▶';
      display: inline-block;
      transition: transform 0.2s;
    }

    .details[open] > button::before, 
    details[open] > button::before,
    .details.is-open > button::before,
    .details:has([data-type="detailsContent"]:not([hidden])) > button::before {
      transform: rotate(90deg);
    }

    /* The wrapper for summary and content */
    .details > div {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .details summary, details summary {
      font-weight: 700;
      list-style: none;
      padding: 0.5rem 0;
      cursor: text;
      outline: none;
      min-height: 24px;
    }
    
    .details summary::marker, details summary::marker {
      display: none;
    }

    .details summary::before, details summary::before {
      display: none;
    }

    .details[open] summary, 
    details[open] summary,
    .details.is-open summary,
    .details:has([data-type="detailsContent"]:not([hidden])) summary {
      border-bottom: 1px solid var(--border-transparent);
      margin-bottom: 0.5rem;
    }

    div[data-type="detailsContent"], div[data-type="details-content"] {
        padding: 0;
    }

    /* Task list styles */
    ul[data-type="taskList"] {
      list-style: none;
      padding: 0;
      
      li {
        display: flex;
        align-items: flex-start;
        margin-bottom: 4px;
        
        > div {
          display: flex;
          align-items: flex-start;
          width: 100%;
        }
      }
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
      color: var(--text-color);
      opacity: 0.8;
    }

    code {
      background-color: var(--border-transparent);
      border-radius: 3px;
      padding: 0.2rem 0.2rem;
      font-family: monospace;
      line-height: 1.6;
      font-size: 14px;
    }

    /* Table styles */
    table.tiptap-table {
      border-collapse: collapse;
      margin: 1rem 0;
      width: 100%;
      table-layout: auto;
      font-size: 14px;
      overflow-x: auto;
      display: block;
      max-width: 100%;
    }

    table.tiptap-table th,
    table.tiptap-table td {
      border: 1px solid var(--border-transparent, rgba(128, 128, 128, 0.3));
      padding: 0.5rem 0.75rem;
      vertical-align: top;
      text-align: left;
      min-width: 80px;
    }

    table.tiptap-table th {
      background-color: var(--fill-subtle, rgba(128, 128, 128, 0.1));
      font-weight: 600;
    }

    table.tiptap-table tr:nth-child(even) td {
      background-color: var(--fill-subtle, rgba(128, 128, 128, 0.05));
    }

    table.tiptap-table p {
      margin: 0;
      min-height: auto;
    }

    /* Fix for cursor after inline images - Proper gapcursor styling */
    .ProseMirror-gapcursor {
      display: inline !important;
      pointer-events: none;
      position: relative;
    }

    .ProseMirror-gapcursor::after {
      content: '';
      display: block;
      position: absolute;
      top: -2px;
      width: 1px;
      height: 1.2em;
      background-color: var(--text-color, #000);
      animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
    }

    @keyframes ProseMirror-cursor-blink {
      to {
        visibility: hidden;
      }
    }

    /* Alternative cursor styling for dark themes */
    [data-theme="dark"] .ProseMirror-gapcursor::after {
      background-color: var(--text-color, #fff);
    }

    /* Ensure proper spacing after block elements */
    [data-type="inlineImage"] {
      margin-bottom: 0.5rem;
    }

    /* Ensure there's always space for cursor after last element */
    .ProseMirror > *:last-child {
      margin-bottom: 1.2em;
    }

    /* mention inline styles */
    span[data-type="object-mention"], span[data-type="tag-mention"] {
      background-color: var(--fill-subtle);
      color: var(--link, #8ab4f8);
      border-radius: 4px;
      padding: 1px 6px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s;
      /* Visual truncation only - full title is preserved in data */
      display: inline-block;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: bottom;
      
      &:hover {
        background-color: var(--button-bg);
      }
    }
  }
`;

// Helper function to find and mark UUIDs in editor content (Keep as is)
const findAndMarkUUIDs = (editor) => {
  if (!editor || editor.isDestroyed) return;

  const { doc, schema, tr: initialTr } = editor.state; // Get initial transaction
  const noteRefMark = schema.marks.noteReference;
  const linkMark = schema.marks.link; // Get link mark type
  if (!noteRefMark) {
    console.warn("[findAndMarkUUIDs] NoteReferenceMark schema not found.");
    return; // Cannot proceed without the mark schema
  }

  let tr = initialTr; // Start with the current state's transaction
  let hasChanges = false;

  // Function to check if a position range is inside a link mark
  const isInsideLink = (from, to) => {
    if (!linkMark) return false; // No link extension active
    let inside = false;
    // Check marks across the nodes within the range
    doc.nodesBetween(from, to, (node, pos) => {
      if (inside) return false; // Stop if already found inside a link
      // Check marks on the node itself
      if (node.marks && node.marks.some(m => m.type === linkMark)) {
        inside = true;
        return false; // Stop searching this branch
      }
      // Check marks at the starting boundary of the node if it's text
      // (Handles cases where range starts mid-link)
      if (!inside && node.isText) {
        const nodeStartPos = pos;
        const nodeEndPos = pos + node.nodeSize;
        // Check marks at the intersection points
        const checkFrom = Math.max(from, nodeStartPos);
        const marksAtPos = doc.resolve(checkFrom).marks();
        if (marksAtPos.some(m => m.type === linkMark)) {
          inside = true;
          return false;
        }
      }
    });
    // Final check: Marks directly at the start position (covers zero-width ranges)
    if (!inside && doc.resolve(from).marks().some(m => m.type === linkMark)) {
      inside = true;
    }
    return inside;
  };

  // Function to check if a position already has a noteReference mark
  const hasNoteReferenceMark = (pos) => {
    // Check marks exactly at the starting position
    const marks = doc.resolve(pos).marks();
    return marks.some(m => m.type === noteRefMark);
  };

  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text;
      if (!text) return false; // Skip empty text nodes

      // Use the UPDATED UUID_REGEX_GLOBAL with word boundaries
      UUID_REGEX_GLOBAL.lastIndex = 0; // Reset regex state before each use

      let match;
      while ((match = UUID_REGEX_GLOBAL.exec(text)) !== null) {
        const uuid = match[1]; // The captured UUID group
        const matchStartIndex = match.index; // Start index within the node's text
        const start = pos + matchStartIndex; // Absolute start position in document
        const end = start + uuid.length; // Absolute end position in document

        // *** CRITICAL CHECKS ***:
        // 1. Is it already marked as a note reference?
        // 2. Is it inside an existing link?
        if (!hasNoteReferenceMark(start) && !isInsideLink(start, end)) {
          // console.log(`[findAndMarkUUIDs] Found UUID "${uuid}" at [${start}-${end}], not inside link. Applying mark.`);
          // Add mark using the current transaction
          tr = tr.addMark(
            start,
            end,
            noteRefMark.create({ 'data-note-uuid': uuid })
          );
          hasChanges = true;
        }
        // Optional logs removed for brevity
      }
    }
    return true; // Continue traversal
  });

  // Apply the transaction ONLY if changes were made
  if (hasChanges) {
    // console.log('[findAndMarkUUIDs] Dispatching transaction to apply noteReference marks.');
    editor.view.dispatch(tr); // Dispatch the accumulated transaction
  }
};


// --- Define the custom serializer function using your converter ---
// Defined outside the component so it's not recreated on every render
const customClipboardTextSerializerImpl = (slice, view) => { // Need view to access schema
  if (!slice || slice.content.size === 0) {
    console.log("[customClipboardTextSerializer] Slice is empty.");
    return '';
  }

  try {
    // 1. Get the schema from the view state (needed by DOMSerializer)
    const schema = view.state.schema;
    if (!schema) {
      console.error("[customClipboardTextSerializer] Cannot get schema from view state.");
      return ''; // Cannot proceed without schema
    }

    // 2. Create a temporary, detached DOM node to render the slice into
    const tempDiv = document.createElement('div');

    // 3. Create a DOMSerializer instance for the editor's schema
    const serializer = DOMSerializer.fromSchema(schema);

    // 4. Serialize the slice's content fragment into the temporary node
    serializer.serializeFragment(slice.content, { document }, tempDiv);

    // 5. Get the generated HTML string from the temporary node
    const html = tempDiv.innerHTML;
    // Optional log: console.log("[customClipboardTextSerializer] Generated HTML from slice:", JSON.stringify(html));

    // 6. Use YOUR conversion function to get the desired plain text
    const plainText = convertHtmlToPlainText(html); // <<<<--- CALL YOUR FUNCTION
    // console.log("[customClipboardTextSerializer] Converted HTML to plain text:", JSON.stringify(plainText));

    return plainText;

  } catch (error) {
    console.error("[customClipboardTextSerializer] Error during serialization:", error);
    // Fallback to a very basic text extraction if the conversion fails
    return slice.content.textBetween(0, slice.content.size, '\n\n'); // Use double newline as basic fallback
  }
};
// --- End of custom serializer function definition ---


const TiptapEditor = forwardRef(({
  content = '',
  onUpdate = () => { },
  onFocus = () => { },
  onBlur = () => { },
  onSelectionUpdate = () => { },
  onTransaction = () => { }, // Add onTransaction prop
  onCreate = () => { }, // Fired with the editor instance when it's constructed
  onPaste = () => { },
  onImagePaste = () => { },
  onImageClick = () => { },
  onImageDelete = () => { },
  onTagSearch = null, // Function to search tags for #mention
  onTagSelect = null, // Function called when a tag is selected from #mention
  placeholder = 'Write something...',
  autoFocus = false
}, ref) => {
  const { fullscreenNoteForm } = useUIPreferences();

  const [editorReady, setEditorReady] = useState(false);

  // Keep helper functions as they were
  const isContentEmpty = (htmlContent) => {
    if (!htmlContent) return true;
    const trimmedContent = htmlContent.trim();
    return trimmedContent === '' || /^(<p>\s*<\/p>|<p class="is-empty">\s*<\/p>)+$/i.test(trimmedContent);
  };

  // Memoize getCleanHTML to avoid recalculating on every render
  const getCleanHTML = useCallback((editor) => {
    if (!editor || editor.isEmpty) {
      return '';
    }
    let html = editor.getHTML();
    if (isContentEmpty(html)) {
      return '';
    }
    if (html && !html.match(/^<(p|ul|ol|h[1-6]|blockquote|pre|div)/i)) {
      html = `<p>${html}</p>`;
    }
    if (typeof html === 'string') {
      html = html.replace(/<p>(\s*)<p>/g, '<p>$1')
        .replace(/<\/p>(\s*)<\/p>/g, '</p>$1');
      html = html.replace(/<p><p>/g, '<p>')
        .replace(/<\/p><\/p>/g, '</p>');
      html = html.replace(/<p><p class="is-empty"><\/p><\/p>/g, '<p></p>')
        .replace(/<p><p><\/p><\/p>/g, '<p></p>');
      html = html.replace(/<p class="is-empty"><\/p>/g, '<p></p>');
      html = html.replace(/<p[^>]*>\s*<br[^>]*>\s*<\/p>/gi, '<p></p>');
      // Strip upload-in-progress placeholder nodes so they never reach the DB
      html = html.replace(/<img\b[^>]*\bdata-placeholder-id="[^"]*"[^>]*\/?>/gi, '');
    }
    return html;
  }, []);

  // Object mention search function with debouncing
  const handleObjectSearch = useCallback(async (query) => {
    try {
      const results = await objectsApi.search(query, null, 8);
      return results;
    } catch (error) {
      console.error('Error searching objects:', error);
      return [];
    }
  }, []);

  // Note: The suggestion plugin handles debouncing internally via its debounce option

  // Object mention selection callback
  const handleObjectSelect = useCallback((item) => {
    console.log('Object selected:', item);
    // Could be used to track analytics or update recent items
  }, []);

  // Tag mention extension - only add if onTagSearch is provided
  const tagMentionExtension = useMemo(() => {
    if (!onTagSearch) return null;
    return TagMention.configure({
      suggestion: createTagMentionSuggestion(onTagSearch, onTagSelect),
    });
  }, [onTagSearch, onTagSelect]);

  const extensions = useMemo(() => {
    const baseExtensions = [
    TiptapImageExtension,
    TiptapSketchExtension,
    AttachmentExtension,
    BookCardExtension,
    MovieCardExtension,
    ObjectCardExtension,
    ObjectMention.configure({
      suggestion: createObjectMentionSuggestion(handleObjectSearch, handleObjectSelect),
    }),
    TiptapReminderExtension,
    StarterKit.configure({
      hardBreak: {}, // Keep hardBreak extension
      heading: false, // Disable heading extension from StarterKit if you want to use custom levels
      gapcursor: true, // Explicitly enable gapcursor (though it's enabled by default)
    }),
    Placeholder.configure({
      placeholder,
      emptyEditorClass: 'is-empty',
      showOnlyWhenEditable: true,
      showOnlyCurrent: true,
      includeChildren: false,
      shouldShow: ({ editor, node, pos }) => {
        return editor.isEmpty && node.type.name === 'paragraph' && pos === 0;
      },
    }),
    Link.configure({
      openOnClick: true,
      autolink: true,
      inclusive: false, // Don't extend link to text typed after it
      validate: href => {
        try {
          const SIMPLE_URL_REGEX = /^(https?:\/\/|mailto:|tel:|notes:\/\/[^/]+\/[^/]+|\/|#)/i;
          return SIMPLE_URL_REGEX.test(href);
        } catch (e) {
          return false;
        }
      }
    }),
    Underline, // Add this line
    Highlight.configure({
      HTMLAttributes: {
        class: 'highlight',
      },
    }).extend({
      inclusive: false, // Don't extend highlight to new text typed at edges
    }),
    // Heading with markdown input rules disabled to avoid conflict with # tag mentions
    Heading.extend({
      addInputRules() {
        return []; // Disable markdown input rules (# space → heading)
      },
    }).configure({ levels: [1, 2, 3] }),
    Table.configure({
      resizable: false,
      HTMLAttributes: {
        class: 'tiptap-table',
      },
    }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItemExtension.configure({
      nested: true,
    }),
    CustomDetails.configure({
      persist: true,
      HTMLAttributes: {
        class: 'details',
      },
    }),
    DetailsSummary,
    DetailsContent,
    TabInsertExtension, // Tab insertion for regular text
    NoteReferenceMark, // Your custom mark extension
    NotePreviewExtension, // Preview cards for note references
    AIPlaceholderExtension, // AI processing placeholder
  ];

    // Add tag mention extension if onTagSearch is provided
    if (tagMentionExtension) {
      baseExtensions.push(tagMentionExtension);
    }

    return baseExtensions;
  }, [placeholder, tagMentionExtension, handleObjectSearch, handleObjectSelect]);

  const editor = useEditor({
    extensions,
    content,
    parseOptions: {
      preserveWhitespace: 'full',
    },
    onCreate: ({ editor }) => {
      onCreate(editor);
    },
    onUpdate: ({ editor, transaction }) => {
      // Skip if this was a programmatic content sync (not a user edit)
      // We set addToHistory: false when syncing external content
      if (transaction?.getMeta('addToHistory') === false) {
        return;
      }

      // An inline image removed by editor-native editing (backspace, cut,
      // select-all-delete) must still clean up its note_images row and gallery
      // entry. The trash button already drives that via its own event and tags
      // its strip with `imageRemovalHandled`, so skip those to avoid double-firing.
      if (transaction?.docChanged && !transaction.getMeta('imageRemovalHandled') && typeof onImageDelete === 'function') {
        const collectIds = (doc) => {
          const ids = new Set();
          doc.descendants((node) => {
            if (node.type.name === 'inlineImage') {
              const id = node.attrs['data-image-id'];
              if (id) ids.add(String(id));
            }
          });
          return ids;
        };
        const before = collectIds(transaction.before);
        if (before.size > 0) {
          const after = collectIds(transaction.doc);
          before.forEach((id) => {
            if (!after.has(id)) onImageDelete({ imageId: id });
          });
        }
      }

      const html = getCleanHTML(editor);
      if (html !== content) {
        // console.log("[TiptapEditor onUpdate] Content changed, emitting update:", JSON.stringify(html));
        onUpdate(html);
        if (editor.uuidScanTimeout) {
          clearTimeout(editor.uuidScanTimeout);
        }
        editor.uuidScanTimeout = setTimeout(() => {
          if (editor && !editor.isDestroyed) { // Check editor still valid
            findAndMarkUUIDs(editor);
          }
        }, 500);
      }
    },
    onFocus: (props) => {
      onFocus(props.event);
    },
    onBlur: ({ event }) => {
      onBlur(event);
    },
    onSelectionUpdate: ({ editor }) => {
      onSelectionUpdate(editor);
    },
    onTransaction: ({ editor, transaction }) => {
      if (onTransaction) {
        onTransaction({ editor, transaction });
      }
    },

    // --- START: UPDATED editorProps ---
    editorProps: {
      // Configure scroll margin for cursor visibility (3 lines of padding)
      scrollMargin: { top: 75, bottom: 75, left: 0, right: 0 },
      scrollThreshold: { top: 75, bottom: 75, left: 0, right: 0 },

      // --- USE THE NEW CUSTOM SERIALIZER ---
      clipboardTextSerializer: (slice, view) => {
        // Note: We can access the view parameter directly here
        return customClipboardTextSerializerImpl(slice, view);
      },
      // --- END CUSTOM SERIALIZER ---

      // --- Keep your existing handlePaste logic ---
      handlePaste(view, event, slice) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Helper to clean HTML from problematic sources like Foxit PDF Reader
        // Foxit adds trailing <br> tags after content within StartFragment/EndFragment
        const cleanPastedHtml = (html) => {
          if (!html) return html;
          
          // Extract content between StartFragment and EndFragment if present
          const fragmentMatch = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
          let content = fragmentMatch ? fragmentMatch[1] : html;
          
          // Remove trailing <br> tags (with any attributes/styles)
          // This pattern matches <br> tags that are followed only by whitespace until end or closing tags
          content = content.replace(/\s*<br[^>]*>\s*$/gi, '');
          
          // Also remove <br> tags that appear after </span> or other inline elements at the end
          content = content.replace(/(<\/(?:span|strong|em|b|i|u|a)[^>]*>)\s*<br[^>]*>\s*$/gi, '$1');
          
          // Trim whitespace
          content = content.trim();
          
          return content;
        };

        // Check for image files first - if found, handle them directly
        const items = clipboardData.items;
        if (items) {
          const imageFiles = [];
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              const file = item.getAsFile();
              if (file) {
                imageFiles.push(file);
              }
            }
          }

          if (imageFiles.length > 0) {
            console.log('[TiptapEditor handlePaste] Image files detected:', imageFiles.length);
            event.preventDefault(); // Prevent default paste behavior
            event.stopPropagation(); // Prevent event from bubbling up

            // Handle images directly if handler is provided
            if (onImagePaste && typeof onImagePaste === 'function') {
              console.log('[TiptapEditor handlePaste] Calling onImagePaste handler');
              imageFiles.forEach(file => {
                onImagePaste(file);
              });
              return true; // We handled the paste
            } else {
              console.warn('[TiptapEditor handlePaste] No onImagePaste handler provided');
              return false; // Let it try to bubble up
            }
          }
        }

        // Emit paste event to parent component via onPaste prop
        if (onPaste && typeof onPaste === 'function') {
          onPaste(true);
        }

        const text = clipboardData.getData('text/plain');
        const html = clipboardData.getData('text/html');

        // console.log("[TiptapEditor handlePaste] Pasted Text:", JSON.stringify(text));
        // console.log("[TiptapEditor handlePaste] Pasted HTML:", JSON.stringify(html));

        // Check if the entire string is a single URL (not multiple URLs or URL with other text)
        const looksLikeSingleUrl = (str) => {
          if (!str) return false;
          const trimmed = str.trim();
          // Must start with a URL protocol
          const SIMPLE_URL_LIKE_REGEX = /^(https?:\/\/|notes:\/\/[^/]+\/[^/]+|\/|#)/i;
          if (!SIMPLE_URL_LIKE_REGEX.test(trimmed)) return false;
          // Must not contain newlines
          if (trimmed.includes('\n')) return false;
          // Must not contain multiple URLs (check for second http:// or https://)
          const urlMatches = trimmed.match(/https?:\/\//gi);
          if (urlMatches && urlMatches.length > 1) return false;
          // Must not have comma followed by space and another URL-like pattern
          if (/,\s*https?:\/\//i.test(trimmed)) return false;
          return true;
        };

        const isProblematicHtml = !html || html.includes('<!---->');
        if (html && !isProblematicHtml) {
          // Clean the HTML to remove trailing <br> from sources like Foxit PDF
          const cleanedHtml = cleanPastedHtml(html);
          
          // Check if the HTML was modified (had trailing breaks removed)
          // We detect this by checking if original had StartFragment with trailing <br>
          const hadTrailingBr = /<!--StartFragment-->[\s\S]*<br[^>]*>\s*<!--EndFragment-->/i.test(html);
          
          if (hadTrailingBr && cleanedHtml) {
            // console.log("[TiptapEditor handlePaste] Cleaned Foxit-style HTML, handling manually.");
            event.preventDefault();
            
            try {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = cleanedHtml;
              const pmSchema = view.state.schema;
              const pmParser = DOMParser.fromSchema(pmSchema);
              const parsedContent = pmParser.parse(tempDiv);
              const insertSlice = parsedContent.content.size > 0
                ? parsedContent.slice(0)
                : Slice.empty;

              if (!insertSlice.empty) {
                view.dispatch(
                  view.state.tr.replaceSelection(insertSlice).scrollIntoView()
                );
                setTimeout(() => {
                  const editorInstance = view.state.editor;
                  if (editorInstance && !editorInstance.isDestroyed) {
                    findAndMarkUUIDs(editorInstance);
                  }
                }, 0);
              }
              return true;
            } catch (error) {
              console.error("[TiptapEditor handlePaste] Error parsing cleaned HTML:", error);
              return false;
            }
          }
          
          // console.log("[TiptapEditor handlePaste] HTML found, letting Tiptap default handle.");
          setTimeout(() => {
            const editorInstance = view.state.editor;
            if (editorInstance && !editorInstance.isDestroyed) {
              findAndMarkUUIDs(editorInstance);
            }
          }, 50);
          return false; // Let default behavior proceed
        }

        if (text && !html && looksLikeSingleUrl(text)) {
          // Handle single URL paste manually to ensure it renders as a link immediately (fixes mobile issue)
          event.preventDefault();
          const trimmedUrl = text.trim();
          
          // Insert the URL as a link directly
          const { state } = view;
          
          // Create a link mark with the URL
          const linkMark = state.schema.marks.link.create({ href: trimmedUrl });
          const textNode = state.schema.text(trimmedUrl, [linkMark]);
          
          // Insert the linked text and add a space after to break out of the link
          const spaceNode = state.schema.text(' ');
          const tr = state.tr.replaceSelectionWith(textNode, false);
          
          // Insert a space after the link to ensure cursor exits the link mark
          const insertPos = tr.selection.from;
          tr.insert(insertPos, spaceNode);
          
          view.dispatch(tr.scrollIntoView());
          
          setTimeout(() => {
            const editorInstance = view.state.editor;
            if (editorInstance && !editorInstance.isDestroyed) {
              findAndMarkUUIDs(editorInstance);
            }
          }, 50);
          return true; // We handled the paste
        }

        if (text) {
          // console.log("[TiptapEditor handlePaste] Handling via custom text formatter.");
          event.preventDefault();

          const generatedHtml = formatPlainTextPasteToHtml(text);
          // console.log("[TiptapEditor handlePaste] Generated HTML:", generatedHtml);

          try {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = generatedHtml;
            const pmSchema = view.state.schema;
            const pmParser = DOMParser.fromSchema(pmSchema);
            const parsedContent = pmParser.parse(tempDiv);
            const insertSlice = parsedContent.content.size > 0
              ? parsedContent.slice(0)
              : Slice.empty;

            if (!insertSlice.empty) {
              view.dispatch(
                view.state.tr.replaceSelection(insertSlice).scrollIntoView()
              );
              // console.log("[TiptapEditor handlePaste] Custom formatted content inserted.");
              setTimeout(() => {
                const editorInstance = view.state.editor;
                if (editorInstance && !editorInstance.isDestroyed) {
                  findAndMarkUUIDs(editorInstance);
                }
              }, 0);
            } else {
              // console.log("[TiptapEditor handlePaste] Parsing generated HTML resulted in empty slice.");
            }
            return true; // We handled the paste

          } catch (error) {
            console.error("[TiptapEditor handlePaste] Error parsing/inserting:", error);
            return false; // Fallback on error
          }
        }

        // console.log("[TiptapEditor handlePaste] Final fallback.");
        return false;
      },
      // Add other editorProps here if needed
    }
    // --- END: UPDATED editorProps ---
  });

  // Consolidated content sync effect - runs when content prop changes
  // Replaces two previous duplicate sync effects
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // Fast path: while the user is typing, the editor owns the source of
    // truth. Skip the comparison (and the expensive getCleanHTML) entirely
    // — we'd bail at the !editor.isFocused check anyway.
    if (editor.isFocused) return;

    const currentEditorHTML = getCleanHTML(editor);
    let incomingHTML = isContentEmpty(content) ? '' : content;

    // Normalize incoming HTML
    if (typeof incomingHTML === 'string') {
      incomingHTML = incomingHTML.replace(/<p class="is-empty"><\/p>/g, '<p></p>');
      incomingHTML = incomingHTML.replace(/ {2,}/g, (match) => ' '.repeat(match.length));
    }

    // Only sync if content actually changed (editor focus already handled above)
    if (incomingHTML !== currentEditorHTML) {
      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = incomingHTML || '<p></p>';

        const parsedContent = DOMParser.fromSchema(editor.schema).parse(tempDiv);
        const tr = editor.state.tr
          .setMeta('addToHistory', false)
          .replaceWith(0, editor.state.doc.content.size, parsedContent.content);

        editor.view.dispatch(tr);

        // Scan for UUIDs after loading new content
        setTimeout(() => {
          if (editor && !editor.isDestroyed) {
            findAndMarkUUIDs(editor);
          }
        }, 50);
      } catch (error) {
        console.warn('[TiptapEditor] Error setting content via transaction:', error);
        // Fallback - but this will add to history
        editor.commands.setContent(incomingHTML, false, { preserveWhitespace: 'full' });
      }
    }
  }, [content, editor]); // Removed getCleanHTML from dependencies - it's stable with useCallback

  // Expose editor instance via ref
  useImperativeHandle(ref, () => {
    console.log('[TiptapEditor] useImperativeHandle called, editor available:', !!editor, 'isDestroyed:', editor?.isDestroyed);
    return {
      getEditor: () => {
        console.log('[TiptapEditor] getEditor called, returning:', !!editor, 'isDestroyed:', editor?.isDestroyed);
        return (editor && !editor.isDestroyed) ? editor : null;
      },
      getScrollableElement: () => {
        // Return the ProseMirror element which is the scrollable container
        if (editor && !editor.isDestroyed && editor.view && editor.view.dom) {
          return editor.view.dom;
        }
        return null;
      },
      clearHistory: () => {
        if (editor && !editor.isDestroyed && editor.can().clearHistory) {
          console.log('[TiptapEditor] Clearing undo/redo history');
          editor.commands.clearHistory();
          return true;
        }
        return false;
      },
      insertInlineImage: (imageData) => {
        if (editor && !editor.isDestroyed) {
          console.log('[TiptapEditor] Inserting inline image:', imageData);
          const { src, imageId } = prepareInlineImageInsert(imageData);
          return editor.commands.insertImage({
            src,
            alt: imageData.alt || imageData.name || 'Image',
            title: imageData.title || imageData.name,
            'data-image-id': imageId,
          });
        }
        return false;
      },
      insertSketchCanvas: () => {
        if (editor && !editor.isDestroyed) {
          return editor.commands.insertSketchCanvas();
        }
        return false;
      },
      createReminder: async (reminderData) => {
        if (editor && !editor.isDestroyed) {
          const { matched_text, reminder, reformatted_content } = reminderData;

          if (!matched_text) {
            console.warn('createReminder: No matched text to replace');
            return false;
          }

          const doc = editor.state.doc;
          let found = false;
          let from = 0;
          let to = 0;

          // Find the text to replace
          doc.descendants((node, pos) => {
            if (found || !node.isText) return;
            const index = node.text.indexOf(matched_text);
            if (index !== -1) {
              from = pos + index;
              to = from + matched_text.length;
              found = true;
              return false; // Stop traversal
            }
          });

          if (found) {
            // Determine replacement text
            // If we have reformatted content from AI, use that prefixed with bell
            // Otherwise fallback to matched_text (shouldn't happen with new backend)
            const replacementText = reformatted_content
              ? `🔔 ${reformatted_content}`
              : `🔔 ${matched_text}`;

            // Execute replacement in a single transaction
            editor.chain()
              .focus()
              // 1. Replace the original text with the new formatted text
              .deleteRange({ from, to })
              .insertContentAt(from, replacementText)
              // 2. Insert the reminder card after the new text
              // The new position is 'from' + length of replacement text
              .insertContentAt(from + replacementText.length, {
                type: 'reminderCard',
                attrs: {
                  rrule: reminder.rrule,
                  nextRunAt: reminder.next_run_at,
                  timezone: reminder.timezone,
                  matchedText: replacementText, // Update title to match new text (used as intention fallback)
                  scheduleSummary: reminderData.schedule_summary, // Bind new attribute
                  reminderId: reminder.id // Pass ID for deletion
                }
              })
              .run();

            return true;
          } else {
            console.warn('createReminder: Matched text not found in document', matched_text);
          }
        }
        return false;
      },
    };
  }, [editor]);

  // Set up event listeners for image events from TiptapImageExtension
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.view && editor.view.dom) {
      const editorElement = editor.view.dom;

      const handleImageClick = (event) => {
        console.log('[TiptapEditor] Image click event received:', event.detail);
        if (typeof onImageClick === 'function') {
          onImageClick(event.detail);
        }
      };

      const handleImageDelete = (event) => {
        console.log('[TiptapEditor] Image delete event received:', event.detail);
        if (typeof onImageDelete === 'function') {
          onImageDelete(event.detail);
        }
      };

      // Add event listeners
      editorElement.addEventListener('imageClick', handleImageClick);
      editorElement.addEventListener('imageDelete', handleImageDelete);

      // Cleanup event listeners
      return () => {
        editorElement.removeEventListener('imageClick', handleImageClick);
        editorElement.removeEventListener('imageDelete', handleImageDelete);
      };
    }
  }, [editor, onImageClick, onImageDelete]);

  // Initial UUID scan when editor becomes ready
  // Note: Removed content dependency to avoid scanning on every content change
  // UUID scanning now happens only on: 1) initial load, 2) paste events
  useEffect(() => {
    if (editor && !editor.isDestroyed && editorReady) {
      const timer = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          findAndMarkUUIDs(editor);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editor, editorReady]); // Removed 'content' dependency for performance

  useEffect(() => {
    if (editor) {
      setEditorReady(true);
      editor.commands.setTextSelection(editor.state.doc.content.size);
      if (autoFocus) {
        setTimeout(() => {
          if (editor && !editor.isDestroyed) {
            editor.commands.focus('end');
          }
        }, 50);
      }
      return () => {
        // Check if editor exists and is not destroyed before destroying
        if (editor && !editor.isDestroyed) {
          editor.destroy();
        }
      };
    }
    // Add explicit return for case where editor is null initially
    return undefined;
  }, [editor, autoFocus]);

  // Removed: Duplicate content sync effect
  // Content syncing is now handled by the consolidated effect above (lines 936-976)


  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768); // Initialize directly

  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = window.innerWidth <= 768;
      if (newIsMobile !== isMobile) {
        setIsMobile(newIsMobile); // Update state first
        // Tippy cleanup might be less critical now, but keep if needed
        if (editor && !editor.isDestroyed) {
          try {
            editor.view.dom.blur();
            document.querySelectorAll('[data-tippy-root]').forEach(instance => instance.remove());
          } catch (e) { console.warn("Minor error during resize cleanup:", e); }
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [editor, isMobile]); // Dependencies remain

  const [hasError, setHasError] = useState(false);
  const [showMenus, setShowMenus] = useState(false);

  // Simplified menu management - show menus when editor is ready
  useEffect(() => {
    if (editor && editorReady && !hasError) {
      const timer = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          setShowMenus(true);
        }
      }, 100);

      return () => {
        clearTimeout(timer);
        setShowMenus(false);
      };
    } else {
      setShowMenus(false);
    }
  }, [editor, editorReady, hasError]); // Removed isMobile dependency for less re-renders

  // Separate effect for Tippy cleanup on mobile changes
  useEffect(() => {
    // Cleanup Tippy instances when switching between mobile/desktop
    try {
      document.querySelectorAll('[data-tippy-root]').forEach(instance => {
        instance._tippy?.destroy();
      });
    } catch (e) { /* ignore */ }
  }, [isMobile]);

  useEffect(() => {
    if (editor) {
      setHasError(false); // Reset error if editor instance becomes available/changes
    }
  }, [editor]);

  // --- Main render logic ---
  try {
    // Render null if editor isn't ready yet to prevent rendering menus/content too early
    if (!editor) {
      return null; // Or a loading indicator
    }

    return (
      <EditorContainer $fullscreen={fullscreenNoteForm}>
        {/* Conditionally render menus */}
        {editorReady && showMenus && !hasError && (
          isMobile
            ? <TiptapFixedMenu editor={editor} />
            : <div> {/* Wrap BubbleMenu in a div */}
              <TiptapBubbleMenu editor={editor} />
            </div>
        )}
        {editorReady && hasError && (
          <TiptapDisabledMenu />
        )}

        {/* Editor Content Area */}
        <EditorContent
          editor={editor}
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden'
          }}
          onError={(error) => {
            console.error('Error encountered within EditorContent:', error);
            if (!hasError) {
              setHasError(true);
            }
          }}
        />
      </EditorContainer>
    );
  } catch (err) {
    console.error('Error rendering TiptapEditor component:', err);
    if (!hasError) { // Ensure state is updated even if error is caught here
      setHasError(true);
    }
    // Fallback UI
    return (
      <EditorContainer>
        <TiptapDisabledMenu />
        <div style={{ padding: '1rem', color: 'red', flex: 1 }}>
          Editor failed to render. Please check console.
        </div>
      </EditorContainer>
    );
  }
});

export default TiptapEditor;
// --- END OF FILE TiptapEditor.jsx ---