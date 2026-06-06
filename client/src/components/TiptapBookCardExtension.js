import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import BookCard from './BookCard';

export const BookCardExtension = Node.create({
  name: 'bookCard',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      title: {
        default: null,
      },
      author: {
        default: null,
      },
      cover: {
        default: null,
      },
      description: {
        default: null,
      },
      pages: {
        default: null,
      },
      rating: {
        default: null,
      },
      url: {
        default: null,
      },
      current_page: {
        default: null,
      },
      total_pages: {
        default: null,
      },
      published_year: {
        default: null,
      },
      is_finished: {
        default: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="book-card"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'book-card' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookCard);
  },

  addProseMirrorPlugins() {
    const nodeType = this.name;
    return [
      new Plugin({
        key: new PluginKey('bookCardTrailingParagraph'),
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
