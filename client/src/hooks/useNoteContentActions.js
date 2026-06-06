import { useState, useCallback, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import api, { objectsApi, tagsApi } from '../services/api';
import { useAutoTagging, AUTO_TAG_FEATURES } from '../contexts/AutoTaggingContext';
import { DOMSerializer } from 'prosemirror-model';

export const useNoteContentActions = ({
    getEditor,
    createNote,
    saveNoteFromHook,
    markAsModified,
    extractSpecificUrl,
    note, // Current note
    // Auto-tagging callbacks
    onAutoApplyTags,
    onSuggestTags,
}) => {
    const { shouldAutoApply, getFeatureTags } = useAutoTagging();
    const [showAddContentDropdown, setShowAddContentDropdown] = useState(false);
    const [clipboardUrl, setClipboardUrl] = useState(null);
    const [isGoodreadsExtracting, setIsGoodreadsExtracting] = useState(false);
    const [isImdbExtracting, setIsImdbExtracting] = useState(false);

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

    // Check clipboard for URL content
    const checkClipboardForUrl = useCallback(async () => {
        // Security check: Clipboard API requires HTTPS (Secure Context)
        // In insecure contexts (like Play with Docker HTTP), accessing it can cause issues or be blocked.
        // Also check if navigator.clipboard exists
        if (window.isSecureContext === false || !navigator.clipboard || !navigator.clipboard.readText) {
            console.log('[useNoteContentActions] Skipping clipboard check (Insecure Context or API unavailable)');
            setClipboardUrl(null);
            return null;
        }

        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                // Check if the clipboard content looks like a URL
                const urlPattern = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
                if (urlPattern.test(text.trim())) {
                    setClipboardUrl(text.trim());
                    return text.trim();
                }
            }
        } catch (error) {
            console.warn('[useNoteContentActions] Could not access clipboard:', error);
        }
        setClipboardUrl(null);
        return null;
    }, []);

    const clipboardActionLabel = useMemo(() => {
        if (!clipboardUrl) return 'Add Content from URL';
        const url = clipboardUrl.toLowerCase();
        if (url.includes('goodreads.com')) return 'Add Goodreads Title';
        if (url.includes('imdb.com')) return 'Add IMDb Title';
        if (url.includes('themoviedb.org')) return 'Add TMDB Title';
        return 'Add Content from URL';
    }, [clipboardUrl]);

    // Effect to check clipboard when dropdown opens
    // This separates the side effect from the event handler to prevent UI blocking
    useEffect(() => {
        if (showAddContentDropdown) {
            checkClipboardForUrl().catch(err => console.warn('Clipboard check failed', err));
        }
    }, [showAddContentDropdown, checkClipboardForUrl]);


    const handleToggleAddContent = useCallback((e, isSaving) => {
        // e can be null if called programmatically
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (!isSaving) {
            setShowAddContentDropdown(prev => !prev);
        }
    }, [showAddContentDropdown]);

    const handleAddTask = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowAddContentDropdown(false);

        const editor = getEditor();
        if (!editor) {
            console.warn('[useNoteContentActions] No editor instance available for task list insertion');
            return;
        }

        try {
            // Ensure editor is focused and ready
            editor.chain().focus().toggleTaskList().run();
        } catch (error) {
            console.error('[useNoteContentActions] Error inserting task list:', error);
        }
    }, [getEditor]);

    const handleAddNote = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowAddContentDropdown(false);

        const editor = getEditor();
        if (!editor) {
            console.warn('[useNoteContentActions] No editor instance available for note insertion');
            return;
        }

        try {
            console.log('[useNoteContentActions] Creating new linked note...');

            // Check if there's selected text to use as initial content for the new note
            const { from, to } = editor.state.selection;
            let selectedHtml = '';
            
            if (from !== to) {
                // There's a selection - extract it as HTML
                try {
                    const slice = editor.state.doc.slice(from, to);
                    if (slice.content.size > 0) {
                        const schema = editor.state.schema;
                        const tempDiv = document.createElement('div');
                        const serializer = DOMSerializer.fromSchema(schema);
                        serializer.serializeFragment(slice.content, { document }, tempDiv);
                        selectedHtml = tempDiv.innerHTML;
                        
                        // If the selection is entirely within a single block node (heading, paragraph, etc.),
                        // the slice may only contain text nodes without the wrapper.
                        // Check if we need to wrap it in the parent block's tag.
                        const $from = editor.state.doc.resolve(from);
                        const $to = editor.state.doc.resolve(to);
                        
                        // If both ends are in the same parent and it's a block node like heading
                        if ($from.parent === $to.parent && $from.parent.type.name !== 'doc') {
                            const parentNode = $from.parent;
                            const parentType = parentNode.type.name;
                            
                            // If the slice content is just text (no block wrapper), wrap it
                            if (parentType === 'heading') {
                                const level = parentNode.attrs.level || 1;
                                selectedHtml = `<h${level}>${selectedHtml}</h${level}>`;
                            } else if (parentType === 'blockquote') {
                                selectedHtml = `<blockquote>${selectedHtml}</blockquote>`;
                            } else if (parentType === 'codeBlock') {
                                selectedHtml = `<pre><code>${selectedHtml}</code></pre>`;
                            }
                            // paragraph is already fine as-is, Tiptap will wrap plain text in <p>
                        }
                        
                        console.log('[useNoteContentActions] Selected content extracted as HTML:', selectedHtml.substring(0, 100) + '...');
                    }
                } catch (serializeError) {
                    console.warn('[useNoteContentActions] Failed to serialize selection to HTML:', serializeError);
                }
            }

            // 1. Create new note (with selected content if any)
            const newNote = await createNote({
                title: '',
                content: selectedHtml,
                color: 'default'
            });

            if (newNote && newNote.id) {
                console.log('[useNoteContentActions] New note created with ID:', newNote.id);

                // If there was a selection, collapse it to the end before inserting UUID
                // This prevents the UUID from replacing the selected text
                if (from !== to) {
                    editor.chain().focus().setTextSelection(to).run();
                }

                // 2. Insert UUID into current note at cursor position
                // Re-read selection state after potential collapse
                const currentSelection = editor.state.selection;
                const currentFrom = currentSelection.from;
                const currentTo = currentSelection.to;
                const $from = editor.state.doc.resolve(currentFrom);

                // Check if cursor is at the start of an empty paragraph
                const isAtStartOfEmptyParagraph = $from.parent.type.name === 'paragraph' &&
                    $from.parent.content.size === 0 &&
                    currentFrom === $from.start();

                // Check if cursor is at the end of a paragraph with content
                const isAtEndOfParagraph = currentFrom === currentTo && currentFrom === $from.end();
                const hasContentBefore = $from.parent.content.size > 0;

                // Insert UUID as an explicit paragraph to avoid inheriting block formatting (e.g., headings)
                // We use a paragraph node structure to ensure clean formatting
                let success;
                if (isAtStartOfEmptyParagraph && $from.parent.type.name === 'paragraph') {
                    // Already on an empty paragraph, just insert UUID text
                    success = editor.chain()
                        .focus()
                        .unsetAllMarks()
                        .insertContent(newNote.id + ' ')
                        .run();
                } else {
                    // Insert UUID in a new paragraph to ensure it's not formatted as heading/etc
                    success = editor.chain()
                        .focus()
                        .insertContent([
                            { type: 'paragraph', content: [{ type: 'text', text: newNote.id + ' ' }] }
                        ])
                        .run();
                }

                if (success) {
                    console.log('[useNoteContentActions] UUID inserted into editor with proper spacing');

                    // Get the updated content directly from the editor
                    const newContent = editor.getHTML();

                    // Force an immediate save with the new content
                    // This ensures the link is saved even if the user navigates away immediately
                    saveNoteFromHook({
                        forceSave: true,
                        content: newContent
                    });

                    // Auto-tag the newly created child note if enabled
                    if (shouldAutoApply(AUTO_TAG_FEATURES.LINKED_NOTE)) {
                        const linkedNoteTagIds = getFeatureTags(AUTO_TAG_FEATURES.LINKED_NOTE);
                        if (linkedNoteTagIds.length > 0) {
                            console.log('[useNoteContentActions] Auto-tagging linked note with tags:', linkedNoteTagIds);
                            for (const tagId of linkedNoteTagIds) {
                                try {
                                    await tagsApi.addTagToNote(newNote.id, tagId);
                                } catch (tagError) {
                                    console.warn('[useNoteContentActions] Failed to auto-assign tag to linked note:', tagId, tagError);
                                }
                            }
                        }
                    }
                } else {
                    console.warn('[useNoteContentActions] Failed to insert UUID into editor');
                }
            } else {
                console.error('[useNoteContentActions] Failed to create note or note has no ID');
            }
        } catch (error) {
            console.error('[useNoteContentActions] Error creating linked note:', error);
        }
    }, [getEditor, createNote, saveNoteFromHook, shouldAutoApply, getFeatureTags]);

    const handleAddContentImageClick = useCallback((e, handleAddImageClickOriginal) => {
        e.preventDefault();
        e.stopPropagation();
        setShowAddContentDropdown(false);
        if (handleAddImageClickOriginal) {
            handleAddImageClickOriginal();
        }
    }, []);

    const handleAddContentFromClipboard = useCallback(async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowAddContentDropdown(false);

        if (clipboardUrl) {
            console.log('[useNoteContentActions] Extracting content from clipboard URL:', clipboardUrl);

            // --- Goodreads Check ---
            if (clipboardUrl.includes('goodreads.com') && setIsGoodreadsExtracting) {
                setIsGoodreadsExtracting(true);
                try {
                    // First, extract book data from Goodreads
                    const response = await api.post('/notes/extract-goodreads', { url: clipboardUrl });
                    const bookData = response.data;

                    // Create or find existing object in centralized storage
                    const { object, created } = await objectsApi.findOrCreate({
                        type: 'book',
                        title: bookData.title,
                        thumbnail_url: bookData.cover,
                        source_url: bookData.url || clipboardUrl,
                        metadata: {
                            source: {
                                title: bookData.title,
                                author: bookData.author,
                                year: bookData.publishedYear ? parseInt(bookData.publishedYear) : null,
                                rating: bookData.rating ? parseFloat(bookData.rating) : null,
                                cover_url: bookData.cover,
                                goodreads_url: bookData.url || clipboardUrl,
                                page_count: bookData.total_pages || null,
                                description: bookData.description || null
                            },
                            user: {
                                status: 'want_to_read'
                            }
                        }
                    });

                    console.log(`[useNoteContentActions] Book object ${created ? 'created' : 'found'}:`, object.id);

                    const editor = getEditor();
                    if (editor) {
                        // Insert the new ObjectCard that references the centralized object
                        editor.chain().focus().insertContent({
                            type: 'objectCard',
                            attrs: {
                                objectId: object.id,
                                objectType: 'book'
                            }
                        }).run();
                        console.log('[useNoteContentActions] Object card inserted for book');
                        markAsModified();

                        // Handle auto-tagging for book added
                        if (onAutoApplyTags) {
                            onAutoApplyTags('book_added');
                        }
                        if (onSuggestTags) {
                            onSuggestTags('book_added');
                        }
                    }
                    return; // Stop here if Goodreads
                } catch (error) {
                    console.error('[useNoteContentActions] Goodreads extraction failed, falling back to standard extraction', error);
                    // Fallback to standard extraction continue...
                } finally {
                    setIsGoodreadsExtracting(false);
                }
            }

            // --- IMDb Check ---
            if (clipboardUrl.includes('imdb.com')) {
                // Use unified extraction endpoint that auto-detects movie vs show
                setIsImdbExtracting(true);
                try {
                    const response = await api.post('/notes/extract-imdb', { url: clipboardUrl });
                    const data = response.data;
                    const contentType = data.type; // 'movie' or 'show'

                    console.log(`[useNoteContentActions] Extracted ${contentType}:`, data.title);

                    // Build metadata based on content type
                    let metadata;
                    if (contentType === 'show') {
                        metadata = {
                            source: {
                                title: data.title,
                                creator: data.creator,
                                start_year: data.startYear ? parseInt(data.startYear) : null,
                                end_year: data.endYear ? parseInt(data.endYear) : null,
                                imdb_rating: data.rating ? parseFloat(data.rating) : null,
                                poster_url: data.poster,
                                imdb_url: clipboardUrl,
                                seasons: data.seasons || null,
                                episodes: data.episodes || null
                            },
                            user: {
                                status: 'want_to_watch'
                            }
                        };
                    } else {
                        metadata = {
                            source: {
                                title: data.title,
                                director: data.director,
                                year: data.year ? parseInt(data.year) : null,
                                imdb_rating: data.rating ? parseFloat(data.rating) : null,
                                poster_url: data.poster,
                                imdb_url: clipboardUrl
                            },
                            user: {
                                status: 'want_to_watch'
                            }
                        };
                    }

                    // Create or find existing object in centralized storage
                    const { object, created } = await objectsApi.findOrCreate({
                        type: contentType,
                        title: data.title,
                        thumbnail_url: data.poster,
                        source_url: clipboardUrl,
                        metadata: metadata
                    });

                    console.log(`[useNoteContentActions] ${contentType} object ${created ? 'created' : 'found'}:`, object.id);

                    const editor = getEditor();
                    if (editor) {
                        editor.chain().focus().insertContent({
                            type: 'objectCard',
                            attrs: {
                                objectId: object.id,
                                objectType: contentType
                            }
                        }).run();
                        console.log(`[useNoteContentActions] Object card inserted for ${contentType}`);
                        markAsModified();

                        // Handle auto-tagging for IMDB added
                        if (onAutoApplyTags) {
                            onAutoApplyTags('imdb_added');
                        }
                        if (onSuggestTags) {
                            onSuggestTags('imdb_added');
                        }
                    }

                    return; // Stop here if IMDb extraction succeeded
                } catch (error) {
                    console.error('[useNoteContentActions] IMDb extraction failed, falling back to standard extraction', error);
                } finally {
                    setIsImdbExtracting(false);
                }
            }

            // --- TMDB Check ---
            if (clipboardUrl.includes('themoviedb.org')) {
                setIsImdbExtracting(true);
                try {
                    const response = await api.post('/notes/extract-tmdb', { url: clipboardUrl });
                    const data = response.data;
                    const contentType = data.type; // 'movie' or 'show'

                    console.log(`[useNoteContentActions] Extracted TMDB ${contentType}:`, data.title);

                    let metadata;
                    if (contentType === 'show') {
                        metadata = {
                            source: {
                                title: data.title,
                                creator: data.creator,
                                start_year: data.startYear ? parseInt(data.startYear) : null,
                                end_year: data.endYear ? parseInt(data.endYear) : null,
                                imdb_rating: data.rating ? parseFloat(data.rating) : null,
                                poster_url: data.poster,
                                imdb_url: clipboardUrl,
                                seasons: data.seasons || null,
                                episodes: data.episodes || null
                            },
                            user: {
                                status: 'want_to_watch'
                            }
                        };
                    } else {
                        metadata = {
                            source: {
                                title: data.title,
                                director: data.director,
                                year: data.year ? parseInt(data.year) : null,
                                imdb_rating: data.rating ? parseFloat(data.rating) : null,
                                poster_url: data.poster,
                                imdb_url: clipboardUrl
                            },
                            user: {
                                status: 'want_to_watch'
                            }
                        };
                    }

                    const { object, created } = await objectsApi.findOrCreate({
                        type: contentType,
                        title: data.title,
                        thumbnail_url: data.poster,
                        source_url: clipboardUrl,
                        metadata: metadata
                    });

                    console.log(`[useNoteContentActions] TMDB ${contentType} object ${created ? 'created' : 'found'}:`, object.id);

                    const editor = getEditor();
                    if (editor) {
                        editor.chain().focus().insertContent({
                            type: 'objectCard',
                            attrs: {
                                objectId: object.id,
                                objectType: contentType
                            }
                        }).run();
                        markAsModified();

                        if (onAutoApplyTags) {
                            onAutoApplyTags('imdb_added');
                        }
                        if (onSuggestTags) {
                            onSuggestTags('imdb_added');
                        }
                    }

                    return;
                } catch (error) {
                    console.error('[useNoteContentActions] TMDB extraction failed, falling back to standard extraction', error);
                } finally {
                    setIsImdbExtracting(false);
                }
            }

            // Standard URL Extraction
            try {
                await extractSpecificUrl(clipboardUrl, 'text');
            } catch (error) {
                console.error('[useNoteContentActions] Error extracting from clipboard URL:', error);
            }
        }
    }, [clipboardUrl, extractSpecificUrl, getEditor, markAsModified, setIsGoodreadsExtracting, setIsImdbExtracting]);

    const handleCloseAddContentDropdown = useCallback(() => {
        setShowAddContentDropdown(false);
    }, []);

    return {
        showAddContentDropdown,
        setShowAddContentDropdown,
        clipboardUrl,
        setClipboardUrl,
        checkClipboardForUrl,
        getTruncatedUrl,
        handleToggleAddContent,
        handleAddTask,
        handleAddNote,
        handleAddContentImageClick,
        handleAddContentFromClipboard,
        handleCloseAddContentDropdown,
        isGoodreadsExtracting,
        isImdbExtracting,
        clipboardActionLabel
    };
};
