import { useCallback, useRef } from 'react';
import { aiApi } from '../services/api';
import { marked } from 'marked';

export const useNoteSummarizer = (note, contentInputRef) => {
  const inFlightRef = useRef(false);

  const handleSummarizeWithAI = useCallback(async (e) => {
    if (inFlightRef.current) return;
    console.log('[useNoteSummarizer] handleSummarizeWithAI called');
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!note?.content) {
        console.log('[useNoteSummarizer] No note content to summarize');
        return;
    }

    inFlightRef.current = true;

    const placeholderText = "✨ Generating summary...";

    try {
      // Insert placeholder as a custom node
      if (contentInputRef?.current) {
        console.log('[useNoteSummarizer] Inserting placeholder');
        contentInputRef.current.insertContent({
          type: 'aiPlaceholder',
          attrs: { text: placeholderText },
        });
      } else {
        console.error('[useNoteSummarizer] contentInputRef.current is null');
      }

      // Server-side will handle combining core prompt with custom additions
      const response = await aiApi.summarize(note.content);
      
      if (response && response.summary) {
        if (contentInputRef?.current) {
           // Parse markdown to HTML
           const summaryHtml = marked.parse(response.summary);

           // Try to replace the placeholder with smart summary
           const replaced = contentInputRef.current.insertSmartSummary(placeholderText, summaryHtml);
           
           // Fallback if placeholder was deleted or not found (e.g. user undid)
           if (!replaced) {
             console.log("Placeholder not found, inserting summary at cursor");
             // For fallback, we still want the details structure
             // We can reuse the logic by calling insertSmartSummary with a dummy text if we could, 
             // but insertSmartSummary relies on finding text.
             // So we'll just insert the HTML directly which might be less ideal but works as fallback
             // Or better, we can construct the JSON here too if we really wanted, but let's stick to simple fallback
             contentInputRef.current.insertContent(summaryHtml);
           }
        }
      }
    } catch (error) {
      console.error("Failed to summarize with AI:", error);
      // Try to remove placeholder on error
      if (contentInputRef?.current) {
          contentInputRef.current.replaceAIPlaceholder(placeholderText, "");
      }
      alert("Failed to summarize with AI. Please try again.");
    } finally {
      inFlightRef.current = false;
    }
  }, [note?.content, contentInputRef]);

  return { handleSummarizeWithAI };
};
