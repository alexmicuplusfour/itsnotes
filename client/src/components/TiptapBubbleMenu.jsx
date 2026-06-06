import React, { useState, useEffect } from 'react';
import { BubbleMenu } from '@tiptap/react';
import styled from 'styled-components';
import Icon from "./Icons";

const MenuContainer = styled.div.attrs({
  onMouseDown: (e) => {
    e.preventDefault();
    e.stopPropagation();
  }
})`
  display: flex;
  background-color: var(--foreground-color, #fff);
  border-radius: 50vh;
  box-shadow: 0 1px 3px 0 rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15);
  overflow: hidden;
  padding: 5px;
  margin-bottom: 5px;
  z-index: 100; // Lowered z-index slightly, check if still appropriate
`;

const MenuButton = styled.button`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 50vh;
  background: ${props => props.$active ? 'var(--tiptap-setting-button)' : 'transparent'};
  color: var(--text-color-contrast);
  cursor: pointer;
  font-size: 16px;
  height: 30px;
  margin: 0 2px;
  padding: 0;
  width: 30px;
  transition: background-color 0.2s;
  font-weight: 500;

  &:hover {
    background-color: var(--tiptap-setting-button-hover);
    color: var(--text-color-contrast);
  }
`;

const MenuSeparator = styled.div`
  width: 1px;
  height: 24px;
  background-color: var(--menu-item-separator-light);
  margin: 4px 4px;
`;

const LinkInput = styled.div`
  display: flex;
  padding: 0 8px;
  align-items: center;
  
  input {
    border: none;
    border-bottom: 1px solid #dadce0;
    font-size: 14px;
    margin-right: 8px;
    outline: none;
    padding: 4px 0;
    width: 200px;
    background-color: transparent;
    color: var(--text-color, #202124);
    
    &:focus {
      border-bottom-color: #1a73e8;
    }
  }
  
  button {
    background: none;
    border: none;
    color: #1a73e8;
    cursor: pointer;
    font-size: 14px;
    padding: 4px 8px;
    border-radius: 4px;
    
    &:hover {
      background-color: rgba(26, 115, 232, 0.1);
    }
    
    &:active {
      background-color: rgba(26, 115, 232, 0.2);
    }
    
    &:focus {
      outline: none;
    }
  }
`;

