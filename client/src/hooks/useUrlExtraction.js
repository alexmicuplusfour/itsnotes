import { useState, useRef, useCallback } from 'react';
import { extractUrls, cleanHtmlForTiptap } from '../utils/noteUtils';
import { notesApi } from '../services/api';

/**
 * Custom hook for managing URL extraction functionality
 * Handles URL detection, extraction prompts, and content extraction processes
 * 
 * @param {string} currentContent - The current note content (HTML from Tiptap)
 * @param {Object} options - Configuration options
 * @param {Function} options.setTitle - Function to update the note's title
 * @param {Function} options.setContent - Function to update the note's content
 * @param {Function} options.setIsModified - Function to mark the note as modified
 * @param {Function} options.setLastSaveTime - Function to update the last save time
 * @param {Object} options.apiService - API service for extraction (defaults to notesApi.extractUrlContent)
 * @param {Function} options.onExtractionStart - Callback when extraction begins
 * @param {Function} options.onExtractionSuccess - Callback on successful extraction
 * @param {Function} options.onExtractionError - Callback on extraction failure
 * @param {Object} options.pasteDetectedRef - Ref indicating if content change was due to paste
 * @param {string} options.noteId - The ID of the note for image extraction
 * @param {boolean} options.includeImages - Whether to extract and upload images from the URL
 * @param {Function} options.onImagesExtracted - Callback when images are extracted (optional)
 * @returns {Object} Hook state and methods
 */
