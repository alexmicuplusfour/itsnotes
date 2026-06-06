import { Extension } from '@tiptap/core';
import { NotePreviewPlugin } from './TiptapNotePreviewPlugin';

export const NotePreviewExtension = Extension.create({
  name: 'notePreview',

  addProseMirrorPlugins() {
    return [
      NotePreviewPlugin(),
    ];
  },
});
