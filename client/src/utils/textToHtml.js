import { marked } from 'marked';

// URL regex - matches http://, https://, and www. URLs
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>[\](){}'"`,]+/gi;

export function markdownToHtml(text) {
    const normalized = text.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const parts = [];
    let blockLines = [];

    const flushBlock = () => {
        if (blockLines.length > 0) {
            parts.push(marked.parse(blockLines.join('\n')).trim());
            blockLines = [];
        }
    };

    for (const line of lines) {
        if (line.trim() === '') {
            flushBlock();
            parts.push('<p></p>');
        } else {
            blockLines.push(line);
        }
    }
    flushBlock();

    // Strip leading/trailing blank paragraphs
    while (parts[0] === '<p></p>') parts.shift();
    while (parts[parts.length - 1] === '<p></p>') parts.pop();

    return parts.join('');
}

export function formatPlainTextPasteToHtml(text) {
    // 1. Normalize line endings
    const normalizedText = text.replace(/\r\n?/g, '\n');
    
    // 2. Handle edge case: Input is entirely empty or just whitespace
    if (normalizedText.trim() === '') {
        const linesCount = (normalizedText.match(/\n/g) || []).length + 1;
        if (linesCount > 0) {
            return '<p></p>'.repeat(linesCount);
        }
        return '<p></p>';
    }

    // Utility to escape HTML characters and preserve whitespace
    const escapeHtml = (unsafe) => {
        if (!unsafe) return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;")
             // Preserve leading spaces by converting to &nbsp;
             .replace(/^ +/gm, match => '&nbsp;'.repeat(match.length))
             // Preserve multiple consecutive spaces (2+ spaces) by converting to &nbsp;
             .replace(/ {2,}/g, match => '&nbsp;'.repeat(match.length));
    };

    // Linkify URLs in a string
    const linkifyText = (str) => {
        if (!str) return '';
        
        let result = '';
        let lastIndex = 0;
        
        // Reset regex
        URL_REGEX.lastIndex = 0;
        
        let match;
        while ((match = URL_REGEX.exec(str)) !== null) {
            // Add text before URL (escaped)
            if (match.index > lastIndex) {
                result += escapeHtml(str.slice(lastIndex, match.index));
            }
            
            // Add the URL as a link
            let url = match[0];
            let href = url;
            // Ensure href has protocol
            if (url.startsWith('www.')) {
                href = 'https://' + url;
            }
            
            result += `<a href="${escapeHtml(href)}">${escapeHtml(url)}</a>`;
            lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text after last URL
        if (lastIndex < str.length) {
            result += escapeHtml(str.slice(lastIndex));
        }
        
        return result || escapeHtml(str);
    };

    // 3. Split the text into lines
    const lines = normalizedText.split('\n');

    // 4. Process each line into a <p> tag with linkified URLs
    const htmlParts = lines.map(line => {
        if (line.trim() === '') {
            return '<p></p>';
        } else {
            return `<p>${linkifyText(line)}</p>`;
        }
    });

    return htmlParts.join('');
}
