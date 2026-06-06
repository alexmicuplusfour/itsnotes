import { Node, mergeAttributes } from '@tiptap/core';

export const AIPlaceholderExtension = Node.create({
  name: 'aiPlaceholder',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      text: {
        default: '✨ Processing...',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-ai-placeholder]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-ai-placeholder': '',
        class: 'ai-placeholder',
      }),
      HTMLAttributes.text,
    ];
  },
});
