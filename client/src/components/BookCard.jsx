import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import styled from 'styled-components';

const CardContainer = styled.div`
  display: flex;
  flex-direction: column;
  background-color: var(--fill-subtle);
  border: 1px solid var(--border-transparent);
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  width: calc(100% - 8px);
  cursor: default;
  transition: background-color 0.2s;
  position: relative;
  overflow: hidden;
  gap: 12px;

  &:hover {
    background-color: var(--button-bg);
  }
`;

const ContentRow = styled.div`
  display: flex;
  gap: 16px;
  width: 100%;
`;

const BookInfo = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

const BookTitle = styled.a`
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e8eaed);
  margin-bottom: 4px;
  line-height: 1.4;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

const BookAuthor = styled.div`
  font-size: 14px;
  color: var(--text-secondary-color, #9aa0a6);
  margin-bottom: 8px;
`;

const BookMeta = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color, #9aa0a6);
  display: flex;
  gap: 12px;
`;

const BookCover = styled.img`
  width: 80px;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  flex-shrink: 0;
`;

const ProgressSection = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--border-transparent);
  padding-top: 8px;
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  height: 6px;
  background-color: var(--border-transparent); /* Darker background for track */
  border-radius: 3px;
  overflow: hidden;
  position: relative;
`;

const ProgressBarFill = styled.div`
  height: 100%;
  background-color: ${props => props.$isFinished ? 'var(--foreground-color)' : 'var(--link)'};
  width: ${props => props.$isFinished ? '100' : props.$percent}%;
  transition: width 0.3s ease, background-color 0.3s ease;
`;

const ProgressMeta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-color, #9aa0a6);
  min-height: 24px; /* Prevent layout jump */
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  color: var(--link);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  font-weight: 500;
  
  &:hover {
    text-decoration: underline;
  }
`;

const InlineInput = styled.input`
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 14px;
  width: 70px;
  margin: 0 4px;
  text-align: center;
  
  &:focus {
    outline: 2px solid #8ab4f8;
    border-color: transparent;
  }

  /* Remove up/down spinners */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

const EditContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const BookCard = (props) => {
  const { node, updateAttributes } = props;
  const { title, author, cover, description, pages, rating, url, current_page, total_pages, is_finished, published_year } = node.attrs;
  
  const [isEditing, setIsEditing] = useState(false);
  const [tempCurrentPage, setTempCurrentPage] = useState(current_page || 0);
  const [tempTotalPages, setTempTotalPages] = useState(total_pages || 0);
  const inputRef = useRef(null);

  // Parse total pages from 'pages' string if not already set
  useEffect(() => {
    if (!total_pages && pages) {
      const match = pages.match(/(\d+)/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed)) {
          updateAttributes({ total_pages: parsed });
          setTempTotalPages(parsed);
        }
      }
    }
  }, [pages, total_pages, updateAttributes]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleTitleClick = (e) => {
    e.stopPropagation();
    // Let the anchor tag handle the navigation naturally, or force it if needed
    // Since we are in a NodeView, sometimes default behavior is prevented
    if (url) {
        window.open(url, '_blank');
    }
    e.preventDefault(); // Prevent default to avoid double opening if href is set
  };

  const handleStartReading = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
  };

  const handleUpdateProgress = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setTempCurrentPage(current_page || 0);
    setIsEditing(true);
  };

  const handleFinish = (e) => {
    e.stopPropagation();
    e.preventDefault();
    // If current page is less than total, bump it up. 
    // If it's already more (user has custom page count), keep it.
    // Ensure we don't set null
    const safeTotal = total_pages || 0;
    const safeCurrent = current_page || 0;
    const newCurrent = safeCurrent < safeTotal ? safeTotal : safeCurrent;
    
    updateAttributes({ 
        current_page: newCurrent,
        total_pages: total_pages,
        is_finished: true
    });
    setIsEditing(false);
  };

  const handleSave = (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Allow pages > total_pages
    const newCurrent = Math.max(0, parseInt(tempCurrentPage) || 0);
    const newTotal = parseInt(tempTotalPages) || 0;
    
    // If the book was finished but the user changed the progress to less than total, revert finished state
    const shouldUnfinish = is_finished && newTotal > 0 && newCurrent < newTotal;
    
    updateAttributes({ 
        current_page: newCurrent,
        total_pages: newTotal,
        is_finished: shouldUnfinish ? false : is_finished
    });
    
    setIsEditing(false);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(false);
    setTempCurrentPage(current_page || 0);
  };

  const handleInputClick = (e) => {
    e.stopPropagation();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
        handleSave(e);
    } else if (e.key === 'Escape') {
        handleCancel(e);
    }
  };

  const percent = total_pages > 0 ? Math.min(100, Math.round(((current_page || 0) / total_pages) * 100)) : 0;
  const hasStarted = current_page !== null;
  const isFinished = is_finished === true;

  return (
    <NodeViewWrapper className="book-card-component">
      <CardContainer contentEditable={false}>
        <ContentRow>
            <BookInfo>
            <BookTitle href={url} onClick={handleTitleClick} target="_blank" rel="noopener noreferrer">{title}</BookTitle>
            <BookAuthor>{author}</BookAuthor>
            <BookMeta>
                {published_year && <span>{published_year}</span>}
                {pages && <span>{pages}</span>}
                {rating && <span>★ {rating}</span>}
            </BookMeta>
            </BookInfo>
            {cover && <BookCover src={cover} alt={title} />}
        </ContentRow>

        {/* Progress Section */}
        {(hasStarted || isEditing || isFinished) ? (
            <ProgressSection onClick={(e) => e.stopPropagation()}>
                <ProgressBarContainer>
                    <ProgressBarFill $percent={percent} $isFinished={isFinished} />
                </ProgressBarContainer>
                <ProgressMeta>
                    {isEditing ? (
                        <>
                            <EditContainer>
                                <span>Page</span>
                                <InlineInput 
                                    ref={inputRef}
                                    type="number" 
                                    value={tempCurrentPage} 
                                    onChange={(e) => setTempCurrentPage(e.target.value)}
                                    onClick={handleInputClick}
                                    onKeyDown={handleKeyDown}
                                />
                                <span>of {total_pages || '?'}</span>
                            </EditContainer>
                            <div style={{ display: 'flex', gap: '18px' }}>
                                <ActionButton onClick={handleFinish}>I'm finished</ActionButton>
                                <ActionButton onClick={handleSave}>Save</ActionButton>
                                <ActionButton onClick={handleCancel} style={{ color: 'var(--text-secondary-color)' }}>Cancel</ActionButton>
                            </div>
                        </>
                    ) : (
                        <>
                            {isFinished ? (
                                <span style={{ fontWeight: 500, color: 'var(--foreground-color)' }}>Finished</span>
                            ) : (
                                <span>{percent}% ({current_page} of {total_pages})</span>
                            )}
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <ActionButton onClick={handleUpdateProgress}>{isFinished ? 'Edit' : 'Update progress'}</ActionButton>
                            </div>
                        </>
                    )}
                </ProgressMeta>
            </ProgressSection>
        ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                <ActionButton onClick={handleStartReading}>Add reading progress</ActionButton>
            </div>
        )}
      </CardContainer>
    </NodeViewWrapper>
  );
};

export default BookCard;
