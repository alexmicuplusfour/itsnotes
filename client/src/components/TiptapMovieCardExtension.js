import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import MovieCard from './MovieCard';

export const MovieCardExtension = Node.create({
  name: 'movieCard',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      title: {
        default: null,
      },
      director: {
        default: null,
      },
      poster: {
        default: null,
      },
      year: {
        default: null,
      },
      rating: {
        default: null,
      },
      url: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="movie-card"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'movie-card' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MovieCard);
  },

  addProseMirrorPlugins() {
    const nodeType = this.name;
    return [
      new Plugin({
        key: new PluginKey('movieCardTrailingParagraph'),
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
