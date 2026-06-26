import { Node, mergeAttributes } from '@tiptap/core';
import { createRoot } from 'react-dom/client';
import React from 'react';
import Icon from "./Icons";
import { Plugin, PluginKey } from 'prosemirror-state';
import { getInlineImageUrl } from '../services/inlineImageResolver';

const ensurePlaceholderStyles = () => {
  if (document.getElementById('inline-image-placeholder-styles')) return;
  const style = document.createElement('style');
  style.id = 'inline-image-placeholder-styles';
  style.textContent = `
    @keyframes inline-image-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .inline-image-placeholder {
      background: linear-gradient(90deg, var(--fill-subtle) 25%, var(--button-bg) 50%, var(--fill-subtle) 75%);
      background-size: 200% 100%;
      animation: inline-image-shimmer 1.5s infinite linear;
      border-radius: 8px;
      min-height: 120px;
      width: 100%;
      display: block;
    }
  `;
  document.head.appendChild(style);
};

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
      'data-placeholder-id': {
        default: null,
        parseHTML: element => element.getAttribute('data-placeholder-id'),
        renderHTML: attributes => {
          if (!attributes['data-placeholder-id']) return {};
          return { 'data-placeholder-id': attributes['data-placeholder-id'] };
        },
      },
    };
  },

  parseHTML() {
    // Match images that carry either an inline src (legacy base64 / remote URL)
    // or a data-image-id reference (src stripped — resolved at render time).
    const getAttrs = element => ({
      src: element.getAttribute('src'),
      alt: element.getAttribute('alt'),
      title: element.getAttribute('title'),
      width: element.getAttribute('width'),
      height: element.getAttribute('height'),
      'data-image-id': element.getAttribute('data-image-id'),
    });
    return [
      { tag: 'img[src]', getAttrs },
      { tag: 'img[data-image-id]', getAttrs },
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

      const isPlaceholder = !!node.attrs['data-placeholder-id'];

      if (isPlaceholder) {
        ensurePlaceholderStyles();
        const placeholderDiv = document.createElement('div');
        placeholderDiv.className = 'inline-image-placeholder';
        if (node.attrs.width && node.attrs.height) {
          placeholderDiv.style.aspectRatio = `${node.attrs.width} / ${node.attrs.height}`;
        }
        dom.appendChild(placeholderDiv);
        return {
          dom,
          update: (updatedNode) => {
            if (updatedNode.type.name !== this.name) return false;
            // Placeholder → real image: force NodeView recreation
            if (!updatedNode.attrs['data-placeholder-id']) return false;
            return true;
          },
        };
      }

      const img = document.createElement('img');

      // Resolve the displayed source: prefer an inline src (legacy base64 or a
      // remote URL), otherwise look the image up by its note_images id so the
      // note body doesn't have to carry base64.
      const applySource = (attrs) => {
        if (attrs.src) {
          img.src = attrs.src;
        } else if (attrs['data-image-id']) {
          getInlineImageUrl(attrs['data-image-id'])
            .then((url) => { img.src = url; })
            .catch((err) => console.error('[inlineImage] resolve failed:', err.message));
        }
      };
      applySource(node.attrs);

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
          if (updatedNode.attrs.src !== node.attrs.src ||
              updatedNode.attrs['data-image-id'] !== node.attrs['data-image-id']) {
            applySource(updatedNode.attrs);
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
