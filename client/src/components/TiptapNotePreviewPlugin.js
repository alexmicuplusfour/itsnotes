import React from 'react';
import ReactDOM from 'react-dom/client';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import TiptapNoteReferenceCard from './TiptapNoteReferenceCard';
import { getOpenNoteHandler } from './TiptapNoteReferenceMark';

const notePreviewPluginKey = new PluginKey('notePreview');

export const NotePreviewPlugin = () => {
  // Cache for storing widget DOM nodes and React roots
  const widgetCache = new Map();

  // Store view reference
  let editorView = null;

  // Create or retrieve a cached widget
  const createCachedPreviewWidget = (pos, noteId, key, from, to) => {
    let cached = widgetCache.get(key);
    if (!cached) {
      const dom = document.createElement('span');
      dom.className = 'tiptap-note-preview-widget';
      const root = ReactDOM.createRoot(dom);
      
      // Mutable object to store current positions
      const positionRef = { from, to };

      const handleNoteClick = (clickedNoteId) => {
        const handler = getOpenNoteHandler();
        if (handler) {
          handler(clickedNoteId);
        }
      };

      const handleDelete = (deletedNoteId) => {
        if (editorView) {
          const { state, dispatch } = editorView;
          const { tr } = state;
          
          // Delete the entire text content (UUID) from the document
          // This removes both the text and any marks on it
          // Use current positions from ref
          dispatch(tr.delete(positionRef.from, positionRef.to));
        }
      };

      // Defer rendering to avoid "Render methods should be a pure function" warning
      // when called during initial editor setup
      setTimeout(() => {
        root.render(
          React.createElement(TiptapNoteReferenceCard, {
            noteId: noteId,
            onClick: handleNoteClick,
            onDelete: handleDelete
          })
        );
      }, 0);
      
      cached = { dom, root, positionRef };
      widgetCache.set(key, cached);
    } else {
      // Update positions for existing cached widget
      cached.positionRef.from = from;
      cached.positionRef.to = to;
    }

    return Decoration.widget(pos, cached.dom, {
      key: key,
      side: 1,
    });
  };

  // Find all note references and create decorations
  const findNoteReferences = (doc) => {
    const ranges = [];
    
    doc.descendants((node, pos) => {
      if (!node.isText) return;
      const noteRefMark = node.marks.find(mark => mark.type.name === 'noteReference');
      if (noteRefMark) {
        const noteId = noteRefMark.attrs['data-note-uuid'];
        if (noteId) {
          ranges.push({ from: pos, to: pos + node.nodeSize, noteId });
        }
      }
    });

    if (ranges.length === 0) {
      return DecorationSet.empty;
    }

    const mergedRanges = ranges.reduce((acc, current) => {
      const previous = acc.length > 0 ? acc[acc.length - 1] : null;
      if (previous && previous.to === current.from && previous.noteId === current.noteId) {
        previous.to = current.to;
      } else {
        acc.push(current);
      }
      return acc;
    }, []);
    
    const noteIdCounts = new Map();
    const decorations = mergedRanges.map(range => {
      const count = noteIdCounts.get(range.noteId) || 0;
      noteIdCounts.set(range.noteId, count + 1);
      const key = `note-preview-${range.noteId}-${count}`;
      return createCachedPreviewWidget(range.to, range.noteId, key, range.from, range.to);
    });
    
    return DecorationSet.create(doc, decorations);
  };

  return new Plugin({
    key: notePreviewPluginKey,
    
    view(edView) {
      editorView = edView;
      return {
        update(view) {
          editorView = view;
        },
        destroy() {
          editorView = null;
        }
      };
    },
    
    state: {
      init(_, state) {
        return findNoteReferences(state.doc);
      },
      
      apply(tr, decorationSet, oldState, newState) {
        // Performance optimization: Only rebuild when document changes
        if (!tr.docChanged) {
          // No document changes (e.g., selection change) - just map decorations
          return decorationSet.map(tr.mapping, tr.doc);
        }

        // Always rebuild to ensure accuracy - this is necessary for proper editing
        const newSet = findNoteReferences(newState.doc);

        // Clean up removed decorations
        const oldKeys = new Set();
        decorationSet.find().forEach(deco => oldKeys.add(deco.spec.key));

        const newKeys = new Set();
        newSet.find().forEach(deco => newKeys.add(deco.spec.key));

        for (const key of oldKeys) {
          if (!newKeys.has(key)) {
            const cached = widgetCache.get(key);
            if (cached) {
              // Delay unmounting to avoid React warnings
              setTimeout(() => cached.root.unmount(), 0);
            }
            widgetCache.delete(key);
          }
        }

        return newSet;
      },
    },
    
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
};
