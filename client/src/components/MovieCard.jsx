import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import styled from 'styled-components';

const CardContainer = styled.div`
  display: flex;
  background-color: var(--fill-subtle);
  border: 1px solid var(--border-transparent);
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  width: calc(100% - 8px); /* Adjust for padding */
  cursor: default;
  transition: background-color 0.2s;
  position: relative;
  overflow: hidden;
  gap: 16px;

  &:hover {
    background-color: var(--button-bg);
  }
`;

const MovieInfo = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

const MovieTitle = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color, #e8eaed);
  margin-bottom: 4px;
  line-height: 1.4;
`;

const MovieDirector = styled.div`
  font-size: 14px;
  color: var(--text-secondary-color, #9aa0a6);
  margin-bottom: 8px;
`;

const MovieMeta = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color, #9aa0a6);
  display: flex;
  gap: 12px;
  align-items: center;
`;

const MoviePoster = styled.img`
  width: 80px;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  flex-shrink: 0;
`;

const RatingBadge = styled.span`
  background-color: #f5c518;
  color: #000;
  padding: 2px 4px;
  border-radius: 2px;
  font-weight: bold;
`;

const MovieCard = (props) => {
  const { node } = props;
  const { title, director, poster, year, rating, url } = node.attrs;

  const handleClick = (e) => {
    if (url) {
        window.open(url, '_blank');
    }
  };

  return (
    <NodeViewWrapper className="movie-card-component">
      <CardContainer onClick={handleClick} contentEditable={false}>
        <MovieInfo>
          <MovieTitle>{title}</MovieTitle>
          <MovieDirector>{director ? `Director: ${director}` : ''}</MovieDirector>
          <MovieMeta>
            {year && <span>{year}</span>}
            {rating && <RatingBadge>IMDb {rating}</RatingBadge>}
          </MovieMeta>
        </MovieInfo>
        {poster && <MoviePoster src={poster} alt={title} />}
      </CardContainer>
    </NodeViewWrapper>
  );
};

export default MovieCard;
