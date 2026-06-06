import Details from '@tiptap/extension-details';
import { mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';

export const CustomDetails = Details.extend({
  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() || [];
    const nodeType = this.name;
    return [
      ...parentPlugins,
      new Plugin({
        key: new PluginKey('detailsTrailingParagraph'),
        appendTransaction: (transactions, oldState, newState) => {
          // Only run if there was an actual change
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          const { doc, schema } = newState;
          const lastNode = doc.lastChild;

          // If the last node is details, add a trailing paragraph
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

  addNodeView() {
    return ({ editor, getPos, node, HTMLAttributes }) => {
      const dom = document.createElement('div');
      const attributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-type': this.name,
      });
      Object.entries(attributes).forEach(([key, value]) => dom.setAttribute(key, value));
      
      const toggle = document.createElement('button');
      toggle.type = 'button';
      dom.append(toggle);
      
      const content = document.createElement('div');
      dom.append(content);
      
      const toggleDetailsContent = (setToValue) => {
        if (setToValue !== undefined) {
          if (setToValue) {
            if (dom.classList.contains(this.options.openClassName)) {
              return;
            }
            dom.classList.add(this.options.openClassName);
          } else {
            if (!dom.classList.contains(this.options.openClassName)) {
              return;
            }
            dom.classList.remove(this.options.openClassName);
          }
        } else {
          dom.classList.toggle(this.options.openClassName);
        }
        const event = new Event('toggleDetailsContent');
        const detailsContent = content.querySelector(':scope > div[data-type="detailsContent"]');
        detailsContent?.dispatchEvent(event);
      };

      if (node.attrs.open) {
        setTimeout(() => toggleDetailsContent(true));
      }

      // --- FIX: Prevent focus jump on mousedown ---
      toggle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      // --------------------------------------------

      toggle.addEventListener('click', () => {
        toggleDetailsContent();
        if (!this.options.persist) {
          return;
        }
        if (editor.isEditable && typeof getPos === 'function') {
          editor
            .chain()
            .command(({ tr }) => {
              const pos = getPos();
              const currentNode = tr.doc.nodeAt(pos);
              if (currentNode?.type !== this.type) {
                return false;
              }
              tr.setNodeMarkup(pos, undefined, {
                open: !currentNode.attrs.open,
              });
              return true;
            })
            .run();
        }
      });

      return {
        dom,
        contentDOM: content,
        ignoreMutation(mutation) {
          if (mutation.type === 'selection') {
            return false;
          }
          return !dom.contains(mutation.target) || dom === mutation.target;
        },
        update: updatedNode => {
          if (updatedNode.type !== this.type) {
            return false;
          }
          // Only update the open state if set
          if (updatedNode.attrs.open !== undefined) {
            toggleDetailsContent(updatedNode.attrs.open);
          }
          return true;
        },
      };
    };
  },
});
