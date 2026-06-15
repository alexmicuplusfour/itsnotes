// Clean and sanitize HTML content for Tiptap compatibility
const cleanHtmlForTiptap = (html) => {
    if (!html || typeof html !== 'string') return '<p></p>';
    
    // Create a temporary DOM element to parse and clean the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Remove unwanted wrapper elements that Readability might add
    const readabilityWrappers = tempDiv.querySelectorAll('#readability-page-1, .page');
    readabilityWrappers.forEach(wrapper => {
        // Move all children out of the wrapper
        while (wrapper.firstChild) {
            wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
        }
        wrapper.remove();
    });
    
    // Remove unwanted elements that might break Tiptap
    const unwantedElements = tempDiv.querySelectorAll('script, style, meta, link, title, iframe, object, embed, applet');
    unwantedElements.forEach(el => el.remove());
    
    // Remove empty paragraphs with only whitespace, &nbsp;, or <br> tags
    const paragraphs = tempDiv.querySelectorAll('p');
    paragraphs.forEach(p => {
        const textContent = p.textContent.replace(/\s/g, '').replace(/\u00A0/g, ''); // Remove all whitespace and &nbsp;
        const hasOnlyBr = p.innerHTML.trim().match(/^(<br[^>]*>\s*)+$/i);
        if (!textContent && (hasOnlyBr || !p.innerHTML.trim())) {
            p.remove();
        }
    });
    
    // Convert div elements to paragraphs if they don't contain block elements
    const divs = tempDiv.querySelectorAll('div');
    divs.forEach(div => {
        // Skip divs that are inside tables
        if (div.closest('table')) return;
        
        const hasBlockChildren = div.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, div, table');
        if (!hasBlockChildren) {
            const p = document.createElement('p');
            p.innerHTML = div.innerHTML;
            div.parentNode.replaceChild(p, div);
        } else {
            // If div has block children, unwrap it
            while (div.firstChild) {
                div.parentNode.insertBefore(div.firstChild, div);
            }
            div.remove();
        }
    });
    
    // Add empty paragraphs after each paragraph for spacing (but not after the last element in parent)
    const allParagraphs = Array.from(tempDiv.querySelectorAll('p'));
    allParagraphs.forEach((p) => {
        const nextElement = p.nextElementSibling;
        // Add spacing if there's a next element and it's not already an empty paragraph
        if (nextElement && 
            !(nextElement.tagName === 'P' && nextElement.innerHTML === '')) {
            
            const emptyP = document.createElement('p');
            emptyP.innerHTML = ''; // Completely empty
            p.parentNode.insertBefore(emptyP, nextElement);
        }
    });
    
    // Add empty paragraphs after blockquotes, code blocks, and other elements for spacing
    const elementsToSpace = ['blockquote', 'pre', 'code', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4'];
    elementsToSpace.forEach(elementType => {
        const elements = Array.from(tempDiv.querySelectorAll(elementType));
        elements.forEach(element => {
            const nextElement = element.nextElementSibling;
            // Add spacing if there's a next element and it's not already an empty paragraph
            if (nextElement && 
                !(nextElement.tagName === 'P' && nextElement.innerHTML === '')) {
                
                const emptyP = document.createElement('p');
                emptyP.innerHTML = ''; // Completely empty
                element.parentNode.insertBefore(emptyP, nextElement);
            }
        });
    });
    
    // Clean up whitespace between tags
    let cleanedHtml = tempDiv.innerHTML
        .replace(/>\s+</g, '><') // Remove whitespace between tags
        .trim();
    
    // Remove leading and trailing whitespace from the entire content
    cleanedHtml = cleanedHtml.replace(/^\s+|\s+$/g, '');
    
    if (!cleanedHtml) return '<p></p>';
    
    // Wrap content in paragraph if it doesn't start with a block element
    if (!cleanedHtml.match(/^<(p|h[1-6]|ul|ol|blockquote|div|table)/i)) {
        return `<p>${cleanedHtml}</p>`;
    }
    
    return cleanedHtml;
}; 

// Export the cleanHtmlForTiptap function
export { cleanHtmlForTiptap };

// Helper function to clean content by removing image markers
export const getCleanContent = (content) => {
  if (!content) return '';
  // Remove any image marker patterns from the content
  return content.replace(/\[image:([a-zA-Z0-9-]+)\]/g, '').trim();
};

// Fallback clipboard function for mobile devices
export const copyTextWithFallback = (text) => {
  // Create a temporary textarea element
  const textArea = document.createElement('textarea');
  textArea.value = text;
  
  // Make the textarea out of viewport
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  
  // Focus and select the text
  textArea.focus();
  textArea.select();
  
  let success = false;
  try {
    // Execute the copy command
    success = document.execCommand('copy');
  } catch (err) {
    console.error('Fallback clipboard copy failed:', err);
  }
  
  // Clean up
  document.body.removeChild(textArea);
  return success;
};

// URL diversity prioritization function
const prioritizeUrlsByDiversity = (urls, maxUrls = 8) => {
  if (urls.length <= maxUrls) return urls;
  
  // Group URLs by domain
  const domainGroups = {};
  urls.forEach(urlItem => {
    const domain = urlItem.domain;
    if (!domainGroups[domain]) {
      domainGroups[domain] = [];
    }
    domainGroups[domain].push(urlItem);
  });
  
  const domains = Object.keys(domainGroups);
  const result = [];
  
  // If we have many unique domains, prioritize one URL per domain first
  if (domains.length > maxUrls / 2) {
    // Add one URL from each domain first
    domains.forEach(domain => {
      if (result.length < maxUrls) {
        result.push(domainGroups[domain][0]);
        domainGroups[domain].shift(); // Remove the added URL
      }
    });
  } else {
    // Calculate max URLs per domain with diversity in mind
    const maxPerDomain = Math.max(1, Math.floor(maxUrls * 0.75 / domains.length));
    
    // Add URLs from each domain, respecting the max per domain
    domains.forEach(domain => {
      const urlsToAdd = Math.min(maxPerDomain, domainGroups[domain].length);
      for (let i = 0; i < urlsToAdd && result.length < maxUrls; i++) {
        result.push(domainGroups[domain][i]);
      }
      // Remove added URLs
      domainGroups[domain].splice(0, urlsToAdd);
    });
  }
  
  // Fill remaining slots with any leftover URLs
  for (const domain of domains) {
    while (domainGroups[domain].length > 0 && result.length < maxUrls) {
      result.push(domainGroups[domain].shift());
    }
  }
  
  return result;
};

// Reduce a hostname to its registrable domain for chip display
// (e.g. web.archive.org -> archive.org, www.nature.com -> nature.com).
// Handles common two-part public suffixes like .co.uk, .com.au.
const TWO_PART_SLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
const toDisplayDomain = (hostname) => {
  const labels = hostname.replace(/^www\./, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const last = labels[labels.length - 1];
  const secondLast = labels[labels.length - 2];
  if (last.length === 2 && TWO_PART_SLDS.has(secondLast)) {
    return labels.slice(-3).join('.');
  }
  return labels.slice(-2).join('.');
};

// URL extraction function
export const extractUrls = (text) => {
  if (!text) return [];

  // Regular expression to match URLs - more strict pattern
  // Matches URLs with proper domain structure
  const urlRegex = /(https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w\/_.-])*)?(?:\?(?:[\w&=%.#-])*)?(?:\#(?:[\w.-])*)?|www\.(?:[-\w.])+(?:\/(?:[\w\/_.-])*)?(?:\?(?:[\w&=%.#-])*)?(?:\#(?:[\w.-])*)?)/gi;

  // Extract URLs and return unique values
  const urls = text.match(urlRegex) || [];
  const urlItems = [...new Set(urls)].map(url => {
    // Clean the URL by trimming whitespace and removing trailing punctuation
    const cleanUrl = url.trim().replace(/[.,;:)]+$/, '');

    // Ensure URL has a protocol for the href attribute
    const href = cleanUrl.startsWith('www.') ? `https://${cleanUrl}` : cleanUrl;

    // Basic validation - must have at least a domain with a dot
    if (!href.includes('.') || href.length < 7) {
      console.warn('Skipping invalid URL (too short or no domain):', cleanUrl);
      return null;
    }

    let domain;
    try {
      domain = toDisplayDomain(new URL(href).hostname);
    } catch (e) {
      console.warn('Skipping invalid URL:', cleanUrl, e.message);
      return null;
    }

    return { url: href, domain };
  }).filter(Boolean); // Remove null entries
  
  // Apply diversity prioritization with 8 URL limit
  return prioritizeUrlsByDiversity(urlItems, 8);
}; 

// Helper function to decode HTML entities
export const decodeHtmlEntities = (text) => {
  if (!text) return "";
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

// Book references extraction function - format {book title}
export const extractBookReferences = (htmlContent) => {
  if (!htmlContent) return [];

  const MAX_TITLE_LENGTH = 50;
  const MIN_TITLE_LENGTH = 3; // Added minimum length
  const MAX_REFERENCES_TO_RETURN = 10;

  // Regex: Matches content between {}, ensuring NO literal newline \n inside.
  // It captures the content inside the braces in group 1.
  const bookRegex = /\{([^{}\n]+)\}/g; // Added \n exclusion

  const validTitles = [];
  const seenTitles = new Set(); // Keep track of unique decoded titles found
  let match;

  // Reset lastIndex before starting the loop is good practice for global regexes
  bookRegex.lastIndex = 0;

  while ((match = bookRegex.exec(htmlContent)) !== null) {
    // Check if we've already found enough references
    if (validTitles.length >= MAX_REFERENCES_TO_RETURN) {
      console.log("[extractBookReferences] Reached maximum reference limit (10).");
      break; // Stop searching
    }

    const rawContentInsideBraces = match[1]; // The actual text captured *between* the braces

    // --- Filtering Criteria ---

    // 1. Check for HTML line breaks (<br>, <BR>, <br />, etc.) in the raw content
    //    This helps enforce the "single line" rule even with HTML tags.
    if (/<br\s*\/?>/i.test(rawContentInsideBraces)) {
      // console.log(`[extractBookReferences] Discarding due to <br>: {${rawContentInsideBraces}}`);
      continue; // Skip this match
    }

    // 2. Decode and Trim
    const decodedTitle = decodeHtmlEntities(rawContentInsideBraces).trim();

    // 3. Check Length Constraints
    if (decodedTitle.length < MIN_TITLE_LENGTH || decodedTitle.length > MAX_TITLE_LENGTH) {
      // console.log(`[extractBookReferences] Discarding due to length (${decodedTitle.length}): ${decodedTitle}`);
      continue; // Skip this match
    }

    // 4. Check for Uniqueness (using the decoded+trimmed title)
    if (seenTitles.has(decodedTitle)) {
      // console.log(`[extractBookReferences] Discarding duplicate: ${decodedTitle}`);
      continue; // Skip this duplicate match
    }

    // --- If all checks pass, it's a valid title ---
    validTitles.push(decodedTitle);
    seenTitles.add(decodedTitle); // Add to set to track uniqueness
  }

  console.log(`[extractBookReferences] Found ${validTitles.length} valid references.`);
  // The limit is already enforced by the loop break, but slicing doesn't hurt as a safeguard.
  return validTitles.slice(0, MAX_REFERENCES_TO_RETURN);
};

// Note references extraction function - UUID format
// Extract UUIDs from text, excluding those that are part of URLs
export const extractNoteReferences = (text) => {
  if (!text) return [];

  // First extract all URLs from the text with error handling
  let urls = [];
  let urlStrings = [];
  try {
    urls = extractUrls(text);
    urlStrings = urls.map((urlItem) => urlItem.url);
  } catch (error) {
    console.warn('Error extracting URLs in note references:', error);
    urls = [];
    urlStrings = [];
  }

  // UUID pattern - matches standard UUID format, optionally followed by #<digits>
  const uuidPattern =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(#\d+)?\b/gi; // Added optional #<digits>

  // Find all UUIDs (with optional scroll position) in the text
  const references = new Set(); // Using Set to automatically handle duplicates
  let match;

  // Reset the lastIndex property to start searching from the beginning
  uuidPattern.lastIndex = 0;

  while ((match = uuidPattern.exec(text)) !== null) {
    const reference = match[0]; // This might be UUID or UUID#scroll

    // Check if this reference string is part of any URL
    const isInUrl = urlStrings.some((url) => url.includes(reference));

    // Only add if it's not part of a URL
    if (!isInUrl) {
      references.add(reference); // Add the full reference (UUID or UUID#scroll)
    }
  }

  return Array.from(references); // Convert Set back to Array for the return value
};