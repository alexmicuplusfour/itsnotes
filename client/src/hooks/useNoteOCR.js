import { useCallback, useRef, useState } from 'react';
import { aiApi } from '../services/api';

export const useNoteOCR = (contentInputRef) => {
  const inFlightRef = useRef(false);
  const [isExtractingOCR, setIsExtractingOCR] = useState(false);

  const handleInsertOCR = useCallback(async (imageFile) => {
    if (inFlightRef.current) return;
    console.log('[useNoteOCR] handleInsertOCR called');

    if (!imageFile) return;

    inFlightRef.current = true;
    setIsExtractingOCR(true);

    const placeholderText = "✨ Extracting text...";

    try {
      // Insert placeholder as a custom node
      if (contentInputRef?.current) {
        contentInputRef.current.insertContent({
          type: 'aiPlaceholder',
          attrs: { text: placeholderText },
        });
      }

      const response = await aiApi.ocr(imageFile);
      
      if (response && response.text) {
        if (contentInputRef?.current) {
           // Replace placeholder with text
           const textHtml = response.text.replace(/\n/g, '<br>');
           
           // Try to use replaceAIPlaceholder if available
           let replaced = false;
           if (contentInputRef.current.replaceAIPlaceholder) {
             replaced = contentInputRef.current.replaceAIPlaceholder(placeholderText, textHtml);
           }
           
           if (!replaced) {
             // Fallback: just insert content
             contentInputRef.current.insertContent(textHtml);
           }
        }
      }
    } catch (error) {
      console.error('OCR error:', error);
      // Try to remove placeholder
      if (contentInputRef?.current && contentInputRef.current.replaceAIPlaceholder) {
          contentInputRef.current.replaceAIPlaceholder(placeholderText, '');
      }
    } finally {
      inFlightRef.current = false;
      setIsExtractingOCR(false);
    }
  }, [contentInputRef]);

  return { handleInsertOCR, isExtractingOCR };
};
