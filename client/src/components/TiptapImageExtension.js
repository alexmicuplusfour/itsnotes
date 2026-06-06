import { Node, mergeAttributes } from '@tiptap/core';
import { createRoot } from 'react-dom/client';
import React from 'react';
import Icon from "./Icons";
import { Plugin, PluginKey } from 'prosemirror-state';

export const TiptapImageExtension = Node.create({
  name: 'inlineImage',

  addOptions() {
    return {
      HTMLAttributes: {},
      allowBase64: true,
    };
  },

  inline: false, // Set to false for block-level images
  group: 'block',
  content: '',
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: element => element.getAttribute('src'),
        renderHTML: attributes => {
          if (!attributes.src) {
            return {};
          }
          return { src: attributes.src };
        },
      },
      alt: {
        default: null,
        parseHTML: element => element.getAttribute('alt'),
        renderHTML: attributes => {
          if (!attributes.alt) {
            return {};
          }
          return { alt: attributes.alt };
        },
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {};
          }
          return { title: attributes.title };
        },
      },
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width'),
        renderHTML: attributes => {
          if (!attributes.width) {
            return {};
          }
          return { width: attributes.width };
        },
      },
      height: {
        default: null,
        parseHTML: element => element.getAttribute('height'),
        renderHTML: attributes => {
          if (!attributes.height) {
            return {};
          }
          return { height: attributes.height };
        },
      },
      'data-image-id': {
        default: null,
        parseHTML: element => element.getAttribute('data-image-id'),
        renderHTML: attributes => {
          if (!attributes['data-image-id']) {
            return {};
          }
          return { 'data-image-id': attributes['data-image-id'] };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: element => ({
          src: element.getAttribute('src'),
          alt: element.getAttribute('alt'),
          title: element.getAttribute('title'),
          width: element.getAttribute('width'),
          height: element.getAttribute('height'),
          'data-image-id': element.getAttribute('data-image-id'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          style: 'max-width: 100%; height: auto; display: block; margin: 0.5rem 0; border-radius: 8px;',
        }
      ),
    ];
  },

  addCommands() {
    return {
      insertImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.style.cssText = 'position: relative; display: block; margin: 0.5rem 0; pointer-events: none; user-select: none;';
      
      const img = document.createElement('img');
      img.src = node.attrs.src;
      img.alt = node.attrs.alt || '';
      img.title = node.attrs.title || '';
      
      if (node.attrs.width) {
        img.width = node.attrs.width;
      }
      if (node.attrs.height) {
        img.height = node.attrs.height;
      }
      if (node.attrs['data-image-id']) {
        img.setAttribute('data-image-id', node.attrs['data-image-id']);
      }
      
      img.style.cssText = 'max-width: 100%; height: auto; border-radius: 8px; pointer-events: none; user-select: none;';
      
      // Removed click handler - no action on image click/tap

      // Add delete button overlay (always visible)
      const deleteButton = document.createElement('button');
      deleteButton.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        pointer-events: auto;
      `;
      
      // Create React root and render the Icon component inside the button
      const iconRoot = createRoot(deleteButton);
      iconRoot.render(React.createElement(Icon, {
        name: 'trash',
        size: 18,
        color: 'white'
      }));
      
      deleteButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Emit a custom event for image deletion
        const deleteEvent = new CustomEvent('imageDelete', {
          detail: {
            imageId: node.attrs['data-image-id'],
            nodePos: getPos(),
          },
          bubbles: true,
        });
        deleteButton.dispatchEvent(deleteEvent);
      });

      dom.appendChild(img);
      dom.appendChild(deleteButton);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) {
            return false;
          }
          
          // Update image attributes if they've changed
          if (updatedNode.attrs.src !== node.attrs.src) {
            img.src = updatedNode.attrs.src;
          }
          if (updatedNode.attrs.alt !== node.attrs.alt) {
            img.alt = updatedNode.attrs.alt || '';
          }
          if (updatedNode.attrs.title !== node.attrs.title) {
            img.title = updatedNode.attrs.title || '';
          }
          
          return true;
        },
      };
    };
  },

  addProseMirrorPlugins() {
    const nodeType = this.name;
    return [
      new Plugin({
        key: new PluginKey('inlineImageTrailingParagraph'),
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
