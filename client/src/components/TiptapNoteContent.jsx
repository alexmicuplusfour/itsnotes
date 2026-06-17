import React, { useState, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle, useContext, useCallback } from 'react'; // Added useContext
import { useNavigate, useLocation } from 'react-router-dom';
import TiptapEditor from './TiptapEditor';
import styled from 'styled-components';
import { formatPlainTextPasteToHtml } from '../utils/textToHtml.js';
import { setOpenNoteHandler } from './TiptapNoteReferenceMark';
import { useNotes } from "../contexts/NotesContext";
import { useNavigation } from '../navigation'; // NEW: Use centralized navigation
import { DOMParser } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import { scrollEditorSelectionIntoView } from '../utils/editorScroll';

const EditorWrapper = styled.div`
  width: 100%;
  height: auto; /* Let content determine height, Form handles scrolling */
  min-height: 140px;
  cursor: text;
  display: flex;
  flex-direction: column;
  overflow: visible;

  .ProseMirror {
    scrollbar-width: thin;
    flex: 1;
    /* Disable internal scrolling - let parent Form handle scrolling */
    overflow-y: visible !important;
    overflow-x: hidden;
    /* Ensure content expands to fill available space */
    min-height: 200px;

    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: rgba(0, 0, 0, 0.3);
    }
  }
`;

// Helper function to process plain text content into HTML paragraphs
// This must be defined outside the component to avoid recreation on each render
const processInitialContent = (rawContent) => {
  if (!rawContent) return '';
  
  // Check if content is plain text (no block-level HTML tags) and contains newlines
  const isPlainText = typeof rawContent === 'string' &&
    !rawContent.match(/<(p|ul|ol|h[1-6]|blockquote|pre|div)(\s|>)/i) &&
    rawContent.includes('\n');
  
  if (isPlainText) {
    console.log("[TiptapNoteContent] Processing plain text initialContent during initialization.");
    return formatPlainTextPasteToHtml(rawContent);
  }
  
  return rawContent;
};