const TiptapBubbleMenu = ({ editor }) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  
  // Set mounted flag on initialization
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Add a more robust cleanup effect to prevent tippy error when component unmounts
  useEffect(() => {
    if (!editor) return;
    
    try {
      // Force cleanup any existing tippy instances first to be safe
      document.querySelectorAll('[data-tippy-root]').forEach(instance => {
        try {
          if (instance && instance.parentNode) {
            instance.parentNode.removeChild(instance);
          } else {
            instance.remove();
          }
        } catch (err) {
          console.warn('Error cleaning up tippy instance:', err);
        }
      });
    } catch (err) {
      console.warn('Error in initial tippy cleanup:', err);
    }
    
    return () => {
      // Cleanup when component unmounts
      try {
        if (editor && editor.view && !editor.isDestroyed) {
          // Blur the editor to trigger tippy hide events
          editor.view.dom.blur();
        }
        
        // More careful tippy instance cleanup with error handling
        setTimeout(() => {
          try {
            document.querySelectorAll('[data-tippy-root]').forEach(instance => {
              try {
                if (instance && instance.parentNode) {
                  instance.parentNode.removeChild(instance);
                } else {
                  instance.remove();
                }
              } catch (err) {
                console.warn('Error removing tippy instance:', err);
              }
            });
          } catch (err) {
            console.warn('Error in tippy cleanup:', err);
          }
        }, 50);
      } catch (err) {
        console.warn('Error in editor cleanup:', err);
      }
    };
  }, [editor]);
  
  // Helper function to handle button clicks without triggering blur
  const handleButtonClick = (callback) => (e) => {
    // Prevent event from bubbling and triggering blur
    e.preventDefault();
    e.stopPropagation();
    
    // Execute the callback
    callback();
    
    // Make sure the editor keeps focus
    setTimeout(() => {
      editor.commands.focus();
    }, 0);
  };
  
  const addLink = () => {
    if (linkUrl) {
      // Ensure URL has proper format
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().setLink({ href: url }).run();
      setLinkUrl('');
      setShowLinkInput(false);
    }
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLink();
    }
  };

  // If component is unmounting or editor is not available, don't render the BubbleMenu
  if (!isMounted || !editor) {
    return null;
  }

  return (
    <BubbleMenu 
      editor={editor}
      tippyOptions={{ 
        duration: 150,
        placement: 'top',
        offset: [0, 10],
        zIndex: 99999,
        maxWidth: 'none',
        appendTo: () => {
          // Find the closest form element to stay within noteform boundaries
          const editorEl = editor.view.dom;
          const formEl = editorEl.closest('form');
          return formEl || document.body; // Fallback to body if no form found
        }, // Append to form element to avoid overflow clipping while staying in bounds
        // Prevent clicks inside the bubble menu from causing the editor to blur
        onMount: (instance) => {
          try {
            const bubbleMenu = instance.popper.querySelector('[data-tippy-root]');
            if (bubbleMenu) {
              bubbleMenu.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
              }, true);
            }
          } catch (err) {
            console.warn('Error in BubbleMenu onMount:', err);
          }
        }
      }}
      shouldShow={({ editor, view, state, oldState, from, to }) => {
        // Only show when there's a text selection and editor is focused
        // Check the selection is valid and has actual content
        return from !== to && 
               editor.isFocused && 
               to - from > 0 &&
               editor.view && 
               editor.view.hasFocus();
      }}
      onClick={(e) => {
        // Prevent clicks in the bubble menu from bubbling to parent elements
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {showLinkInput ? (
        <MenuContainer>
          <LinkInput>
            <input
              type="text"
              placeholder="Enter URL"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
            <button 
              onClick={handleButtonClick(addLink)}
            >
              Apply
            </button>
            <button 
              onClick={handleButtonClick(() => setShowLinkInput(false))}
            >
              Cancel
            </button>
          </LinkInput>
        </MenuContainer>
      ) : (
        <MenuContainer>
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleBold().run())}
            $active={editor.isActive('bold')}
            title="Bold"
          >
            <Icon name="tiptap_bold" size={16} strokeWidth="2.5" />
          </MenuButton>
          
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleItalic().run())}
            $active={editor.isActive('italic')}
            title="Italic"
          >
            <Icon name="tiptap_italic" size={16} strokeWidth="2.5" />
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleUnderline().run())}
            $active={editor.isActive('underline')}
            title="Underline"
          >
            <Icon name="tiptap_underline" size={16} strokeWidth="2.5" />
          </MenuButton>
          
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleStrike().run())}
            $active={editor.isActive('strike')}
            title="Strikethrough"
          >
            <Icon name="tiptap_strikethrough" size={16} strokeWidth="2.5" />
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleHighlight().run())}
            $active={editor.isActive('highlight')}
            title="Highlight"
          >
            <Icon name="tiptap_highlight" size={16} strokeWidth="2.5" />
          </MenuButton>

          <MenuSeparator />

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
            $active={editor.isActive('heading', { level: 1 })}
            title="H1"
          >
            H₁
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
            $active={editor.isActive('heading', { level: 2 })}
            title="H2"
          >
            H₂
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
            $active={editor.isActive('heading', { level: 3 })}
            title="H3"
          >
            H₃
          </MenuButton>

          <MenuSeparator />
          
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleBulletList().run())}
            $active={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <Icon name="tiptap_bulletlist" size={16} strokeWidth="2.5" />
          </MenuButton>
          
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleBlockquote().run())}
            $active={editor.isActive('blockquote')}
            title="Blockquote"
          >
            <Icon name="tiptap_blockquote" size={16} strokeWidth="2.5" />
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().setDetails().run())}
            $active={editor.isActive('details')}
            title="Details"
            disabled={!editor.can().setDetails()}
          >
            <Icon name="tiptap_details" size={16} strokeWidth="2.5" />
          </MenuButton>
        </MenuContainer>
      )}
    </BubbleMenu>
  );
};

export default TiptapBubbleMenu;
