// src/hooks/useImageManager.js
import { useState, useCallback, useMemo } from 'react';
// Assuming notesApi handles image uploads/deletions related to notes (though not directly used here)
// import { notesApi } from '../services/api';
import {
  fileToBase64,
  resizeImageIfNeeded,
  createThumbnail,
} from '../services/imageManager';
import env from '../../env.js'; // Import the environment configuration
import { useAuth } from '../contexts/AuthContext'; // Import auth context

// Custom hook for managing note images
export const useImageManager = () => {
  const [images, setImages] = useState([]);
  const [unsavedImageIds, setUnsavedImageIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { token } = useAuth(); // Get the auth token  // Helper function to create auth headers
  const getAuthHeaders = useMemo(() => {
    // Get token directly from localStorage like the axios interceptor does
    const token = localStorage.getItem('authToken');
    console.log('[useImageManager] Creating auth headers - Token found:', !!token);
    
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.log('[useImageManager] Authorization header set:', 'Bearer [TOKEN]');
    } else {
      console.log('[useImageManager] No token found in localStorage');
    }
    return headers;
  }, [token]); // Still keep token as dependency to trigger re-creation when auth context updates

  // --- Fetch Images ---
  const loadImages = useCallback(async (noteId) => {
    if (!noteId) {
        console.log('[useImageManager] Skipping image load for invalid note ID:', noteId);
        setImages([]); // Ensure images are cleared if noteId is invalid
        setUnsavedImageIds([]); // Clear unsaved IDs too
        return;
    }    console.log(`[useImageManager] Loading image thumbnails for note ${noteId}`);
    setIsLoading(true);
    setError(null);    try {
      // Use direct fetch with the dynamic base URL and explicitly request thumbnails only
      console.log('[useImageManager] Headers being sent:', getAuthHeaders);
      const response = await fetch(`${env.SERVER_BASE_URL}/api/notes/${noteId}/images?thumbnailsOnly=true`, {
        headers: getAuthHeaders
      });
      if (!response.ok) {
        throw new Error(`Server error loading images: ${response.status}`);
      }
      const data = await response.json();
      console.log(`[useImageManager] Loaded ${data.images?.length || 0} image thumbnails`);
      setImages(data.images || []);
      setUnsavedImageIds([]); // Reset unsaved IDs when loading existing note's images
    } catch (err) {
      console.error('[useImageManager] Error loading images:', err);
      setError(err.message || 'Failed to load images.');
      setImages([]); // Clear images on error
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]); // Include getAuthHeaders in dependencies

  // --- Add Image ---
  const addImage = useCallback(async (file, noteId) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Invalid file type. Please select an image.');
      return false; // Indicate failure
    }

    setIsLoading(true);
    setError(null);
    const tempImageId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; // More unique temp ID
    // Add to unsaved IDs immediately for tracking
    setUnsavedImageIds(prev => [...prev, tempImageId]);

    try {
      console.log(`[useImageManager] Processing image: ${file.name}`);
      const originalBase64 = await fileToBase64(file);
      // Keep resizing consistent with NoteForm's previous logic (e.g., 200px width)
      const base64Data = await resizeImageIfNeeded(originalBase64, 200);
      const thumbnail = await createThumbnail(base64Data, 120);
      const imageData = {
        data: base64Data,
        thumbnail,
        name: file.name,
        type: file.type,
        size: Math.round((base64Data.length * 0.75) / 1024) // Approx KB
      };      if (noteId) {
        // --- Existing Note: Upload Immediately ---
        console.log(`[useImageManager] Uploading image to existing note ${noteId}`);        // Use direct fetch with the dynamic base URL
        console.log('[useImageManager] Uploading image - Headers being sent:', getAuthHeaders);
        const response = await fetch(`${env.SERVER_BASE_URL}/api/notes/${noteId}/images`, { // <-- UPDATED URL
            method: 'POST',
            headers: getAuthHeaders,
            body: JSON.stringify(imageData)
        });

        if (!response.ok) {
            // Attempt to read error message from server response
            let errorBody = 'Server error during upload.';
            try {
                const errData = await response.json();
                errorBody = errData.message || errorBody;
            } catch(e) { /* Ignore JSON parsing error */ }
            throw new Error(`${errorBody} Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[useImageManager] Upload successful, image ID: ${data.image.id}`);
        setImages(prev => [...prev, data.image]);
        // Remove *temporary* ID from unsaved list on successful upload
        setUnsavedImageIds(prev => prev.filter(id => id !== tempImageId));
        setIsLoading(false);
        return { success: true, image: data.image }; // Indicate success

      } else {
        // --- New Note: Create Temporary Preview ---
        console.log(`[useImageManager] Creating temporary image preview for new note.`);
        const tempImage = {
            id: tempImageId, // Use the temp ID
            ...imageData,
            isTemp: true
        };
        setImages(prev => [...prev, tempImage]);
        // Keep tempImageId in unsavedImageIds until note is saved
        setIsLoading(false);
        return { success: true, image: tempImage }; // Indicate success (locally)
      }
    } catch (error) {
      console.error('[useImageManager] Error processing/uploading image:', error);
      setError(`Failed to add image: ${error.message}.`);
      // Remove the ID if processing/upload failed entirely
      setUnsavedImageIds(prev => prev.filter(id => id !== tempImageId));
      setIsLoading(false);
      return { success: false, error: error.message }; // Indicate failure
    }
  }, [getAuthHeaders]); // Include getAuthHeaders dependency

  // --- Remove Image ---
  const removeImage = useCallback(async (imageId, noteId) => {
    setIsLoading(true);
    setError(null);
    try {
      console.log(`[useImageManager] removeImage called with imageId: ${imageId} (type: ${typeof imageId})`);
      console.log(`[useImageManager] Current images state:`, images.map(img => ({ id: img.id, type: typeof img.id, name: img.name })));
      
      const imageToRemove = images.find(img => img.id === imageId);

      if (!imageToRemove) {
          console.error(`[useImageManager] Image not found in current state. Looking for ID: ${imageId} (${typeof imageId})`);
          console.error(`[useImageManager] Available image IDs:`, images.map(img => `${img.id} (${typeof img.id})`));
          throw new Error("Image not found in current state.");
      }

      const isTemp = imageToRemove.isTemp;

      if (!isTemp && noteId) {
        // --- For saved images, attempt deletion from server ---
        console.log(`[useImageManager] Deleting image ${imageId} from server (associated with note ${noteId})`);        // Use direct fetch with the dynamic base URL
        const response = await fetch(`${env.SERVER_BASE_URL}/api/images/${imageId}`, { // <-- UPDATED URL
            method: 'DELETE',
            headers: getAuthHeaders
        });

        if (!response.ok && response.status !== 404) { // Tolerate 404 (might already be deleted)
            // Attempt to read error message
            let errorBody = 'Server error during deletion.';
            try {
                const errData = await response.json();
                errorBody = errData.message || errorBody;
            } catch(e) { /* Ignore JSON parsing error */ }
            console.error(`[useImageManager] Error deleting image from server: ${errorBody} Status: ${response.status}`);
            // Optional: Decide if you want to throw here or just log and remove from UI anyway
            // throw new Error(`Server error deleting image: ${errorBody}`);
        } else if (response.ok) {
            console.log(`[useImageManager] Image ${imageId} deleted successfully from server.`);
        } else {
            console.log(`[useImageManager] Image ${imageId} not found on server (status 404), proceeding with UI removal.`);
        }
      } else {
          console.log(`[useImageManager] Removing temporary image ${imageId} or image without valid noteId.`);
      }

      // --- Always update local state ---
      setImages(prev => prev.filter(img => img.id !== imageId));
      // Also remove from unsaved list if it happens to be there
      setUnsavedImageIds(prev => prev.filter(id => id !== imageId));
      setIsLoading(false);
      return true; // Indicate success

    } catch (error) {
      console.error('[useImageManager] Error removing image:', error);
      setError(error.message || 'Failed to remove image.');
      setIsLoading(false);
      return false; // Indicate failure
    }
  }, [images, getAuthHeaders]); // Depends on the current `images` state and auth headers

  // --- Upload Temporary Images (Used After New Note Creation) ---
  const uploadTemporaryImages = useCallback(async (newNoteId) => {
    if (!newNoteId) {
      console.error('[useImageManager] Cannot upload temporary images without a valid note ID.');
      return []; // Return empty array indicating no uploads happened
    }

    const tempImagesToUpload = images.filter(img => img.isTemp === true);
    if (tempImagesToUpload.length === 0) {
      console.log('[useImageManager] No temporary images to upload for note', newNoteId);
      return []; // Nothing to do
    }

    console.log(`[useImageManager] Uploading ${tempImagesToUpload.length} temporary images to new note ${newNoteId}`);
    setIsLoading(true); // Set loading for the batch
    const uploadPromises = [];
    const successfullyUploadedImages = [];
    const failedUploadIds = [];    for (const tempImg of tempImagesToUpload) {
      // Use direct fetch with the dynamic base URL
      const promise = fetch(`${env.SERVER_BASE_URL}/api/notes/${newNoteId}/images`, { // <-- UPDATED URL
        method: 'POST',
        headers: getAuthHeaders,
        body: JSON.stringify({ // Send only necessary data
            data: tempImg.data,
            thumbnail: tempImg.thumbnail,
            name: tempImg.name,
            type: tempImg.type,
            size: tempImg.size
        })
      })
      .then(async response => {
          if (!response.ok) {
              let errorBody = `Server error uploading temp image ${tempImg.name}.`;
              try {
                  const errData = await response.json();
                  errorBody = errData.message || errorBody;
              } catch(e) { /* Ignore */ }
              throw new Error(`${errorBody} Status: ${response.status}`);
          }
          return response.json();
      })
      .then(data => {
          console.log(`[useImageManager] Temp image ${tempImg.id} uploaded successfully as ${data.image.id}`);
          successfullyUploadedImages.push({ tempId: tempImg.id, newImage: data.image });
          return data.image; // Return the new image data
      })
      .catch(err => {
          console.error(`[useImageManager] Error uploading temporary image ${tempImg.id}:`, err);
          failedUploadIds.push(tempImg.id);
          // Don't set global error here, handle failures collectively
          return null; // Indicate failure for this specific image
      });
      uploadPromises.push(promise);
    }

    // Wait for all uploads to settle
    await Promise.allSettled(uploadPromises);

    // Update the main images state: replace temp images with real ones, remove failed ones
    setImages(prevImages => {
        let updatedImages = [...prevImages];
        // Replace successful uploads
        successfullyUploadedImages.forEach(({ tempId, newImage }) => {
            updatedImages = updatedImages.map(img => img.id === tempId ? newImage : img);
        });
        // Remove failed uploads
        updatedImages = updatedImages.filter(img => !failedUploadIds.includes(img.id));
        return updatedImages;
    });

    // Update unsaved IDs: remove all that were attempted (success or fail)
    const attemptedTempIds = tempImagesToUpload.map(img => img.id);
    setUnsavedImageIds(prev => prev.filter(id => !attemptedTempIds.includes(id)));

    if (failedUploadIds.length > 0) {
      setError(`Failed to upload ${failedUploadIds.length} image(s). They have been removed.`);
    } else {
        setError(null); // Clear previous errors if all succeeded
    }

    setIsLoading(false); // Batch loading finished
    return successfullyUploadedImages.map(item => item.newImage); // Return the successfully uploaded images

  }, [images, getAuthHeaders]); // Depends on images state and auth headers

  // --- Clear Unsaved IDs (Used After Any Successful Save) ---
  const clearUnsavedIds = useCallback(() => {
    console.log('[useImageManager] Clearing unsaved image IDs.');
    setUnsavedImageIds([]);
  }, []);

  // --- Reset Hook State (e.g., when opening a new empty note form) ---
  const resetImageState = useCallback(() => {
    console.log('[useImageManager] Resetting image state.');
    setImages([]);
    setUnsavedImageIds([]);
    setIsLoading(false);
    setError(null);
  }, []);


  // Return the state and functions to be used by the component
  return {
    images,
    unsavedImageIds,
    isLoading,
    error,
    loadImages,
    addImage,
    removeImage,
    uploadTemporaryImages,
    clearUnsavedIds,
    resetImageState // Add the reset function
  };
};