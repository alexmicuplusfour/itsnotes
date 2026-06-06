import React from 'react';
import styled from 'styled-components';
import { getServerUrl } from '../services/api';

const CompactBookCardContainer = styled.div`
  width: calc(100% + 32px);
  margin: -16px -16px 16px -16px;
  height: 110px;
  background-color: var(--fill-subtle);
  display: flex;
  border-radius: 10px 10px 0 0;

  @media (max-width: 600px) {
    width: calc(100% + 24px);
    margin: -12px -12px 12px -12px;
    height: 100px;
  }
`;

const BookCover = styled.img`
  width: 73px;
  height: auto;
  object-fit: cover;
  flex-shrink: 0;
  border-radius: 10px 0 0 0;

  @media (max-width: 600px) {
    width: 66px;
    height: auto;
  }
`;

const BookInfo = styled.div`
  flex: 1;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;

  @media (max-width: 600px) {
    padding: 10px 12px;
    gap: 3px;
  }
`;

const BookTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.3;

  @media (max-width: 600px) {
    font-size: 14px;
  }
`;

const BookAuthor = styled.div`
  font-size: 13px;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 600px) {
    font-size: 12px;
  }
`;

const BookMeta = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color);
  display: flex;
  gap: 10px;
  margin-top: auto;

  span {
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    font-size: 11px;
    gap: 8px;
  }
`;

const ToReadChip = styled.span`
  background-color: var(--foreground-color);
  color: var(--text-color-contrast);
  padding: 2px 8px;
  padding-left: 7px;
  border-radius: 50vh;
  font-size: 11px;

  @media (max-width: 600px) {
    font-size: 10px;
  }
`;

const CompactBookCard = ({ book }) => {
  const source = book.metadata?.source || {};
  const user = book.metadata?.user || {};
  const thumbnailUrl = getServerUrl(book.thumbnail_url || source.cover_url);
  const isFinished = user.status === 'finished';
  const year = source.year;
  const rating = source.rating;
  const currentPage = user.progress?.current_page || 0;

  // Show "To-read" chip if no progress and not finished
  const showToRead = !isFinished && currentPage === 0;

  return (
    <CompactBookCardContainer>
      {thumbnailUrl && <BookCover src={thumbnailUrl} alt={book.title} />}
      <BookInfo>
        <BookTitle>{book.title}</BookTitle>
        {source.author && <BookAuthor>{source.author}</BookAuthor>}
        <BookMeta>
          {showToRead && <ToReadChip>To-read</ToReadChip>}
          {rating && <span>★ {rating}</span>}
          {/* {year && <span>{year}</span>} */}
          {isFinished && <span style={{ color: 'var(--foreground-color)' }}>✓</span>}
        </BookMeta>
      </BookInfo>
    </CompactBookCardContainer>
  );
};

export default CompactBookCard;
