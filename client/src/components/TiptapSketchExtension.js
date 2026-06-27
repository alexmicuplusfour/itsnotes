import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import SketchNodeView from './SketchNodeView';
import { Plugin, PluginKey } from 'prosemirror-state';

export const TiptapSketchExtension = Node.create({
  name: 'inlineSketch',
  group: 'block',
  atom: true,
  inline: false,
  content: '',

  addAttributes() {
    return {
      'data-sketch-id': {
        default: null,
        parseHTML: el => el.getAttribute('data-sketch-id'),
        renderHTML: attrs => attrs['data-sketch-id'] ? { 'data-sketch-id': attrs['data-sketch-id'] } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-sketch-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', HTMLAttributes];
  },

  addCommands() {
    return {
      insertSketchCanvas: () => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs: { 'data-sketch-id': null } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SketchNodeView);
  },

  addProseMirrorPlugins() {
    const nodeType = this.name;
    return [
      new Plugin({
        key: new PluginKey('inlineSketchTrailingParagraph'),
        appendTransaction: (transactions, _old, newState) => {
          if (!transactions.some(tr => tr.docChanged)) return null;
          const last = newState.doc.lastChild;
          if (last && last.type.name === nodeType) {
            return newState.tr.insert(newState.doc.content.size, newState.schema.nodes.paragraph.create());
          }
          return null;
        },
      }),
    ];
  },
});
