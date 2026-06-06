import { v4 as uuidv4 } from 'uuid';
import { notesApi } from './api';

/**
 * Converts a File object to a Base64 string
 * @param {File} file - The image file to convert
 * @returns {Promise<string>} - Promise resolving to the Base64 string
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = () => {
      resolve(reader.result);
    };
    
    reader.onerror = (error) => {
      reject(error);
    };
  });
};

/**
 * Creates a square thumbnail from an image
 * @param {string} base64Image - The Base64 encoded image
 * @param {number} size - Size of the square thumbnail
 * @returns {Promise<string>} - Promise resolving to the Base64 encoded thumbnail
 */
export const createThumbnail = (base64Image, size = 200) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Image;
    
    img.onload = () => {
      // Create a square thumbnail by cropping from center
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext('2d');
      
      // Determine which dimension to use and how to center crop
      let sx, sy, sWidth, sHeight;
      
      if (img.width > img.height) {
        // Landscape image
        sHeight = img.height;
        sWidth = img.height;
        sx = Math.floor((img.width - img.height) / 2);
        sy = 0;
      } else {
        // Portrait or square image
        sHeight = img.width;
        sWidth = img.width;
        sx = 0;
        sy = Math.floor((img.height - img.width) / 2);
      }
      
      // Draw the center-cropped image to create a square
      ctx.drawImage(
        img,
        sx, sy, sWidth, sHeight, // Source rectangle
        0, 0, size, size         // Destination rectangle
      );
      
      // Convert canvas to base64
      const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.8);
      
      resolve(thumbnailBase64);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for thumbnail creation'));
    };
  });
};

/**
 * Aggressively resizes an image to ensure it's below the maximum size limit
 * @param {string} base64Image - The Base64 encoded image
 * @param {number} maxSizeKB - Maximum size in KB (default 100KB)
 * @returns {Promise<string>} - Promise resolving to the resized Base64 encoded image
 */
export const resizeImageIfNeeded = (base64Image, maxSizeKB = 100) => {
  return new Promise((resolve, reject) => {
    console.log("Starting image resize process");
    
    // Calculate current size in KB
    const currentSizeKB = Math.round((base64Image.length * 0.75) / 1024);
    console.log(`Original image size: ${currentSizeKB.toFixed(2)}KB`);
    
    // Always resize images to ensure they're not too large for the server
    console.log("Always resizing images for better performance");
    
    const img = new Image();
    img.src = base64Image;
    
    img.onload = () => {
      // Start with higher quality
      let quality = 0.7; // Higher initial quality (0.7 instead of 0.4)
      let maxDimension = 1200; // Larger max dimension (1200 instead of 800)
      
      // Adjust max dimension based on original size
      if (currentSizeKB > 500) {
        maxDimension = 1000; // Still larger than before (1000 instead of 600)
      }
      if (currentSizeKB > 1000) {
        maxDimension = 800; // Still larger than before (800 instead of 400)
      }
      
      let width = img.width;
      let height = img.height;
      
      console.log(`Original dimensions: ${width}x${height}`);
      
      // Always resize to reduce dimensions
      if (width > height) {
        height = Math.round(height * (maxDimension / width));
        width = maxDimension;
      } else {
        width = Math.round(width * (maxDimension / height));
        height = maxDimension;
      }
      
      console.log(`Resized dimensions: ${width}x${height}`);
      
      // If still large, we'll try progressively lower quality 
      const compressImage = (q) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Always convert to JPEG for better compression
        const format = 'image/jpeg';
        const resizedImage = canvas.toDataURL(format, q);
        
        // Check new size
        const newSizeKB = Math.round((resizedImage.length * 0.75) / 1024);
        console.log(`Compressed size at quality ${q.toFixed(1)}: ${newSizeKB.toFixed(2)}KB`);
        
        if (newSizeKB <= maxSizeKB || q < 0.1) {
          // We're either under the limit or have reached min quality
          console.log(`Final image size: ${newSizeKB.toFixed(2)}KB with quality ${q.toFixed(1)}`);
          resolve(resizedImage);
        } else {
          // Try again with lower quality
          setTimeout(() => compressImage(q - 0.1), 0);
        }
      };
      
      compressImage(quality);
    };
    
    img.onerror = () => {
      console.error('Failed to load image for resizing');
      reject(new Error('Failed to load image for resizing'));
    };
  });
};

/**
 * Process an image file and add it to a note
 * @param {File} file - The image file to process
 * @param {number} noteId - The ID of the note to add the image to
 * @returns {Promise<Object>} - Promise resolving to the created image object
 */
export const processAndAddImage = async (file, noteId) => {
  if (!file || !noteId) {
    throw new Error('File and note ID are required');
  }
  
  // Check file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file');
  }
  
  // Convert image to base64
  const originalBase64 = await fileToBase64(file);
  
  // Resize the image, but with higher quality (200KB limit)
  const base64Data = await resizeImageIfNeeded(originalBase64, 200); // 200KB max
  
  // Generate square thumbnail (120px - larger size)
  const thumbnail = await createThumbnail(base64Data, 120);
  
  // Create image data object
  const imageData = {
    data: base64Data,
    thumbnail,
    name: file.name,
    type: file.type,
    size: Math.round((base64Data.length * 3) / 4) / 1024, // Size in KB
  };
  
  // Send to API
  try {
    const response = await notesApi.addNoteImage(noteId, imageData);
    return response.image;
  } catch (error) {
    console.error('Error adding image to note:', error);
    throw error;
  }
};

/**
 * Load all images for a note
 * @param {number} noteId - The ID of the note
 * @returns {Promise<Array<Object>>} - Promise resolving to array of image objects
 */
export const loadNoteImages = async (noteId) => {
  if (!noteId) return [];
  
  try {
    const response = await notesApi.getNoteImages(noteId);
    return response.images || [];
  } catch (error) {
    console.error('Error loading note images:', error);
    return [];
  }
};

/**
 * Delete an image
 * @param {number} imageId - The ID of the image to delete
 * @returns {Promise<Object>} - Promise resolving to the deleted image object
 */
export const deleteImage = async (imageId) => {
  try {
    const response = await notesApi.deleteImage(imageId);
    return response.image;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};