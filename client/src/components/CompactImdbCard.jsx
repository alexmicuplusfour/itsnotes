import React from 'react';
import styled from 'styled-components';
import { getServerUrl } from '../services/api';

const CompactImdbCardContainer = styled.div`
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

const Poster = styled.img`
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

const Info = styled.div`
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

const Title = styled.div`
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

const Director = styled.div`
  font-size: 13px;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 600px) {
    font-size: 12px;
  }
`;

const Meta = styled.div`
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

const ImdbBadge = styled.span`
  background-color: #f5c518;
  color: #000;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
  font-size: 11px;
  margin-top: -2px;

  @media (max-width: 600px) {
    font-size: 10px;
    padding: 2px 5px;
  }
`;

const CompactImdbCard = ({ item }) => {
  const source = item.metadata?.source || {};
  const user = item.metadata?.user || {};
  const thumbnailUrl = getServerUrl(item.thumbnail_url || source.poster_url);
  const isFinished = user.status === 'finished';
  const type = item.type; // 'movie' or 'show'

  // Get director/creator based on type
  const director = type === 'movie' ? source.director : source.creator;

  // Get year based on type
  const year = type === 'movie' ? source.year : source.start_year;
  const endYear = type === 'show' ? source.end_year : null;
  const yearDisplay = endYear ? `${year}–${endYear}` : year;

  // Get IMDb rating
  const imdbRating = source.imdb_rating;
  const formattedRating = imdbRating ? Number(imdbRating).toFixed(1) : null;

  // Get user rating
  const userRating = user.rating;

  return (
    <CompactImdbCardContainer>
      {thumbnailUrl && <Poster src={thumbnailUrl} alt={item.title} />}
      <Info>
        <Title>{item.title}</Title>
        {director && <Director>{director}</Director>}
        <Meta>
          {formattedRating && <ImdbBadge>{formattedRating}</ImdbBadge>}
          {yearDisplay && <span>{yearDisplay}</span>}
          {userRating && <span>★ {userRating}</span>}
          {isFinished && <span style={{ color: 'var(--foreground-color)' }}>✓</span>}
        </Meta>
      </Info>
    </CompactImdbCardContainer>
  );
};

export default CompactImdbCard;
