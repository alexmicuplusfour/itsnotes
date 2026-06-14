import React, { useState, useEffect } from 'react';
import { NodeSelection } from 'prosemirror-state';
import styled from 'styled-components';
import Icon from "./Icons";

const FixedMenuContainer = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  background-color: var(--foreground-color, #fff);
  padding: 4px 5px;
  z-index: 9999;
  transition: transform 0.3s ease, opacity 0.3s ease;
  /* Control transform via $visible prop */
  transform: ${props => props.$visible ? 'translateY(0)' : 'translateY(100%)'};
  opacity: ${props => props.$visible ? '1' : '0'};
  /* Control interactivity via $visible prop */
  pointer-events: ${props => props.$visible ? 'auto' : 'none'};
  border-radius: 14px 14px 0 0;
`;

const MenuInner = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  width: 100%;
  padding: 6px 0;
  position: relative;
`;

const ScrollableActions = styled.div`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  overflow-x: auto;
  flex: 1;
  padding-right: 8px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const CloseButtonWrapper = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: calc(100% + 20px);
  border-radius: 0 10px 0 0;
  background-color: var(--foreground-color, #fff);
  padding-left: 4px;
  border-left: 1px solid var(--menu-item-separator-light);
  box-shadow: -6px 0 8px -2px rgba(0, 0, 0, 0.15);
`;

const MenuButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => props.$active ? 'var(--tiptap-setting-button)' : 'transparent'};
  border: none;
  border-radius: 4px;
  color: var(--text-color-contrast);
  cursor: pointer;
  font-size: 16px;
  height: 30px;
  margin: 0 1px;
  padding: 0;
  flex: 1 0 36px;
  max-width: 48px;
  transition: background-color 0.2s;
  font-weight: 500;

  @media (hover: hover) {
      &:hover {
        background-color: var(--tiptap-setting-button-hover);
        color: var(--text-color-contrast);
      }
    }
`;

const MenuSeparator = styled.div`
  width: 1px;
  height: 24px;
  background-color: var(--menu-item-separator-light);
  margin: 0 2px;
  flex-shrink: 0;
`;

const LinkInput = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0 8px;
  
  input {
    border: none;
    border-bottom: 1px solid #dadce0;
    font-size: 16px;
    margin-bottom: 10px;
    outline: none;
    padding: 8px 0;
    width: 100%;
    background-color: transparent;
    color: var(--text-color, #202124);
    
    &:focus {
      border-bottom-color: #1a73e8;
    }
  }
  
  .button-row {
    display: flex;
    justify-content: flex-end;
    
    button {
      background: none;
      border: none;
      color: #1a73e8;
      cursor: pointer;
      font-size: 16px;
      padding: 8px 12px;
      border-radius: 4px;
      margin-left: 8px;
      
      &:hover, &:active {
        background-color: rgba(26, 115, 232, 0.2);
      }
      
      &:focus {
        outline: none;
      }
    }
  }
`;

