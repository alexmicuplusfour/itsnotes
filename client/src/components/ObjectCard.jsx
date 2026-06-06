import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import styled from 'styled-components';
import { objectsApi, getServerUrl } from '../services/api';
import { useNoteFormContext } from '../contexts/NoteFormContext';
import { useAutoTagging, AUTO_TAG_FEATURES } from '../contexts/AutoTaggingContext';
import Icon from './Icons';

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
  min-height: 180px;

  &:hover {
    background-color: var(--button-bg);
  }
`;

const ContentRow = styled.div`
  display: flex;
  gap: 16px;
  width: 100%;
`;

const ObjectInfo = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
`;

const ObjectTitle = styled.a`
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

const ObjectSubtitle = styled.div`
  font-size: 14px;
  color: var(--text-secondary-color, #9aa0a6);
  margin-bottom: 8px;
`;

const ObjectMeta = styled.div`
  font-size: 12px;
  color: var(--text-secondary-color, #9aa0a6);
  display: flex;
  margin-top: 6px;
  gap: 12px;
`;

const ObjectThumbnail = styled.img`
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
  background-color: var(--border-transparent);
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
  min-height: 24px;
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

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`;

const RatingContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 4px;
  margin-left: -3px;
  margin-bottom: 8px;
`;

const StarButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  transition: transform 0.1s;
  line-height: 1;
  display: flex;
  align-items: center;

  &:hover {
    transform: scale(1.1);
  }
`;

const RatingLabel = styled.span`
  font-size: 13px;
  color: var(--text-secondary-color);
  margin-left: 4px;
`;

const ClearRatingButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  margin-left: 6px;
  color: var(--text-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.1s ease;

  &:hover {
    background-color: var(--button-bg);
  }
`;

const EditContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--text-secondary-color);
  font-size: 14px;
`;

const ErrorState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--text-secondary-color);
  font-size: 14px;
  background-color: rgba(255, 0, 0, 0.1);
  border-radius: 8px;
`;

const TypeBadge = styled.span`
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-secondary-color);
  background: var(--border-transparent);
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 8px;
`;

const ImdbBadge = styled.span`
  background-color: #f5c518;
  color: #000;
  padding: 2px 4px;
  margin-top: -1px;
  padding-bottom: 0px;
  border-radius: 2px;
  font-weight: bold;
  font-size: 12px;
`;

const ObjectCard = (props) => {
  const { node, updateAttributes } = props;
  const { objectId } = node.attrs;
  
  // NoteFormContext provides noteId and callbacks for auto-tagging
  const noteFormContext = useNoteFormContext();
  const { shouldAutoApply, shouldSuggestTag, getFeatureSettings } = useAutoTagging();
  
  const [object, setObject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [tempCurrentPage, setTempCurrentPage] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const inputRef = useRef(null);

  // Fetch object data
  useEffect(() => {
    const fetchObject = async () => {
      if (!objectId) {
        setError('No object ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await objectsApi.getObject(objectId);
        setObject(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching object:', err);
        setError('Failed to load object');
      } finally {
        setLoading(false);
      }
    };

    fetchObject();
  }, [objectId]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleTitleClick = (e) => {
    e.stopPropagation();
    const url = object?.source_url || object?.metadata?.source?.goodreads_url;
    if (url) {
      window.open(url, '_blank');
    }
    e.preventDefault();
  };

  const handleStartReading = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
    setTempCurrentPage(object?.metadata?.user?.progress?.current_page || 0);
  };

  const handleUpdateProgress = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setTempCurrentPage(object?.metadata?.user?.progress?.current_page || 0);
    setIsEditing(true);
  };

  const handleFinish = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    const totalPages = object?.metadata?.source?.page_count || 0;
    const currentPage = object?.metadata?.user?.progress?.current_page || 0;
    const newCurrent = currentPage < totalPages ? totalPages : currentPage;
    const now = new Date().toISOString();

    // Get existing reads array or create new one
    const existingReads = object?.metadata?.user?.reads || [];

    // Find the current in-progress read (one without finished_at)
    const currentReadIndex = existingReads.findIndex(read => !read.finished_at);

    let updatedReads;
    if (currentReadIndex >= 0) {
      // Complete the existing read
      updatedReads = [...existingReads];
      updatedReads[currentReadIndex] = {
        ...updatedReads[currentReadIndex],
        finished_at: now
      };
    } else {
      // No in-progress read, create a new completed one
      updatedReads = [
        ...existingReads,
        {
          started_at: now, // If we don't have a start date, use now
          finished_at: now
        }
      ];
    }

    try {
      const updated = await objectsApi.updateUserState(objectId, {
        status: 'finished',
        progress: { current_page: newCurrent, percent: 100 },
        reads: updatedReads
      });
      setObject(updated);
      
      // Handle auto-tagging for book finished
      if (noteFormContext) {
        const featureSettings = getFeatureSettings(AUTO_TAG_FEATURES.BOOK_FINISHED);
        const tagIds = featureSettings.tagIds || [];
        if (featureSettings.enabled && tagIds.length > 0) {
          if (shouldAutoApply(AUTO_TAG_FEATURES.BOOK_FINISHED)) {
            // Auto-apply all tags directly
            for (const tagId of tagIds) {
              noteFormContext.onApplyTag(tagId);
            }
            console.log('[ObjectCard] Auto-applied book finished tags:', tagIds.length);
          } else if (shouldSuggestTag(AUTO_TAG_FEATURES.BOOK_FINISHED)) {
            // Add all tags to suggested tags
            for (const tagId of tagIds) {
              noteFormContext.onAddSuggestedTag(tagId, AUTO_TAG_FEATURES.BOOK_FINISHED);
            }
            console.log('[ObjectCard] Suggested book finished tags:', tagIds.length);
          }
        }
      }
    } catch (err) {
      console.error('Error updating progress:', err);
    }
    setIsEditing(false);
  };

  const handleSave = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    const newCurrent = Math.max(0, parseInt(tempCurrentPage) || 0);
    const totalPages = object?.metadata?.source?.page_count || 0;
    const percent = totalPages > 0 ? Math.min(100, Math.round((newCurrent / totalPages) * 100)) : 0;
    const currentStatus = object?.metadata?.user?.status;
    const isFinished = currentStatus === 'finished';
    const shouldStartNewRead = isFinished && totalPages > 0 && newCurrent < totalPages;

    // Determine new status:
    // - If was finished but now has less pages than total, start a new read
    // - If was 'want_to_read' or undefined, set to 'reading' (user is starting to track progress)
    // - Otherwise keep current status
    let newStatus = currentStatus || 'reading';
    if (shouldStartNewRead) {
      newStatus = 'reading';
    } else if (!currentStatus || currentStatus === 'want_to_read') {
      newStatus = 'reading';
    }

    // Handle reads array
    const existingReads = object?.metadata?.user?.reads || [];
    let updatedReads = existingReads;

    // If we're "unfinishing" a finished book, start a new read
    if (shouldStartNewRead) {
      // Check if there's already an in-progress read
      const hasInProgressRead = existingReads.some(read => !read.finished_at);

      if (!hasInProgressRead) {
        // Start a new read
        updatedReads = [
          ...existingReads,
          {
            started_at: new Date().toISOString(),
            finished_at: null
          }
        ];
      }
    }

    // If starting to track progress for the first time (want_to_read -> reading or no status)
    if (!currentStatus || currentStatus === 'want_to_read') {
      const hasAnyReads = existingReads.length > 0;
      const hasInProgressRead = existingReads.some(read => !read.finished_at);

      if (!hasAnyReads || !hasInProgressRead) {
        updatedReads = [
          ...existingReads,
          {
            started_at: new Date().toISOString(),
            finished_at: null
          }
        ];
      }
    }

    try {
      const updateData = {
        status: newStatus,
        progress: { current_page: newCurrent, percent }
      };

      // Always include reads array (either updated or existing)
      // This ensures books created via UI get the reads array
      updateData.reads = updatedReads;

      const updated = await objectsApi.updateUserState(objectId, updateData);
      setObject(updated);
    } catch (err) {
      console.error('Error updating progress:', err);
    }

    setIsEditing(false);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(false);
    setTempCurrentPage(object?.metadata?.user?.progress?.current_page || 0);
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

  const handleRatingClick = async (e, rating) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const updated = await objectsApi.updateUserState(objectId, { rating });
      setObject(updated);
    } catch (err) {
      console.error('Error updating rating:', err);
    }
  };

  const handleClearRating = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const updated = await objectsApi.updateUserState(objectId, { rating: null });
      setObject(updated);
    } catch (err) {
      console.error('Error clearing rating:', err);
    }
  };

  // Render star rating with half-star support (for movies/shows)
  const renderStarRating = (allowHalfStars = false) => {
    const currentRating = user.rating || 0;
    const maxStars = 5;
    const stars = [];

    if (allowHalfStars) {
      // For movies/shows: render with half-star detection
      for (let i = 1; i <= maxStars; i++) {
        const hoverValue = hoverRating || currentRating;

        let iconName = 'star-outline';
        let iconColor = 'var(--star-rating-unfilled)';

        if (hoverValue >= i) {
          iconName = 'star';
          iconColor = 'var(--star-rating-filled)';
        } else if (hoverValue >= i - 0.5) {
          iconName = 'star-half';
          iconColor = 'var(--star-rating-filled)';
        }

        stars.push(
          <div key={i} style={{ position: 'relative', display: 'inline-block', width: '24px', height: '20px' }}>
            <Icon name={iconName} size={20} color={iconColor} style={{ position: 'absolute', left: '2px', top: 0 }} />
            <StarButton
              style={{ position: 'absolute', left: 0, width: '12px', height: '20px', zIndex: 2, padding: 0 }}
              onClick={(e) => handleRatingClick(e, i - 0.5)}
              onMouseEnter={() => setHoverRating(i - 0.5)}
            />
            <StarButton
              style={{ position: 'absolute', left: '12px', width: '12px', height: '20px', zIndex: 2, padding: 0 }}
              onClick={(e) => handleRatingClick(e, i)}
              onMouseEnter={() => setHoverRating(i)}
            />
          </div>
        );
      }
    } else {
      // For books: full stars only
      for (let i = 1; i <= maxStars; i++) {
        const hoverValue = hoverRating || currentRating;
        const isFilled = hoverValue >= i;

        stars.push(
          <StarButton
            key={i}
            onClick={(e) => handleRatingClick(e, i)}
            onMouseEnter={() => setHoverRating(i)}
          >
            <Icon
              name={isFilled ? 'star' : 'star-outline'}
              size={20}
              color={isFilled ? 'var(--star-rating-filled)' : 'var(--star-rating-unfilled)'}
            />
          </StarButton>
        );
      }
    }

    return (
      <RatingContainer
        onClick={(e) => e.stopPropagation()}
        onMouseLeave={() => setHoverRating(0)}
      >
        <div style={{ display: 'flex', gap: 0 }}>
          {stars}
        </div>
        {currentRating > 0 && (
          <>
            <RatingLabel>{currentRating} / 5</RatingLabel>
            <ClearRatingButton onClick={handleClearRating} title="Clear rating"><Icon name="close" size={16} strokeWidth={3} /></ClearRatingButton>
          </>
        )}
      </RatingContainer>
    );
  };

  if (loading) {
    return (
      <NodeViewWrapper className="object-card-component object-card-loading">
        <CardContainer contentEditable={false}>
          <LoadingState>Loading...</LoadingState>
        </CardContainer>
      </NodeViewWrapper>
    );
  }

  if (error || !object) {
    return (
      <NodeViewWrapper className="object-card-component object-card-error">
        <CardContainer contentEditable={false}>
          <ErrorState>{error || 'Object not found'}</ErrorState>
        </CardContainer>
      </NodeViewWrapper>
    );
  }

  // Extract data based on object type
  const source = object.metadata?.source || {};
  const user = object.metadata?.user || {};
  const type = object.type;

  // Common properties
  const title = object.title;
  const thumbnailUrl = getServerUrl(object.thumbnail_url || source.cover_url || source.poster_url);
  const sourceUrl = object.source_url || source.goodreads_url || source.imdb_url;

  // Type-specific rendering
  const renderBookCard = () => {
    const author = source.author;
    const year = source.year;
    const rating = source.rating;
    const totalPages = source.page_count || 0;
    const currentPage = user.progress?.current_page || 0;
    const percent = totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0;
    const hasStarted = user.status && user.status !== 'want_to_read';
    const isFinished = user.status === 'finished';

    return (
      <>
        <ContentRow>
          <ObjectInfo>
            <ObjectTitle href={sourceUrl} onClick={handleTitleClick} target="_blank" rel="noopener noreferrer">
              {title}
            </ObjectTitle>
            {author && <ObjectSubtitle>{author}</ObjectSubtitle>}
            <ObjectMeta>
              {year && <span>{year}</span>}
              {totalPages > 0 && <span>{totalPages} pages</span>}
              {rating && <span>★ {rating}</span>}
            </ObjectMeta>
          </ObjectInfo>
          {thumbnailUrl && <ObjectThumbnail src={thumbnailUrl} alt={title} />}
        </ContentRow>

        {renderStarRating(false)}

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
                    <span>of {totalPages || '?'}</span>
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
                    <span>{percent}% ({currentPage} of {totalPages})</span>
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
      </>
    );
  };

  const renderMovieCard = () => {
    const director = source.director;
    const year = source.year;
    const rating = source.imdb_rating;
    const watched = user.status === 'watched';
    const formattedRating = rating ? Number(rating).toFixed(1) : null;

    return (
      <>
        <ContentRow>
          <ObjectInfo>
            <ObjectTitle href={sourceUrl} onClick={handleTitleClick} target="_blank" rel="noopener noreferrer">
              {title}
            </ObjectTitle>
            {director && <ObjectSubtitle>{director}</ObjectSubtitle>}
            {renderStarRating(true)}
            <ObjectMeta>
              {formattedRating && <ImdbBadge>{formattedRating}</ImdbBadge>}
              {year && <span>{year}</span>}
              {watched && <span style={{ color: 'var(--foreground-color)' }}>Watched</span>}
            </ObjectMeta>
          </ObjectInfo>
          {thumbnailUrl && <ObjectThumbnail src={thumbnailUrl} alt={title} />}
        </ContentRow>
      </>
    );
  };

  const renderShowCard = () => {
    const creator = source.creator;
    const startYear = source.start_year;
    const endYear = source.end_year;
    const rating = source.imdb_rating;
    const seasons = source.seasons;
    const episodes = source.episodes;
    const watched = user.status === 'watched';
    const watching = user.status === 'watching';
    const formattedRating = rating ? Number(rating).toFixed(1) : null;

    // Format year display (e.g., "2019-2024" or "2019-" or just "2019")
    let yearDisplay = '';
    if (startYear) {
      if (endYear) {
        yearDisplay = `${startYear}-${endYear}`;
      } else {
        yearDisplay = `${startYear}-`;
      }
    }

    return (
      <>
        <ContentRow>
          <ObjectInfo>
            <ObjectTitle href={sourceUrl} onClick={handleTitleClick} target="_blank" rel="noopener noreferrer">
              {title}
            </ObjectTitle>
            {creator && <ObjectSubtitle>{creator}</ObjectSubtitle>}
            {renderStarRating(true)}
            <ObjectMeta>
              {formattedRating && <ImdbBadge>{formattedRating}</ImdbBadge>}
              {yearDisplay && <span>{yearDisplay}</span>}
              {seasons && <span>{seasons} {seasons === 1 ? 'season' : 'seasons'}</span>}
              {watched && <span style={{ color: 'var(--foreground-color)' }}>Watched</span>}
              {watching && <span style={{ color: 'var(--link)' }}>Watching</span>}
            </ObjectMeta>
          </ObjectInfo>
          {thumbnailUrl && <ObjectThumbnail src={thumbnailUrl} alt={title} />}
        </ContentRow>
      </>
    );
  };

  const renderGenericCard = () => {
    return (
      <ContentRow>
        <ObjectInfo>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <TypeBadge>{type}</TypeBadge>
            <ObjectTitle href={sourceUrl} onClick={handleTitleClick} target="_blank" rel="noopener noreferrer">
              {title}
            </ObjectTitle>
          </div>
        </ObjectInfo>
        {thumbnailUrl && <ObjectThumbnail src={thumbnailUrl} alt={title} />}
      </ContentRow>
    );
  };

  return (
    <NodeViewWrapper className={`object-card-component object-card-${type}`}>
      <CardContainer contentEditable={false}>
        {type === 'book' && renderBookCard()}
        {type === 'movie' && renderMovieCard()}
        {type === 'show' && renderShowCard()}
        {!['book', 'movie', 'show'].includes(type) && renderGenericCard()}
      </CardContainer>
    </NodeViewWrapper>
  );
};

export default ObjectCard;
