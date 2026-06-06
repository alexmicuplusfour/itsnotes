import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';
import ReminderCard from './ReminderCard';

export default Node.create({
    name: 'reminderCard',

    group: 'block',

    atom: true,

    addAttributes() {
        return {
            rrule: {
                default: null,
            },
            nextRunAt: {
                default: null,
            },
            timezone: {
                default: 'UTC',
            },
            matchedText: {
                default: '',
            },
            scheduleSummary: { // New attribute
                default: null,
            },
            reminderId: { // Add reminderId for deletion
                default: null,
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'reminder-card',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['reminder-card', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ReminderCard);
    },

    addProseMirrorPlugins() {
        const nodeType = this.name;
        return [
            new Plugin({
                key: new PluginKey('reminderCardTrailingParagraph'),
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
