import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import ObjectCard from './ObjectCard';

export const ObjectCardExtension = Node.create({
  name: 'objectCard',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      objectId: {
        default: null,
      },
      // Store type for quick filtering/display without fetching
      objectType: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="object-card"]',
        getAttrs: (element) => {
          return {
            objectId: element.getAttribute('objectid'),
            objectType: element.getAttribute('objecttype'),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'object-card',
        objectid: node.attrs.objectId,
        objecttype: node.attrs.objectType,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ObjectCard);
  },

  addProseMirrorPlugins() {
    const nodeType = this.name;
    return [
      new Plugin({
        key: new PluginKey('objectCardTrailingParagraph'),
        appendTransaction: (transactions, oldState, newState) => {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          const { doc, schema } = newState;
          const lastNode = doc.lastChild;

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
