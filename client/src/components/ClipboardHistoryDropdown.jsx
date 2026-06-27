import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';
import Icon from './Icons';

const DropdownOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1998;
  display: none;

  @media (max-width: 768px) {
    display: block;
    opacity: ${props => props.$isVisible ? 1 : 0};
    pointer-events: ${props => props.$isVisible ? 'auto' : 'none'};
    animation: ${props => props.$isVisible ? 'fadeIn 0.25s ease-out forwards' : 'none'};
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const DropdownMenu = styled.div`
  position: absolute;
  bottom: 40px;
  right: 0;
  background-color: var(--dropdown-bg-color, var(--note-bg-color));
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 1999;
  min-width: 240px;
  max-width: 320px;
  overflow: hidden;
  padding-top: 6px;
  padding-bottom: 6px;

  @media (max-width: 768px) {
    position: fixed !important;
    width: calc(100% - 24px) !important;
    left: 50% !important;
    top: auto !important;
    bottom: 80px !important;
    right: auto !important;
    transform: translateX(-50%) !important;
    border-radius: 12px;
    border-left: none;
    border-right: none;
    border-bottom: none;
    box-sizing: border-box;
    box-shadow: 0 -2px 60px var(--shadow-color);
    background-color: var(--dropdown-bg-color-glassy);
    padding-top: 8px;
    padding-bottom: 8px;
    padding-right: 0px;
    padding-left: 0px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    max-height: 300px;
    overflow-y: auto;
  }
`;

const DropdownHeader = styled.div`
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;

  @media (max-width: 768px) {
    padding: 10px 20px;
    font-size: 13px;
  }
`;

const EmptyState = styled.div`
  padding: 24px 12px;
  text-align: center;
  color: var(--text-color-muted);
  font-size: 13px;
  opacity: 0.7;

  @media (max-width: 768px) {
    padding: 32px 20px;
    font-size: 14px;
  }
`;

const ClipboardItem = styled.div`
  width: 100%;
  padding: 6px 12px;
  padding-right: 16px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  position: relative;
  transition: background-color 0.15s ease;

  @media (max-width: 768px) {
    padding: 14px 20px;
    gap: 12px;
  }

  &:hover {
    background-color: ${props => {
    return props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.04)';
  }};
  }

  &:active {
    background-color: ${props => {
    return props.theme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.08)';
  }};
  }
`;

const ClipboardIcon = styled.div`
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0.6;

  @media (max-width: 768px) {
    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const ClipboardContent = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ClipboardText = styled.div`
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: 768px) {
    font-size: 14px;
  }
`;

const ClipboardMeta = styled.div`
  font-size: 11px;
  color: var(--text-color-muted);
  opacity: 0.6;

  @media (max-width: 768px) {
    font-size: 12px;
  }
`;

const RemoveButton = styled.button`
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  background-color: ${props => props.theme === 'dark'
    ? 'rgba(0, 0, 0, 0.8)'
    : 'rgba(255, 255, 255, 0.95)'};
  border: 1px solid ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.2)'
    : 'rgba(0, 0, 0, 0.15)'};
  color: var(--text-color);
  cursor: pointer;
  padding: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, background-color 0.15s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 10;

  ${ClipboardItem}:hover & {
    opacity: 1;
    pointer-events: auto;
  }

  &:hover {
    background-color: ${props => props.theme === 'dark'
    ? 'rgba(0, 0, 0, 0.9)'
    : 'rgba(255, 255, 255, 1)'};
    border-color: ${props => props.theme === 'dark'
    ? 'rgba(255, 255, 255, 0.3)'
    : 'rgba(0, 0, 0, 0.25)'};
  }

  &:active {
    background-color: ${props => props.theme === 'dark'
    ? 'rgba(0, 0, 0, 1)'
    : 'rgba(245, 245, 245, 1)'};
    transform: translateY(-50%) scale(0.95);
  }

  @media (max-width: 768px) {
    opacity: 0.9;
    pointer-events: auto;
    width: 28px;
    height: 28px;
    right: 20px;

    svg {
      width: 16px;
      height: 16px;
    }
  }
`;

const ClipboardHistoryDropdown = ({
  isOpen,
  clipboardHistory = [],
  isDarkTheme = false,
  onSelectSnippet,
  onRemoveSnippet,
  onToggleSticky,
  onClose
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Click outside to close on desktop
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (window.innerWidth <= 768) return;

      const isClipboardButton = e.target.closest('button[aria-label="Clipboard history"]');
      const isInsideDropdown = e.target.closest('[data-clipboard-dropdown]');

      if (!isClipboardButton && !isInsideDropdown) {
        console.log('[ClipboardHistoryDropdown] Click outside on desktop, closing');
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = (e) => {
    console.log('[ClipboardHistoryDropdown] Backdrop clicked');
    e.stopPropagation();
    onClose();
  };

  const handleDropdownClick = (e) => {
    e.stopPropagation();
  };

  const handleSelectSnippet = (snippet, index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[ClipboardHistoryDropdown] Snippet selected:', index);
    onSelectSnippet(snippet, index);
  };

  const handleRemoveSnippet = (snippet, index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[ClipboardHistoryDropdown] Remove snippet:', index);
    onRemoveSnippet(snippet, index);
  };

  const formatTimestamp = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (!isOpen) return null;

  const isMobile = window.innerWidth <= 768;

  const dropdownContent = (
    <>
      <DropdownOverlay
        $isVisible={isOpen}
        onClick={handleBackdropClick}
        data-clipboard-dropdown="overlay"
      />
      <DropdownMenu
        onClick={handleDropdownClick}
        data-clipboard-dropdown="menu"
      >
        {clipboardHistory.length === 0 ? (
          <EmptyState>
            <ClipboardIcon>
              <Icon name="clipboard" size={24} />
            </ClipboardIcon>
            No clipboard history yet.
          </EmptyState>
        ) : (
          clipboardHistory.map((item, index) => (
            <ClipboardItem
              key={item.id || index}
              theme={isDarkTheme ? 'dark' : 'light'}
              onClick={handleSelectSnippet(item, index)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (onToggleSticky) onToggleSticky(item.id);
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              data-clipboard-dropdown="item"
            >
              <ClipboardIcon>
                <Icon name="clipboard" size={16} />
              </ClipboardIcon>
              <ClipboardContent>
                <ClipboardText>
                  {item.text.length > 30 ? `${item.text.substring(0, 30)}...` : item.text}
                </ClipboardText>
                <ClipboardMeta>
                  {item.isSticky && (
                    <span style={{ marginRight: 4, display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                      <Icon name="pinned" size={12} />
                    </span>
                  )}
                  {hoveredIndex === index && !item.isSticky
                    ? `Right click to lock ⋅ ${formatTimestamp(item.timestamp)}`
                    : formatTimestamp(item.timestamp)}
                </ClipboardMeta>
              </ClipboardContent>
              <RemoveButton
                theme={isDarkTheme ? 'dark' : 'light'}
                onClick={handleRemoveSnippet(item, index)}
                title="Remove from history"
                data-clipboard-dropdown="remove"
              >
                <Icon name="close" size={14} strokeWidth="3" />
              </RemoveButton>
            </ClipboardItem>
          ))
        )}
      </DropdownMenu>
    </>
  );

  if (isMobile) {
    return ReactDOM.createPortal(dropdownContent, document.body);
  }

  return dropdownContent;
};

export default ClipboardHistoryDropdown;
