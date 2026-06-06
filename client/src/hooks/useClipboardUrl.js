import { useState, useCallback } from 'react';

/**
 * Custom hook for managing clipboard URL functionality
 * Handles checking clipboard for URLs and providing URL preview text
 * 
 * @returns {Object} Hook state and methods
 */
export const useClipboardUrl = () => {
  const [clipboardUrl, setClipboardUrl] = useState(null);

  // Check clipboard for URL content
  const checkClipboardForUrl = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          // Check if the clipboard content looks like a URL
          const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
          if (urlPattern.test(text.trim())) {
            setClipboardUrl(text.trim());
            return text.trim();
          }
        }
      }
    } catch (error) {
      console.warn('[useClipboardUrl] Could not access clipboard:', error);
    }
    setClipboardUrl(null);
    return null;
  }, []);

  // Helper function to truncate URL for preview
  const getTruncatedUrl = useCallback((url) => {
    if (!url) return '';
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      const path = urlObj.pathname + urlObj.search;
      
      // If path is just "/" or empty, show just domain
      if (path === '/' || path === '') {
        return domain;
      }
      
      // Truncate long paths
      const maxLength = 24;
      if (path.length > maxLength) {
        return `${domain}${path.substring(0, maxLength - domain.length - 3)}...`;
      }
      
      return `${domain}${path}`;
    } catch (error) {
      // Fallback: just truncate the full URL
      return url.length > 40 ? `${url.substring(0, 37)}...` : url;
    }
  }, []);

  // Get appropriate preview text for display
  const getClipboardUrlPreview = useCallback(() => {
    if (clipboardUrl) {
      return getTruncatedUrl(clipboardUrl);
    }
    return 'No links found in clipboard';
  }, [clipboardUrl, getTruncatedUrl]);

  // Check if clipboard has a valid URL
  const hasClipboardUrl = useCallback(() => {
    return !!clipboardUrl;
  }, [clipboardUrl]);

  return {
    clipboardUrl,
    checkClipboardForUrl,
    getTruncatedUrl,
    getClipboardUrlPreview,
    hasClipboardUrl,
  };
};

export default useClipboardUrl;