const TiptapFixedMenu = ({ editor }) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    if (!editor) return;
    
    // Set up a listener to check for text selection
    const handleSelectionUpdate = () => {
      const selection = editor.state.selection;
      // Skip NodeSelection — block atom inserts (image, attachment, AI
      // placeholder) leave a NodeSelection that isn't a "user picked text
      // to format" intent. Otherwise the keyboard would dismiss and the
      // menu would pop up every time something gets inserted on mobile.
      if (selection instanceof NodeSelection) {
        if (visible) setVisible(false);
        return;
      }
      const { from, to } = selection;
      const hasSelection = from !== to && to - from > 0;
      const shouldBeVisible = hasSelection && editor.isFocused;
      
      // Debug logging (less verbose)
      if (shouldBeVisible !== visible) {
        console.log("[TiptapFixedMenu] Visibility change:", { 
          hasSelection, 
          isFocused: editor.isFocused,
          shouldBeVisible
        });
      }
      
      // Only update state if visibility is actually changing
      if (shouldBeVisible !== visible) {
        setVisible(shouldBeVisible);
      }
    };
    
    // Initial check
    handleSelectionUpdate();
    
    // Set up event handlers for selection change and focus/blur
    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('focus', handleSelectionUpdate);
    editor.on('blur', () => {
      // Short delay to prevent menu from disappearing when interacting with it
      setTimeout(() => setVisible(false), 150);
    });
    
    return () => {
      // Clean up event handlers
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('focus', handleSelectionUpdate);
    };
  }, [editor, visible]);
  
  // Helper function to handle button actions
  const handleButtonClick = (callback) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    callback();
    
    // Make sure the editor keeps focus
    setTimeout(() => {
      if (editor) editor.commands.focus();
    }, 0);
  };
  
  const addLink = () => {
    if (linkUrl && editor) {
      // Ensure URL has proper format
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      editor.chain().focus().setLink({ href: url }).run();
      setLinkUrl('');
      setShowLinkInput(false);
      
      // Ensure the menu visibility is updated after adding the link
      setTimeout(() => {
        const { from, to } = editor.state.selection;
        setVisible(from !== to && to - from > 0 && editor.isFocused);
      }, 50);
    }
  };
  
  if (!editor) return null;
  
  return (
    <FixedMenuContainer $visible={visible} onTouchStart={() => editor.commands.focus()}>
      {showLinkInput ? (
        <LinkInput>
          <input
            type="text"
            placeholder="Enter URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLink()}
            autoFocus
          />
          <div className="button-row">
            <button onClick={handleButtonClick(() => setShowLinkInput(false))}>
              Cancel
            </button>
            <button onClick={handleButtonClick(addLink)}>
              Apply
            </button>
          </div>
        </LinkInput>
      ) : (
        <MenuInner>
          <ScrollableActions>
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleBold().run())}
            $active={editor.isActive('bold')}
            title="Bold"
          >
            <Icon name="tiptap_bold" size={18} strokeWidth="2.5" />
          </MenuButton>
          
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleItalic().run())}
            $active={editor.isActive('italic')}
            title="Italic"
          >
            <Icon name="tiptap_italic" size={18} strokeWidth="2.5" />
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleUnderline().run())}
            $active={editor.isActive('underline')}
            title="Underline"
          >
            <Icon name="tiptap_underline" size={18} strokeWidth="2.5" />
          </MenuButton>
          
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleStrike().run())}
            $active={editor.isActive('strike')}
            title="Strikethrough"
          >
            <Icon name="tiptap_strikethrough" size={18} strokeWidth="2.5" />
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleHighlight().run())}
            $active={editor.isActive('highlight')}
            title="Highlight"
          >
            <Icon name="tiptap_highlight" size={18} strokeWidth="2.5" />
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
            <Icon name="tiptap_bulletlist" size={18} strokeWidth="2.5" />
          </MenuButton>
          
          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().toggleBlockquote().run())}
            $active={editor.isActive('blockquote')}
            title="Blockquote"
          >
            <Icon name="tiptap_blockquote" size={18} strokeWidth="2.5" />
          </MenuButton>

          <MenuButton
            onClick={handleButtonClick(() => editor.chain().focus().setDetails().run())}
            $active={editor.isActive('details')}
            title="Details"
            disabled={!editor.can().setDetails()}
          >
            <Icon name="tiptap_details" size={18} strokeWidth="2.5" />
          </MenuButton>
          </ScrollableActions>

          <CloseButtonWrapper>
            <MenuButton
              onPointerDown={(e) => {
                // Prevent the button from taking focus away from the editor
                // This stops the blur/focus cycle that causes flickering
                e.preventDefault();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Collapse selection at cursor position and keep focus
                const { to } = editor.state.selection;
                editor.chain().setTextSelection(to).focus().run();
              }}
              title="Close"
            >
              <Icon name="close" size={18} strokeWidth="2.5" />
            </MenuButton>
          </CloseButtonWrapper>
        </MenuInner>
      )}
    </FixedMenuContainer>
  );
};

export default TiptapFixedMenu;
