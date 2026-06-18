import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import styled, { keyframes } from "styled-components";
import NoteActionBar, {
  BottomActionContainer,
  ShowFooterHandle,
  NoteTagsButton,
  NoteColorsButton,
  NoteCloseButton,
  AddContentButton,
  PulsatingDot,
  TagCountBadge
} from "./NoteActionBar";
import Icon from "./Icons";

// Define Spacer and SaveIndicator locally as they were in NoteForm.jsx and are used here
const Spacer = styled.span`
  display: inline-block;
  width: 4px;
  height: 100%;
`;

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const SaveIndicator = styled.div`
  width: 18px;
  height: 18px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top: 2px solid var(--foreground-color);
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const DynamicActionBarsWrapper = React.memo(forwardRef((props, ref) => {
  const {
    contentInputRef,
    isMobile,
    isTyping,
    showActionBar: externalShowActionBar,
    note, color, images, noteTags, noteUrls, bookReferences, noteReferences,
    isModified, isAutoSaving, isDarkTheme, unsavedImageIds, isAddContentBusy,
    onRemoveImage, onTagClick, onRemoveTag, onBookClick, onNoteReferenceClick, onAddImageClick, onClose,
    onTagsModalClose, onToggleTagsModal, onToggleColorPicker,
    tagButtonRef, colorButtonRef, showTagsModal, showColorPicker, onColorSelect, onCloseTagsModal, onUndo, onRedo, canUndo, canRedo,
    onOpenHistory, // Add the version history handler
    editor, // Add editor prop
    onToggleAddContent, // Add the dropdown toggle handler    // AddContent dropdown props
    showAddContentDropdown,
    onAddTask,
    onAddNote,
    onSummarizeWithAI,
    onAddImage,
    onAddAttachment,
    onAddReminder, // Add missing prop
    onInsertOCR, // New prop
    onAddClipboardUrl,
    onCloseAddContentDropdown,
    clipboardUrl,
    clipboardUrlPreview,
    clipboardActionLabel,
    hasClipboardUrl,
    // Clipboard history dropdown props
    showClipboardDropdown,
    onToggleClipboardDropdown,
    clipboardHistory,
    onSelectClipboardSnippet,
    onRemoveClipboardSnippet,
    onToggleSticky,
    onCloseClipboardDropdown,
    hasClipboardHistory,
    // Suggested tags props
    suggestedTags,
    onAcceptSuggestedTag,
    onDismissSuggestedTag,
  } = props;

  const [actionBarClass, setActionBarClass] = useState("visible");
  const scrollDebounceRef = useRef(null);
  const isContentFocusedRef = useRef(false);

  // --- RE-ADDED FOR SWIPE GESTURE ---
  const [touchStartY, setTouchStartY] = useState(null);
  const SWIPE_THRESHOLD = 50;
  // ---

  const handleScroll = useCallback(() => {
    if (!isMobile || !contentInputRef.current) return;

    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }

    scrollDebounceRef.current = setTimeout(() => {
      const scrollableElement = contentInputRef.current?.getScrollableElement?.();
      if (!scrollableElement) return;

      const currentScrollTop = scrollableElement.scrollTop;

      // Keep scroll-down behavior (hide action bar when scrolling down)
      if (currentScrollTop > 10) {
        if (actionBarClass !== 'hidden') {
          setActionBarClass('hidden');
        }
      }
      // DISABLED: Scroll-to-top trigger (show action bar when scrolling to top)
      // TODO: Re-enable if needed by uncommenting the logic below
      /*
      else {
        if (actionBarClass !== 'visible') {
          setActionBarClass('visible');
        }
      }
      */
    }, 50);
  }, [isMobile, contentInputRef, actionBarClass]);

  // --- RE-ADDED HANDLERS FOR SWIPE ---
  const handleTouchStart = useCallback((e) => {
    if (!isMobile) return;
    setTouchStartY(e.touches[0].clientY);
  }, [isMobile]);
  const handleTouchEnd = useCallback((e) => {
    if (!isMobile || touchStartY === null) return;

    const touchEndY = e.changedTouches[0].clientY;
    const distance = touchEndY - touchStartY;

    // A downward swipe on the action bar hides it
    if (distance > SWIPE_THRESHOLD) {
      setActionBarClass("hidden");
    }

    // Reset for the next touch event
    setTouchStartY(null);
  }, [isMobile, touchStartY]);
  // ---

  // Handle Add Content button click - delegates to parent onToggleAddContent
  const handleAddContentClick = useCallback((e) => {
    if (onToggleAddContent) {
      onToggleAddContent(e);
    }
  }, [onToggleAddContent]);

  useEffect(() => {
    let scrollableElementForCleanup = null;
    let listenerTimeoutId = null;

    if (isMobile && contentInputRef.current) {
      listenerTimeoutId = setTimeout(() => {
        const editorRef = contentInputRef.current;
        if (editorRef && typeof editorRef.getScrollableElement === 'function') {
          const element = editorRef.getScrollableElement();
          if (element) {
            scrollableElementForCleanup = element;
            element.addEventListener("scroll", handleScroll, { passive: true });
          }
        }
      }, 150);
    }
    return () => {
      if (listenerTimeoutId) clearTimeout(listenerTimeoutId);
      if (scrollableElementForCleanup) {
        scrollableElementForCleanup.removeEventListener("scroll", handleScroll);
      }
      if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    };
  }, [isMobile, contentInputRef, handleScroll]);

  const handleShowFooter = useCallback(() => {
    setActionBarClass("visible");
  }, []);

  // While there are pending suggested tags, force the action bar visible —
  // suggestions are user-actionable and shouldn't be hidden by focus, scroll,
  // or other event-driven setActionBarClass("hidden") calls. Once the user
  // accepts/dismisses them all, normal hide behavior resumes.
  const effectiveActionBarClass = (suggestedTags && suggestedTags.length > 0)
    ? 'visible'
    : actionBarClass;

  // Compute inline style for bottom action container color - avoids styled-components class regeneration
  const bottomActionStyle = React.useMemo(() => {
    if (color && color !== 'default') {
      return {
        '--action-bar-bg-mobile': `var(--note-color-${color})`,
        '--badge-bg-color': `var(--note-color-${color})`
      };
    }
    return {};
  }, [color]);

  useImperativeHandle(ref, () => ({
    hideActionBar: () => {
      if (isMobile) {
        setActionBarClass("hidden");
      }
    },
    showActionBar: () => {
      if (externalShowActionBar && typeof externalShowActionBar === 'function') {
        externalShowActionBar();
      } else {
        setActionBarClass("visible");
      }
    },
    handleContentFocus: () => {
      if (isMobile) {
        isContentFocusedRef.current = true;
        setActionBarClass("hidden");
      }
    },
    handleContentBlur: () => {
      if (isMobile) {
        isContentFocusedRef.current = false;
      }
    }
  }), [isMobile, externalShowActionBar]);

  return (
    <>      <NoteActionBar
      note={note} color={color} images={images} noteTags={noteTags}
      noteUrls={noteUrls} bookReferences={bookReferences} noteReferences={noteReferences}
      isModified={isModified} isAutoSaving={isAutoSaving} isDarkTheme={isDarkTheme}
      isMobile={isMobile} actionBarClass={effectiveActionBarClass} unsavedImageIds={unsavedImageIds}
      isAddContentBusy={isAddContentBusy}
      onRemoveImage={onRemoveImage} onTagClick={onTagClick} onRemoveTag={onRemoveTag} onBookClick={onBookClick}
      onNoteReferenceClick={onNoteReferenceClick} onAddImageClick={onAddImageClick}
      onClose={onClose}
      // --- ADDED PROPS BACK TO NOTEACTIONBAR ---
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      // ---
      onTagsModalClose={onTagsModalClose} onToggleTagsModal={onToggleTagsModal}
      onToggleColorPicker={onToggleColorPicker} tagButtonRef={tagButtonRef}
      colorButtonRef={colorButtonRef} showTagsModal={showTagsModal}
      showColorPicker={showColorPicker} onColorSelect={onColorSelect}
      onCloseTagsModal={onCloseTagsModal} onUndo={onUndo} onRedo={onRedo} canUndo={canUndo} canRedo={canRedo}
      onOpenHistory={onOpenHistory} // Pass the version history handler
      editor={editor} // Pass the editor prop
      onToggleAddContent={onToggleAddContent} // Pass through to parent        // AddContent dropdown props
      showAddContentDropdown={showAddContentDropdown}
      onAddTask={onAddTask}
      onAddNote={onAddNote}
      onSummarizeWithAI={onSummarizeWithAI}
      onAddImage={onAddImage}
      onAddAttachment={onAddAttachment}
      onAddReminder={onAddReminder} // Pass missing prop
      onInsertOCR={onInsertOCR} // Pass new prop
      hasReminderIntent={props.hasReminderIntent} // Pass intent flag      
      onAddClipboardUrl={onAddClipboardUrl}
      onCloseAddContentDropdown={onCloseAddContentDropdown}
      clipboardUrl={clipboardUrl}
      clipboardUrlPreview={clipboardUrlPreview}
      clipboardActionLabel={clipboardActionLabel}
      hasClipboardUrl={hasClipboardUrl}
      showClipboardDropdown={showClipboardDropdown} // Added missing prop
      onToggleClipboardDropdown={onToggleClipboardDropdown}
      clipboardHistory={clipboardHistory}
      onSelectClipboardSnippet={onSelectClipboardSnippet}
      onRemoveClipboardSnippet={onRemoveClipboardSnippet}
      onToggleSticky={onToggleSticky}
      onCloseClipboardDropdown={onCloseClipboardDropdown}
      hasClipboardHistory={hasClipboardHistory}
      suggestedTags={suggestedTags}
      onAcceptSuggestedTag={onAcceptSuggestedTag}
      onDismissSuggestedTag={onDismissSuggestedTag}
    />
      <BottomActionContainer
        style={bottomActionStyle}
        $visible={effectiveActionBarClass === "hidden" && !showTagsModal && !showColorPicker}
        $isTyping={isTyping}
        $isDarkTheme={isDarkTheme}
      >
        <NoteCloseButton
          $isDarkTheme={isDarkTheme}
          onClick={onClose}
          aria-label="Close note"
        >
          {isAutoSaving ? (
            <SaveIndicator />
          ) : (
            <>
              {isModified && !isAutoSaving && (
                <>
                  <PulsatingDot title="Unsaved changes" /> <Spacer />
                </>
              )}
              <Icon name="close" size={20} strokeWidth="2.5" />
            </>
          )}
        </NoteCloseButton>
        <NoteTagsButton
          $isDarkTheme={isDarkTheme}
          title="Add tags"
          onClick={onToggleTagsModal}
          aria-label="Add tags"
          style={{ position: 'relative' }}
        >
          <Icon name="tag" size={20} strokeWidth="2.5" />
          {(() => {
            const nonFolderTagCount = noteTags ? noteTags.filter(tag => !tag.is_folder).length : 0;
            return nonFolderTagCount > 0 && (
              <TagCountBadge style={bottomActionStyle} $isDarkTheme={isDarkTheme}> {nonFolderTagCount} </TagCountBadge>
            );
          })()}
        </NoteTagsButton>
        <ShowFooterHandle
          $isDarkTheme={isDarkTheme}
          onClick={handleShowFooter}
          aria-label="Show note footer"
        >
          <Icon name="arrow_up_caret" size={20} strokeWidth="3" />
        </ShowFooterHandle>
        <NoteColorsButton
          $isDarkTheme={isDarkTheme}
          title="Pick Color"
          onClick={onToggleColorPicker}
          aria-label="Pick Color"
        >
          <Icon name="palette" size={20} strokeWidth="2.5" />
        </NoteColorsButton>
        <AddContentButton
          $isDarkTheme={isDarkTheme}
          onClick={handleAddContentClick}
          title={isAddContentBusy ? 'Working…' : 'Add content'}
          disabled={isAutoSaving || isAddContentBusy}
          aria-label="Add content"
        >
          {isAddContentBusy ? (
            <SaveIndicator />
          ) : (
            <Icon name="add" size={20} strokeWidth="2.5" />
          )}
        </AddContentButton>
      </BottomActionContainer>
    </>
  );
}));

export default DynamicActionBarsWrapper;