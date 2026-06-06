import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { UUID_REGEX_EXACT } from './TiptapNoteReferenceMark';
import TiptapNoteReferenceCard from './TiptapNoteReferenceCard';

export const NoteReferenceCardNode = Node.create({
  name: 'noteReferenceCard',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: element => element.getAttribute('data-note-id'),
        renderHTML: attributes => {
          if (!attributes.noteId) {
            return {};
          }
          return {
            'data-note-id': attributes.noteId,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-note-reference-card]',
        getAttrs: element => {
          const noteId = element.getAttribute('data-note-id');
          return UUID_REGEX_EXACT.test(noteId) ? { noteId } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-note-reference-card': 'true' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TiptapNoteReferenceCard);
  },
});

export default NoteReferenceCardNode;
