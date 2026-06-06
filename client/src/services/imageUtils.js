/**
 * Utility functions for handling images in notes
 */

// Image marker format in note content: [IMAGE:{"id":"uuid","data":"base64data","thumbnail":"base64data"}]
export const IMAGE_MARKER_REGEX = /\[IMAGE:(.*?)\]/g;

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
    
    // Very small images can be returned as-is
    if (currentSizeKB <= 50) {
      console.log("Image is already small enough, no resize needed");
      resolve(base64Image);
      return;
    }
    
    const img = new Image();
    img.src = base64Image;
    
    img.onload = () => {
      // Start with aggressive size reduction
      let quality = 0.5; // Lower initial quality
      let maxDimension = 1000; // Smaller max dimension
      
      // Adjust max dimension based on original size
      if (currentSizeKB > 500) {
        maxDimension = 800;
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
 * Adds an image to a note's content
 * @param {string} content - The current note content
 * @param {Object} imageData - The image data to add
 * @param {string} imageData.id - Unique ID for the image
 * @param {string} imageData.data - Base64 encoded image data
 * @param {string} imageData.thumbnail - Base64 encoded thumbnail data
 * @returns {string} - The updated note content
 */
export const addImageToContent = (content, imageData) => {
  const imageMarker = `[IMAGE:${JSON.stringify(imageData)}]`;
  return content ? `${content}\n${imageMarker}` : imageMarker;
};

/**
 * Removes an image from a note's content
 * @param {string} content - The current note content
 * @param {string} imageId - The ID of the image to remove
 * @returns {string} - The updated note content
 */
export const removeImageFromContent = (content, imageId) => {
  return content.replace(IMAGE_MARKER_REGEX, (match) => {
    try {
      const imageDataStr = match.substring(7, match.length - 1);
      const imageData = JSON.parse(imageDataStr);
      
      if (imageData.id === imageId) {
        return ''; // Remove this image marker
      }
      
      return match; // Keep other image markers
    } catch (error) {
      console.error('Error parsing image data:', error);
      return match;
    }
  });
};

/**
 * Extracts all images from note content
 * @param {string} content - The note content
 * @returns {Array<Object>} - Array of image objects
 */
export const extractImagesFromContent = (content) => {
  if (!content) return [];
  
  const images = [];
  const matches = content.matchAll(IMAGE_MARKER_REGEX);
  
  for (const match of matches) {
    try {
      const imageDataStr = match[1];
      const imageData = JSON.parse(imageDataStr);
      images.push(imageData);
    } catch (error) {
      console.error('Error parsing image data:', error);
    }
  }
  
  return images;
};

/**
 * Cleans note content for display (removes image markers)
 * @param {string} content - The note content with image markers
 * @returns {string} - Clean content without image markers
 */
export const getCleanContent = (content) => {
  if (!content) return '';
  return content.replace(IMAGE_MARKER_REGEX, '');
};