const TiptapNoteContent = React.memo(forwardRef(({
  initialContent = '',
  placeholder = 'Take a note...',
  onBlur = () => { },
  onFocus = () => { },
  onChange = () => { },
  onSave = () => { },
  onSelectionUpdate = () => { },
  onStateChange = () => { }, // Add onStateChange prop for undo/redo state
  onPaste = () => { }, // Added onPaste prop
  onImagePaste, // Add new prop for image handling
  onImageClick, // Add new prop for image click handling
  onImageDelete, // Add new prop for image delete handling
  onTagSearch = null, // Function to search tags for #mention
  onTagSelect = null, // Function called when a tag is selected from #mention
  autoFocus = false,
  style = {},
  onMount = () => { }, // Add onMount prop
  initialScrollRatio = null, // Add initialScrollRatio prop
  scrollableRef = null, // Ref to external scrollable container (e.g., Form)
}, ref) => {
  // Use lazy initializer to process content BEFORE first render.
  // This `content` state only updates from EXTERNAL paths (initialContent
  // prop change, setValue from imperative ref, restore-version, URL
  // extraction). When the editor itself is the source — i.e. user typing —
  // we DON'T setState here, because Tiptap already owns the canonical
  // state. Re-rendering this wrapper per keystroke would only feed a stale
  // `content` prop back into TiptapEditor and re-run its sync effect for
  // no benefit. The freshest HTML lives in `liveContentRef`.
  const [content, setContent] = useState(() => processInitialContent(initialContent));
  const liveContentRef = useRef(content);
  const [isFocused, setIsFocused] = useState(false);
  const editorWrapperRef = useRef(null); // Ref for the styled wrapper
  const editorRef = useRef(null); // Ref for the editor instance

  // Keep liveContentRef synced when external paths change `content` state.
  useEffect(() => {
    liveContentRef.current = content;
  }, [content]);
  //const { openNoteById } = useContext(useNotes);

  const { openNoteById } = useNotes();
  const navigate = useNavigate();
  const location = useLocation();

  // NEW: Use centralized navigation system
  const { openReferencedNote, updateScrollPosition } = useNavigation();

  // Handle initial scroll restoration
  useLayoutEffect(() => {
    if (initialScrollRatio !== null && initialScrollRatio >= 0) {
      // We need to wait for the editor to be rendered and have content
      // Tiptap might take a tick to render content
      let attempts = 0;
      const attemptScroll = () => {
        attempts++;
        // Use external scrollable ref if provided, otherwise fallback to ProseMirror
        const scrollEl = scrollableRef?.current || editorWrapperRef.current?.querySelector('.ProseMirror');

        // Check if scroll element exists. 
        // If it exists, we try to scroll. If content loads later and changes height, 
        // the user might see a jump, but usually Tiptap renders initial content fast.
        // We add a small check for scrollHeight to ensure it's not completely empty if possible,
        // but don't block forever.
        if (scrollEl && (scrollEl.scrollHeight > scrollEl.clientHeight || attempts > 5)) {
          const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.offsetHeight);
          const targetScrollTop = initialScrollRatio * maxScrollTop;
          console.log(`[TiptapNoteContent] Restoring scroll ratio: ${initialScrollRatio} -> ${targetScrollTop}px (max: ${maxScrollTop})`);
          scrollEl.scrollTop = targetScrollTop;
        } else {
          // If content not ready, try again in next frame
          if (attempts < 20) { // Stop after ~300ms
            requestAnimationFrame(attemptScroll);
          }
        }
      };

      attemptScroll();
    }
  }, [initialScrollRatio, scrollableRef]);

  // Connect the note reference click handler to openNoteById
  useEffect(() => {
    // Set the handler function to open the note when a reference is clicked
    setOpenNoteHandler(noteRef => {
      // NEW: Get current scroll position to save before navigating
      const scrollEl = scrollableRef?.current || editorWrapperRef.current?.querySelector('.ProseMirror');
      let currentScrollPosition = 0;

      if (scrollEl) {
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (maxScroll > 0) {
          currentScrollPosition = scrollEl.scrollTop;
          console.log(`[TiptapNoteContent] Current scroll position: ${currentScrollPosition}px`);
        }
      }

      // Parse target note ID and scroll position from reference
      let targetNoteId = noteRef;
      let targetScrollTop = 0;

      if (noteRef.includes('#')) {
        const parts = noteRef.split('#');
        targetNoteId = parts[0];
        targetScrollTop = parseInt(parts[1], 10) || 0;
      }

      console.log(`[TiptapNoteContent] Opening referenced note: ID=${targetNoteId}, Scroll=${targetScrollTop}`);

      // NEW: Use centralized navigation system
      // This automatically handles:
      // - Saving current note's scroll position to URL
      // - Pushing to note stack
      // - Preventing circular references
      openReferencedNote(targetNoteId, currentScrollPosition);
    });

    // Cleanup function to prevent potential memory leaks
    return () => {
      setOpenNoteHandler(() => {
        console.warn("Note reference clicked but handler was unmounted");
      });
    };
  }, [openReferencedNote, scrollableRef]);

  // Track the last processed initialContent to avoid unnecessary updates
  const lastProcessedInitialContentRef = useRef(initialContent);

  useEffect(() => {
    // Skip if initialContent hasn't actually changed (can happen with React strict mode or other re-renders)
    if (initialContent === lastProcessedInitialContentRef.current) {
      return;
    }
    
    // Use the same processing function for consistency
    const processedContent = processInitialContent(initialContent || '');
    
    console.log("[TiptapNoteContent] initialContent changed, updating state with processed content:", processedContent);
    lastProcessedInitialContentRef.current = initialContent;
    setContent(processedContent);
  }, [initialContent]); // Dependency only on initialContent


  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    getValue: () => liveContentRef.current,
    setValue: (newContent) => {
      liveContentRef.current = newContent;
      setContent(newContent);
    },
    focus: (position = 'end') => { // Allow specifying focus position
      // Try to focus the editor using the TiptapEditor instance if possible
      // (Assuming TiptapEditor component might expose its editor instance via ref in the future)
      // For now, fallback to DOM query
      const editorEl = editorWrapperRef.current?.querySelector('.ProseMirror');
      if (editorEl) {
        // Tiptap's focus command is more reliable than element.focus()
        // but we don't have direct access to the editor instance here.
        // element.focus() might place cursor at the start.
        editorEl.focus();
        // Basic attempt to move cursor if possible (might not work consistently)
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editorEl);
          range.collapse(position === 'start' ? true : false); // true for start, false for end
          selection.removeAllRanges();
          selection.addRange(range);
        } catch (e) {
          console.warn("Could not precisely set cursor position on focus via ref.", e);
        }
      }
    },
    blur: () => {
      const editorEl = editorWrapperRef.current?.querySelector('.ProseMirror');
      if (editorEl) {
        editorEl.blur();
      }
    },
    isEmpty: () => {
      const c = liveContentRef.current;
      return c === '' || c === '<p></p>';
    },
    // Add undo method
    undo: () => {
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed) {
        editor.commands.undo();
        return true;
      }
      return false;
    },
    // Add redo method
    redo: () => {
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed) {
        editor.commands.redo();
        return true;
      }
      return false;
    },
    // Add clearHistory method
    clearHistory: () => {
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed && editor.can().clearHistory) {
        console.log('[TiptapNoteContent] Clearing undo/redo history');
        editor.commands.clearHistory();
        return true;
      }
      return false;
    },
    // Check if we can undo
    canUndo: () => {
      const editor = editorRef.current?.getEditor();
      return editor && !editor.isDestroyed ? editor.can().undo() : false;
    },
    // Check if we can redo
    canRedo: () => {
      const editor = editorRef.current?.getEditor();
      return editor && !editor.isDestroyed ? editor.can().redo() : false;
    },
    insertContent: (content) => {
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed) {
        // No .focus() — these inserts are triggered by action-bar buttons
        // (AI summarize, OCR, clipboard snippet). On mobile, focusing the
        // editor pops the keyboard, which is not what the user asked for.
        editor.commands.insertContent(content);
        // Block atom inserts (e.g. aiPlaceholder) leave a NodeSelection
        // covering the new node. Collapse so (a) the bubble/fixed menu
        // doesn't appear and (b) the next keystroke doesn't replace the
        // node.
        if (editor.state.selection instanceof NodeSelection) {
          editor.commands.setTextSelection(editor.state.selection.to);
        }
        // Scroll the new content into view. Deferred to next frame so
        // React-rendered node views have time to commit before we read
        // their DOM coords. Using scrollableRef directly is more reliable
        // than ProseMirror's scrollIntoView() — that one can scroll the
        // wrong ancestor when there are nested overflow rules.
        scrollEditorSelectionIntoView(editor, scrollableRef?.current);
        return true;
      }
      return false;
    },
    replaceText: (searchText, newContent) => {
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed) {
        const { doc } = editor.state;
        let pos = -1;

        try {
          doc.descendants((node, position) => {
            if (pos > -1) return false;
            if (node.isText && node.text && node.text.includes(searchText)) {
              pos = position + node.text.indexOf(searchText);
              return false;
            }
          });
        } catch (e) {
          console.error("Error searching text", e);
        }

        if (pos > -1) {
          editor.chain()
            .deleteRange({ from: pos, to: pos + searchText.length })
            .insertContentAt(pos, newContent)
            .run();
          return true;
        }
      }
      return false;
    },
    // Replace AI placeholder node with new content
    replaceAIPlaceholder: (placeholderText, newContent) => {
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed) {
        const { doc } = editor.state;
        let nodePos = -1;
        let nodeSize = 0;

        try {
          doc.descendants((node, position) => {
            if (nodePos > -1) return false;
            if (node.type.name === 'aiPlaceholder' && node.attrs.text === placeholderText) {
              nodePos = position;
              nodeSize = node.nodeSize;
              return false;
            }
          });
        } catch (e) {
          console.error("Error searching for AI placeholder", e);
        }

        if (nodePos > -1) {
          editor.chain()
            .deleteRange({ from: nodePos, to: nodePos + nodeSize })
            .insertContentAt(nodePos, newContent)
            .run();
          return true;
        }
      }
      return false;
    },
    get innerText() {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = liveContentRef.current;
      return tempDiv.innerText;
    },
    set innerText(value) {
      const html = `<p>${value}</p>`;
      liveContentRef.current = html;
      setContent(html);
    },
    get innerHTML() {
      return liveContentRef.current;
    },
    set innerHTML(value) {
      liveContentRef.current = value;
      setContent(value);
    },
    // Updated scrollTop getter/setter - use external scrollable ref if provided
    get scrollTop() {
      if (scrollableRef?.current) {
        return scrollableRef.current.scrollTop;
      }
      const editorEl = editorWrapperRef.current?.querySelector('.ProseMirror');
      return editorEl ? editorEl.scrollTop : 0;
    },
    set scrollTop(value) {
      if (scrollableRef?.current) {
        scrollableRef.current.scrollTop = value;
        return;
      }
      const editorEl = editorWrapperRef.current?.querySelector('.ProseMirror');
      if (editorEl) {
        editorEl.scrollTop = value;
      }
    },
    // Method to get the actual scrollable element - use external ref if provided
    getScrollableElement: () => {
      if (scrollableRef?.current) {
        return scrollableRef.current;
      }
      return editorWrapperRef.current?.querySelector('.ProseMirror');
    },
    // Method to get the editor instance
    getEditor: () => {
      const editor = editorRef.current?.getEditor?.();
      return editor;
    },
    // Method to insert an inline image
    insertInlineImage: (imageData) => {
      const editor = editorRef.current?.getEditor?.();
      if (editor && !editor.isDestroyed) {
        const result = editor.commands.insertImage({
          src: imageData.src || imageData.data || imageData.thumbnail,
          alt: imageData.alt || imageData.name || 'Image',
          title: imageData.title || imageData.name,
          'data-image-id': imageData.id,
        });
        // Block atom — collapse the NodeSelection so the bubble menu
        // doesn't pop and the cursor lands after the image.
        if (editor.state.selection instanceof NodeSelection) {
          editor.commands.setTextSelection(editor.state.selection.to);
        }
        // Scroll the new image into view (without focusing).
        scrollEditorSelectionIntoView(editor, scrollableRef?.current);
        return result;
      }
      return false;
    },
    // Method to get inline image IDs from current content
    getInlineImageIds: () => {
      return syncInlineImages(liveContentRef.current);
    },
    // Method to debug all inline images in content
    debugInlineImages: () => {
      const editor = editorRef.current?.getEditor?.();
      if (editor && !editor.isDestroyed) {
        const { doc } = editor.state;
        const inlineImages = [];

        doc.descendants((node, pos) => {
          if (node.type.name === 'inlineImage') {
            inlineImages.push({
              pos,
              id: node.attrs['data-image-id'],
              src: node.attrs.src,
              alt: node.attrs.alt
            });
          }
        });

        console.log(`[TiptapNoteContent] Found ${inlineImages.length} inline images:`, inlineImages);
        return inlineImages;
      }
      return [];
    },
    // Method to remove inline images by ID
    removeInlineImageById: (imageId) => {
      const editor = editorRef.current?.getEditor?.();
      if (editor && !editor.isDestroyed) {
        const { doc, tr } = editor.state;
        let transaction = tr;
        let hasChanges = false;

        console.log(`[TiptapNoteContent] Looking for inline images with ID: ${imageId} (type: ${typeof imageId})`);

        // Convert imageId to string for comparison since HTML attributes are strings
        const imageIdStr = String(imageId);

        // Find and remove all inline images with this ID
        doc.descendants((node, pos) => {
          if (node.type.name === 'inlineImage') {
            const nodeImageId = node.attrs['data-image-id'];
            console.log(`[TiptapNoteContent] Found inline image at pos ${pos} with ID: ${nodeImageId} (type: ${typeof nodeImageId})`);

            if (nodeImageId === imageIdStr || nodeImageId === imageId) {
              console.log(`[TiptapNoteContent] Removing inline image at position ${pos} with ID ${nodeImageId}`);
              transaction = transaction.delete(pos, pos + node.nodeSize);
              hasChanges = true;
            }
          }
        });

        // Apply the transaction if we found inline images to remove
        if (hasChanges) {
          editor.view.dispatch(transaction);
          console.log(`[TiptapNoteContent] Removed inline image(s) with ID ${imageId} from content`);
          return true;
        } else {
          console.log(`[TiptapNoteContent] No inline images found with ID ${imageId}`);
        }
      } else {
        console.log(`[TiptapNoteContent] Editor not available for image removal`);
      }
      return false;
    },
    // Method to insert smart summary (parsed HTML into Details)
    insertSmartSummary: (placeholderText, summaryHtml) => {
      const editor = editorRef.current?.getEditor();
      if (editor && !editor.isDestroyed) {
        const { schema } = editor;

        // Find AI placeholder node position
        let nodePos = -1;
        let nodeSize = 0;
        const { doc } = editor.state;
        try {
          doc.descendants((node, position) => {
            if (nodePos > -1) return false;
            if (node.type.name === 'aiPlaceholder' && node.attrs.text === placeholderText) {
              nodePos = position;
              nodeSize = node.nodeSize;
              return false;
            }
          });
        } catch (e) {
          console.error("Error searching for AI placeholder", e);
        }

        if (nodePos > -1) {
          try {
            // Parse HTML to nodes
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = summaryHtml;
            const parser = DOMParser.fromSchema(schema);
            const parsedDoc = parser.parse(tempDiv);

            // Create JSON structure with parsed content
            const detailsJson = {
              type: 'details',
              attrs: { open: true },
              content: [
                {
                  type: 'detailsSummary',
                  content: [{ type: 'text', text: '✨ Summary' }]
                },
                {
                  type: 'detailsContent',
                  content: parsedDoc.toJSON().content
                }
              ]
            };

            editor.chain()
              .deleteRange({ from: nodePos, to: nodePos + nodeSize })
              .insertContentAt(nodePos, detailsJson)
              .run();
            return true;
          } catch (err) {
            console.error("Error inserting smart summary:", err);
          }
        }
      }
      return false;
    },
    // Method to create reminder
    createReminder: (reminderData) => {
      const editorComponent = editorRef.current;
      if (editorComponent && editorComponent.createReminder) {
        return editorComponent.createReminder(reminderData);
      }
      return false;
    },
  }), []); // Methods only read from stable refs/imports — allocate the handle once

  const handleUpdate = (newContent) => {
    // Hot path: avoid setContent here. Bumping the live ref + forwarding
    // up to onChange is enough — re-rendering this wrapper per keystroke
    // would only feed a stale `content` prop back into TiptapEditor and
    // re-run its sync effect for no benefit.
    if (liveContentRef.current !== newContent) {
      liveContentRef.current = newContent;
      onChange(newContent);
    }
  };

  const handleFocus = (event) => { // Pass event up
    setIsFocused(true);
    onFocus(event); // Call parent onFocus
  };

  const handleBlur = (event) => { // Pass event up
    // Check if the related target is part of the bubble menu or its tippy instance
    const isBubbleMenuInteraction =
      event?.relatedTarget instanceof Node && // Ensure relatedTarget is a Node
      (event.relatedTarget.closest?.('[data-tippy-root]') || // Tippy root check
        event.relatedTarget.closest?.('.tiptap-bubble-menu-button')); // Direct button check

    if (!isBubbleMenuInteraction) {
      setIsFocused(false);
      onBlur(event); // Call parent onBlur
      onSave(liveContentRef.current); // Trigger save on genuine blur
    }
  };

  const handlePaste = (isPaste) => {
    // Call any parent paste handler if provided
    if (typeof onPaste === 'function') {
      onPaste(isPaste);
    }
  };

  // Handle synchronization of inline images with the image manager
  const syncInlineImages = useCallback((htmlContent) => {
    if (!htmlContent || typeof htmlContent !== 'string') return [];

    // Extract image IDs from inline images in the content
    const imageIdRegex = /data-image-id="([^"]+)"/g;
    const inlineImageIds = [];
    let match;

    while ((match = imageIdRegex.exec(htmlContent)) !== null) {
      inlineImageIds.push(match[1]);
    }

    return inlineImageIds;
  }, []);

  // Custom error boundary simulation (basic)
  const [hasError, setHasError] = useState(false);

  // Reset error state when content changes
  useEffect(() => {
    setHasError(false);
  }, [content]);

  // Handle transaction events from editor to update undo/redo state
  const handleTransaction = useCallback(({ editor }) => {
    if (onStateChange) {
      onStateChange({
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
      });
    }
  }, [onStateChange]);

  if (hasError) {
    return (
      <EditorWrapper ref={editorWrapperRef} style={{ ...style }}>
        <div
          style={{ padding: '1rem', color: 'var(--text-color)' }}
          onClick={() => setHasError(false)}
        >
          Error displaying content. Click to try reloading.
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', opacity: 0.7, fontSize: '0.8em', marginTop: '1em' }}>
            {initialContent} {/* Show initial content on error */}
          </pre>
        </div>
      </EditorWrapper>
    );
  }

  try {
    // Assign the ref to the EditorWrapper styled component
    return (
      <EditorWrapper ref={editorWrapperRef} style={{ ...style }}>
        <TiptapEditor
          ref={editorRef} // Pass ref properly to forwardRef component
          onCreate={onMount} // Forward the editor instance once it's constructed
          content={content} // Pass current internal state
          onUpdate={handleUpdate}
          placeholder={placeholder}
          onFocus={handleFocus} // Use internal handler
          onBlur={handleBlur}   // Use internal handler
          onSelectionUpdate={onSelectionUpdate}
          onTransaction={handleTransaction} // Pass transaction handler for undo/redo state
          onPaste={handlePaste} // Pass paste handler
          onImagePaste={onImagePaste} // Pass image paste handler
          onImageClick={onImageClick} // Pass image click handler
          onImageDelete={onImageDelete} // Pass image delete handler
          onTagSearch={onTagSearch} // Pass tag search handler for #mention
          onTagSelect={onTagSelect} // Pass tag select handler for #mention
          autoFocus={autoFocus}
        />
      </EditorWrapper>
    );
  } catch (error) {
    console.error("[TiptapNoteContent] Error rendering editor:", error);
    setHasError(true);
    // You might want to return null or the fallback UI directly here too
    return ( // Return fallback UI immediately on catch
      <EditorWrapper ref={editorWrapperRef} style={{ ...style }}>
        <div style={{ padding: '1rem', color: 'var(--text-color)' }}>
          Error rendering editor.
        </div>
      </EditorWrapper>
    );
  }
}));

export default TiptapNoteContent;