export const useUrlExtraction = (currentContent = '', options = {}) => {
  const {
    setTitle,
    setContent,
    setIsModified,
    setLastSaveTime,
    apiService = notesApi.extractUrlContent,
    onExtractionStart,
    onExtractionSuccess,
    onExtractionError,
    pasteDetectedRef: externalPasteDetectedRef,
    noteId,
    includeImages = false,
    onImagesExtracted
  } = options;

  // Internal state
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const [promptUrl, setPromptUrl] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState(null);
  // Internal refs
  const processedUrlsRef = useRef(new Set());
  const pasteDetectedRef = useRef(false);


  // Use external pasteDetectedRef if provided, otherwise use internal one
  const activePasteDetectedRef = externalPasteDetectedRef || pasteDetectedRef;
  // Utility functions
  const _showPrompt = useCallback((url) => {
    setIsPromptVisible(true);
    setPromptUrl(url);
    processedUrlsRef.current.add(url);
  }, []);

  const _hidePrompt = useCallback(() => {
    setIsPromptVisible(false);
    setPromptUrl(null);
    setExtractionError(null);
  }, []);

  const _handleUrlExtraction = useCallback(async (urlToExtract, extractionType = "text") => {
    // Validation
    if (!setContent || !setTitle || typeof setContent !== 'function' || typeof setTitle !== 'function') {
      console.error("useUrlExtraction: Missing required setter functions (setContent or setTitle) in options.");
      setExtractionError("Internal error: Required functions not provided.");
      return;
    }

    console.log(`[useUrlExtraction] Starting extraction for: ${urlToExtract}`);
    
    // Notify extraction start
    if (onExtractionStart) {
      onExtractionStart(urlToExtract, extractionType);
    }
    
    setIsExtracting(true);
    setExtractionError(null);

    try {
      // Call the API to get the extracted content, title, and optionally images
      const result = await apiService(urlToExtract, extractionType, noteId, includeImages);

      // --- Content Manipulation ---
      // Get a plain text representation of the current Tiptap HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = currentContent || '';
      const plainTextCurrentContent = tempDiv.innerText;

      // Remove the original URL from the plain text representation
      const plainTextWithoutUrl = plainTextCurrentContent.replace(urlToExtract, '').trim();

      // Clean the extracted HTML content for Tiptap compatibility
      console.log('[useUrlExtraction] Raw extracted content:', result.content);
      let extractedHtml = cleanHtmlForTiptap(result.content);
      console.log('[useUrlExtraction] Cleaned extracted content:', extractedHtml);

      // Process extracted images if available
      let inlineImagesHtml = '';
      if (result.images && result.images.length > 0) {
        console.log(`[useUrlExtraction] Processing ${result.images.length} extracted images`);
        console.log('[useUrlExtraction] Image data received:', result.images);
        
        // Create a mapping of original URLs to uploaded image data
        const imageMap = new Map();
        result.images.forEach(image => {
          if (image.originalUrl) {
            imageMap.set(image.originalUrl, image);
            console.log(`[useUrlExtraction] Mapped: ${image.originalUrl} -> ${image.id}`);
          }
        });
        
        console.log('[useUrlExtraction] Original extracted HTML length:', extractedHtml.length);
        console.log('[useUrlExtraction] Looking for images in extracted HTML...');
        
        // Replace original image URLs in the extracted HTML with uploaded image data
        let processedHtml = extractedHtml;
        let replacementsMade = 0;
        
        imageMap.forEach((uploadedImage, originalUrl) => {
          // Try multiple approaches to find and replace the image
          console.log(`[useUrlExtraction] Looking for URL: ${originalUrl}`);
          
          // First, try exact URL match
          let imgRegex = new RegExp(`<img[^>]*src=["']${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'gi');
          let matches = processedHtml.match(imgRegex);
          
          if (!matches) {
            // Try without query parameters (everything after ?)
            const urlWithoutQuery = originalUrl.split('?')[0];
            console.log(`[useUrlExtraction] Trying without query params: ${urlWithoutQuery}`);
            imgRegex = new RegExp(`<img[^>]*src=["'][^"']*${urlWithoutQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*["'][^>]*>`, 'gi');
            matches = processedHtml.match(imgRegex);
          }
          
          if (!matches) {
            // Try with just the filename
            const filename = originalUrl.split('/').pop().split('?')[0];
            console.log(`[useUrlExtraction] Trying with filename: ${filename}`);
            imgRegex = new RegExp(`<img[^>]*src=["'][^"']*${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*["'][^>]*>`, 'gi');
            matches = processedHtml.match(imgRegex);
          }
          
          if (matches) {
            console.log(`[useUrlExtraction] Found ${matches.length} matches for ${originalUrl}`);
            console.log(`[useUrlExtraction] First match: ${matches[0]}`);
            
            // Replace with our uploaded image
            const replacement = `<img src="${uploadedImage.thumbnail}" alt="${uploadedImage.alt || 'Extracted image'}" data-image-id="${uploadedImage.id}" style="max-width: 100%; height: auto; display: block; margin: 0.5rem 0; border-radius: 8px;" />`;
            
            processedHtml = processedHtml.replace(imgRegex, replacement);
            replacementsMade++;
            console.log(`[useUrlExtraction] Replaced image ${uploadedImage.id}`);
          } else {
            console.log(`[useUrlExtraction] No matches found for ${originalUrl}`);
          }
        });
        
        console.log(`[useUrlExtraction] Made ${replacementsMade} image replacements`);
        
        // Update extractedHtml with the processed version
        extractedHtml = processedHtml;
        
        // Create HTML for any additional inline images that weren't found in the content
        const unmatchedImages = result.images.filter(image => {
          // Check if this image's URL appears in the processed HTML by looking for data-image-id
          return !processedHtml.includes(`data-image-id="${image.id}"`);
        });
        
        console.log(`[useUrlExtraction] Found ${unmatchedImages.length} unmatched images`);
        
        if (unmatchedImages.length > 0) {
          const imageElements = unmatchedImages.map(image => {
            console.log(`[useUrlExtraction] Adding unmatched image: ${image.id}`);
            return `<img src="${image.thumbnail}" alt="${image.alt || 'Extracted image'}" data-image-id="${image.id}" style="max-width: 100%; height: auto; display: block; margin: 0.5rem 0; border-radius: 8px;" />`;
          });
          
          inlineImagesHtml = imageElements.join('\n');
        }
        
        // Notify about extracted images
        if (onImagesExtracted) {
          onImagesExtracted(result.images);
        }
        
        console.log('[useUrlExtraction] Processed and replaced images in extracted content');
      }

      // Convert the remaining original plain text back to basic HTML
      const remainingOriginalHtml = plainTextWithoutUrl
        ? `<p>${plainTextWithoutUrl.replace(/\n/g, '<br>')}</p>`
        : '<p></p>';

      // Combine into the final HTML structure (images are now already embedded in extractedHtml)
      const updatedHtmlContent = `${extractedHtml}
        ${inlineImagesHtml ? `<p>---</p>${inlineImagesHtml}` : ''}
        <p>---</p>
        <p>Original URL: <a href="${urlToExtract}" target="_blank" rel="noopener noreferrer">${urlToExtract}</a></p>
        <p>---</p>
        ${remainingOriginalHtml}`;

      // Update content and title
      setContent(updatedHtmlContent);
      console.log("[useUrlExtraction] Content state updated.");

      // Set title only if current title is empty or just whitespace
      // We need to get current title from options since we don't have direct access to title state
      setTitle(prevTitle => {
        if (!prevTitle || !prevTitle.trim()) {
          console.log("[useUrlExtraction] Title state updated.");
          return result.title || 'Extracted Content';
        } else {
          console.log("[useUrlExtraction] Existing title found, not overwriting.");
          return prevTitle;
        }
      });

      // Mark the note as modified and update save time
      if (setIsModified) setIsModified(true);
      if (setLastSaveTime) setLastSaveTime(Date.now());
      console.log("[useUrlExtraction] Note marked as modified.");

      // Notify extraction success
      if (onExtractionSuccess) {
        onExtractionSuccess(result, urlToExtract);
      }

      // Hide the prompt
      _hidePrompt();

    } catch (error) {
      console.error('Error extracting URL content:', error);
      const errorMessage = error.message || "An unknown error occurred during extraction.";
      setExtractionError(`Failed to extract content: ${errorMessage}`);

      // Remove URL from processed set on failure to allow retry
      processedUrlsRef.current.delete(urlToExtract);
      console.log(`[useUrlExtraction] Removed ${urlToExtract} from processedUrlsRef due to error.`);

      // Notify extraction error
      if (onExtractionError) {
        onExtractionError(error, urlToExtract);
      }

    } finally {
      setIsExtracting(false);
      console.log(`[useUrlExtraction] Extraction process finished for: ${urlToExtract}`);
    }
  }, [currentContent, setContent, setTitle, setIsModified, setLastSaveTime, apiService, onExtractionStart, onExtractionSuccess, onExtractionError, _hidePrompt]);
  // URL detection on content change is handled by the imperative `detectUrls`
  // path (called from NoteForm.handleContentChange when a paste is flagged).
  // The previous reactive useEffect here parsed the full note HTML and ran
  // extractUrls on every debounced content commit, even though the prompt
  // is disabled — wasted work plus callback churn through `currentContent`
  // deps. Removed; previousUrlsRef is no longer needed.

  // Exposed functions
  const extractNow = useCallback(() => {
    if (promptUrl) {
      _handleUrlExtraction(promptUrl);
    }
  }, [promptUrl, _handleUrlExtraction]);

  const dismissPrompt = useCallback(() => {
    _hidePrompt();
  }, [_hidePrompt]);

  const resetProcessedUrls = useCallback(() => {
    processedUrlsRef.current.clear();
    _hidePrompt();
  }, [_hidePrompt]);

  // Legacy methods for backward compatibility
  const detectUrls = useCallback((newContent, prevContent) => {
    const currentUrls = extractUrls(newContent).map((item) => item.url);
    const previousUrls = extractUrls(prevContent).map((item) => item.url);
    
    const newlyAddedUrls = currentUrls.filter(
      (url) =>
        !previousUrls.includes(url) &&
        !processedUrlsRef.current.has(url) &&
        url !== promptUrl
    );

    // URL extraction prompt disabled - users found it disruptive
    // if (newlyAddedUrls.length > 0 && !isExtracting && !isPromptVisible && activePasteDetectedRef.current) {
    //   console.log("[useUrlExtraction] Detected new URL from paste, showing prompt:", newlyAddedUrls[0]);
    //   _showPrompt(newlyAddedUrls[0]);
    //   activePasteDetectedRef.current = false;
    // }
    if (newlyAddedUrls.length > 0 && activePasteDetectedRef.current) {
      activePasteDetectedRef.current = false;
    }
  }, [isExtracting, isPromptVisible, promptUrl, activePasteDetectedRef, _showPrompt]);

  const markPasteDetected = useCallback(() => {
    activePasteDetectedRef.current = true;
  }, [activePasteDetectedRef]);

  const hideExtractionPrompt = useCallback(() => {
    _hidePrompt();
  }, [_hidePrompt]);

  const clearExtractionError = useCallback(() => {
    setExtractionError(null);
  }, []);

  const resetExtractionState = useCallback(() => {
    setIsExtracting(false);
    setExtractionError(null);
    _hidePrompt();
    processedUrlsRef.current.clear();
    activePasteDetectedRef.current = false;
  }, [_hidePrompt, activePasteDetectedRef]);

  const markUrlAsProcessed = useCallback((url) => {
    processedUrlsRef.current.add(url);
  }, []);

  const unmarkUrlAsProcessed = useCallback((url) => {
    processedUrlsRef.current.delete(url);
  }, []);  const extractSpecificUrl = useCallback(async (urlToExtract, extractionType = "text") => {
    if (urlToExtract) {
      // Show the prompt first, then extract
      _showPrompt(urlToExtract);
      return await _handleUrlExtraction(urlToExtract, extractionType);
    }
  }, [_handleUrlExtraction, _showPrompt]);

  return {
    // Primary interface (new API)
    isPromptVisible,
    promptUrl,
    isExtracting,
    extractionError,
    extractNow,
    extractSpecificUrl, // New method to extract a specific URL
    dismissPrompt,
    resetProcessedUrls,

    // Legacy interface (for backward compatibility)
    extractionPrompt: {
      show: isPromptVisible,
      url: promptUrl,
    },
    setIsExtracting,
    setExtractionError,
    setExtractionPrompt: (prompt) => {
      setIsPromptVisible(prompt.show);
      setPromptUrl(prompt.url);
    },
    processedUrlsRef,
    pasteDetectedRef: activePasteDetectedRef,
    detectUrls,
    markPasteDetected,
    hideExtractionPrompt,
    clearExtractionError,
    resetExtractionState,
    markUrlAsProcessed,
    unmarkUrlAsProcessed,
  };
};

export default useUrlExtraction;
