import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import api from '../services/api';

export const useAttachmentManager = (noteId) => {
  const handleAddAttachment = useCallback(async (files, editor) => {
    if (!editor) {
      console.error('Editor instance not found');
      return;
    }

    const fileArray = Array.from(files);
    const uploads = [];

    // 1. Prepare all attachment nodes
    const contentToInsert = fileArray.map(file => {
      const tempId = uuidv4();
      uploads.push({ file, tempId });
      return {
        type: 'attachment',
        attrs: {
          id: tempId,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          uploading: true,
          progress: 0
        }
      };
    });

    // 2. Insert all placeholders at once
    // This ensures they all appear immediately in the editor
    if (contentToInsert.length > 0) {
        editor.chain().focus().insertContent(contentToInsert).run();
    }

    // 3. Process uploads in parallel
    uploads.forEach(async ({ file, tempId }) => {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await api.post(`/notes/${noteId}/attachments`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            
            // Update node attributes
            // We need to find the node again because its position might have changed
            let found = false;
            editor.state.doc.descendants((node, pos) => {
              if (!found && node.type.name === 'attachment' && node.attrs.id === tempId) {
                const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  progress
                });
                editor.view.dispatch(tr);
                found = true;
                return false;
              }
            });
          }
        });

        // Success - update with real ID
        let found = false;
        editor.state.doc.descendants((node, pos) => {
          if (!found && node.type.name === 'attachment' && node.attrs.id === tempId) {
            const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              id: response.data.id,
              uploading: false,
              progress: 100
            });
            editor.view.dispatch(tr);
            found = true;
            return false;
          }
        });
      } catch (error) {
        console.error('Upload failed', error);
        // Show error state
        let found = false;
        editor.state.doc.descendants((node, pos) => {
          if (!found && node.type.name === 'attachment' && node.attrs.id === tempId) {
            const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              filename: `Error: ${file.name}`,
              uploading: false
            });
            editor.view.dispatch(tr);
            found = true;
            return false;
          }
        });
      }
    });
  }, [noteId]);

  return { handleAddAttachment };
};
