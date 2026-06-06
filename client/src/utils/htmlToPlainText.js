/**
 * Converts HTML content to plain text format, preserving empty lines and spaces
 * This mimics TipTap's clipboardTextSerializer behavior to create plain text content for search
 */
import { htmlToText as htmlToText } from "html-to-text";
/**
 * Convert HTML content to plain text while preserving whitespace and empty lines
 *
 * @param {string} htmlContent - HTML content to convert
 * @returns {string} - Plain text representation of the HTML content
 */
export function convertHtmlToPlainText(htmlContent) {
  if (!htmlContent || htmlContent.trim() === '') {
    return '';
  }

  // Pre-processing: Replace empty/whitespace-only paragraphs with a non-breaking space
  // to help html-to-text recognize them as distinct blocks.
  let processedHtml = htmlContent.replace(/<p>\s*<\/p>/gi, '<p> </p>');

  // Configure htmlToText options
  const options = {
    wordwrap: false,
    preserveNewlines: true, // Keep existing newlines and those from <br>
    baseElements: { selectors: ['body'] }, // Use body as the base context
    selectors: [
      // Define newline handling for block elements
      { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'h1', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'h2', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'h3', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'h4', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'h5', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'h6', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'ul', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      { selector: 'ol', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      // Use inline format for list items
      { selector: 'li', format: 'inline', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },

      // Handle line breaks directly
      { selector: 'br', format: 'lineBreak' }, // Converts <br> to \n

      // Skip elements that don't contribute to text content
      { selector: 'img', format: 'skip' },
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'head', format: 'skip' },
      { selector: 'a', options: { ignoreHref: true } }, // Keep link text, ignore href
    ]
  };

  let plainText = htmlToText(processedHtml, options);

  // Post-processing: Remove lines consisting solely of the space character
  // which resulted from the   pre-processing trick.
  // The 'm' flag makes ^ and $ match start/end of lines.
  plainText = plainText.replace(/^ $/gm, '');

  // Trim leading/trailing whitespace from the final result.
  plainText = plainText.trim();

  return plainText;
}
