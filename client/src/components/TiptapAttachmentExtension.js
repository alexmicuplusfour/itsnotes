import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import AttachmentCard from './AttachmentCard';

export const AttachmentExtension = Node.create({
  name: 'attachment',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
      },
      filename: {
        default: 'Unknown File',
      },
      size: {
        default: 0,
      },
      mimeType: {
        default: null,
      },
      uploading: {
        default: false,
      },
      progress: {
        default: 0,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="attachment"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'attachment' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentCard);
  },

  addProseMirrorPlugins() {
    const nodeType = this.name;
    return [
      new Plugin({
        key: new PluginKey('attachmentTrailingParagraph'),
        appendTransaction: (transactions, oldState, newState) => {
          // Only run if there was an actual change
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          const { doc, schema } = newState;
          const lastNode = doc.lastChild;

          // If the last node is this card type, add a trailing paragraph
          if (lastNode && lastNode.type.name === nodeType) {
            const paragraph = schema.nodes.paragraph.create();
            const tr = newState.tr.insert(doc.content.size, paragraph);
            return tr;
          }

          return null;
        },
      }),
    ];
  },
});
