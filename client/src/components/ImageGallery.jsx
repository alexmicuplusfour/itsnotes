import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import styled, { keyframes } from 'styled-components';
import Icon from './Icons';
import env from '../../env.js';
import { useAuth } from '../contexts/AuthContext';

const GalleryContainer = styled.div`
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  padding: 10px 0 0px 0;
  margin-top: 5px; /* Reduced since we're adding margin in the parent container */
  margin-bottom: 8px;
  margin-left: 8px;
  width: calc(100% - 20px);
  position: relative;
  /* Only enable horizontal scroll for multiple images */
  overflow-x: ${props => props.$hasMultipleImages ? 'auto' : 'visible'};
  overflow-y: visible; /* Show the full height */
  min-height: ${props => props.$reducedSize ? '77px' : '108px'}; /* Reduced height for smaller images */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
  &::-webkit-scrollbar {
    display: none; /* Chrome, Safari, Opera */
  }
  
  @media (max-width: 600px) {
    margin-bottom: 10px;
    min-height: ${props => props.$reducedSize ? '66px' : '88px'};
  }
  
  /* Remove the pseudo-element fade - we'll use a real element instead */
  position: relative;
  
  /* Ensure side-by-side even on mobile, but only if multiple images */
  @media (max-width: 600px) {
    flex-wrap: nowrap;
    overflow-x: ${props => props.$hasMultipleImages ? 'auto' : 'visible'};
  }
`;

// Gradient overlay that stays fixed to the right
const FadeOverlay = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: 60px;
  height: 100%;
  pointer-events: none;
  z-index: 1;

  /* Only show the gradient if disableFade is false */
  /* Use CSS variable set via inline style to avoid regenerating classes per color */
  background: ${props => props.$disableFade ? 'transparent' : 'linear-gradient(to right, transparent, var(--fade-overlay-color, var(--note-bg-color, #fff)))'};

  /* Media query for mobile view */
  @media (max-width: 400px) {
    /* Use mobile background color for default notes */
    background: ${props => props.$disableFade ? 'transparent' : 'linear-gradient(to right, transparent, var(--fade-overlay-color-mobile, var(--mobile-background-color)))'};
  }
`;

const ImageContainer = styled.div`
  position: relative;
  border-radius: 4px;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  cursor: ${props => props.$disableModal ? 'default' : 'pointer'};
  height: ${props => props.$reducedSize ? '66px' : '88px'};
  width: ${props => props.$reducedSize ? '66px' : '88px'};
  
  &:hover {
    box-shadow: 0 2px 5px var(--shadow-color);
  }
  
  & > img {
    border-radius: 8px;

    @media (max-width: 768px) {
      }
  }

  /* Add opacity for unsaved images */
  ${props => props.$unsaved && `
    opacity: 0.7;
  `}
  
  /* Keep consistent size on mobile */
  @media (max-width: 600px) {
    height: ${props => props.$reducedSize ? '66px' : '80px'};
    width: ${props => props.$reducedSize ? '66px' : '80px'};
  }
`;

const ThumbnailImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover; /* This will crop the image to fill the container */
`;

const RemoveButton = styled.button`
  position: absolute;
  top: -10px;
  right: -10px;
  background: var(--foreground-color);
  box-shadow: 0 0px 5px var(--shadow-color);
  border: none;
  border-radius: 50%;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--background-color);
  cursor: pointer;
  opacity: 0;
  
  ${ImageContainer}:hover & {
    opacity: 1;
  }
  
  &:hover {
    
  }
`;

// Loading animation
const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const LoadingIndicator = styled.div`
  position: absolute;
  bottom: 5px;
  right: 5px;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top: 2px solid var(--accent-color);
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000; /* Higher z-index to ensure it appears over everything */
  isolation: isolate; /* Create a new stacking context for events */
`;

const ModalContent = styled.div`
  position: relative;
  max-width: 90%;
  max-height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const FullsizeImage = styled.img`
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  cursor: zoom-out;
`;

const CloseModalButton = styled.button`
  position: absolute;
  top: 15px;
  right: 15px;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  
  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
`;

/**
 * Component for displaying image thumbnails in notes
 */
const ImageGallery = ({ images, sketches = [], onRemoveImage, unsavedImageIds = [], noteColor, disableFade = false, reducedSize = false, disableModal = false }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [fullImageData, setFullImageData] = useState(null);
  const [isLoadingFullImage, setIsLoadingFullImage] = useState(false);
  const { token } = useAuth(); // Get the auth token

  // Determine if we have multiple images (or sketches + images together)
  const totalItems = (images?.length || 0) + (sketches?.length || 0);
  const hasMultipleImages = totalItems > 1;

  // Compute inline style for fade overlay color - avoids styled-components class regeneration
  const fadeOverlayStyle = React.useMemo(() => {
    const color = noteColor || 'default';
    if (color && color !== 'default') {
      return {
        '--fade-overlay-color': `var(--note-color-${color})`,
        '--fade-overlay-color-mobile': `var(--note-color-${color})`
      };
    }
    return {};
  }, [noteColor]);
  
  // Touch handling for better mobile experience
  const handleTouchStart = useCallback((e) => {
    if (!hasMultipleImages) {
      // For single images, don't interfere with vertical scrolling
      return;
    }
    // For multiple images, let the browser handle the horizontal scroll
  }, [hasMultipleImages]);

  const handleTouchMove = useCallback((e) => {
    if (!hasMultipleImages) {
      // For single images, don't interfere with vertical scrolling
      return;
    }
    // For multiple images, let the browser handle the horizontal scroll
  }, [hasMultipleImages]);
  
  // Function to fetch the full image data when needed
  const fetchFullImage = async (imageId) => {
    if (!imageId) return null;
    
    setIsLoadingFullImage(true);
    try {
      // Get token directly from localStorage like the axios interceptor does
      const authToken = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(`${env.SERVER_BASE_URL}/api/images/${imageId}`, {
        headers: headers
      });
      if (!response.ok) {
        throw new Error(`Error fetching image: ${response.status}`);
      }
      
      const data = await response.json();
      setFullImageData(data.image);
      return data.image;
    } catch (error) {
      console.error('Error fetching full image:', error);
      return null;
    } finally {
      setIsLoadingFullImage(false);
    }
  };
  
  const openFullsize = async (image) => {
    // If the image already has full data, use it immediately
    if (image.data) {
      setSelectedImage(image);
      return;
    }
    
    // Otherwise, fetch the full image data first
    const fullImage = await fetchFullImage(image.id);
    if (fullImage) {
      setSelectedImage(fullImage);
    } else {
      // Fallback to the thumbnail if we couldn't get the full image
      setSelectedImage(image);
    }
  };
  
  const closeFullsize = (e) => {
    // Stop propagation to prevent the click from reaching document
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setSelectedImage(null);
    // Optionally clear the full image data to free memory
    setFullImageData(null);
  };
  
  // Reset full image data when the component unmounts
  useEffect(() => {
    return () => {
      setFullImageData(null);
    };
  }, []);
  
  if ((!images || images.length === 0) && (!sketches || sketches.length === 0)) return null;
  
  return (
    <>
      <div style={{ position: 'relative' }}>
        <GalleryContainer
          $disableFade={disableFade}
          $reducedSize={reducedSize}
          $hasMultipleImages={hasMultipleImages}
          className="image-modal-overlay"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onClick={disableModal ? undefined : (e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {images.map(image => {
          const isUnsaved = unsavedImageIds.includes(image.id);
          return (
            <ImageContainer
              key={image.id}
              className="image-modal-overlay"
              onClick={disableModal ? undefined : (e) => {
                e.stopPropagation();
                e.preventDefault();
                openFullsize(image);
              }}
              $unsaved={isUnsaved}
              $reducedSize={reducedSize}
              $disableModal={disableModal}
            >
              <ThumbnailImage src={image.thumbnail} alt="Note attachment" />
              {onRemoveImage && (
                <RemoveButton
                  className="image-modal-overlay"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent opening fullsize when removing
                    e.preventDefault(); // Prevent default behavior
                    // Use setTimeout to ensure event propagation is complete before action
                    setTimeout(() => {
                      onRemoveImage(image.id);
                    }, 0);
                  }}
                >
                  <Icon name="trash" size={16} strokeWidth="2.5" />
                </RemoveButton>
              )}
              {isUnsaved && <LoadingIndicator />}
            </ImageContainer>
          );
        })}
          {sketches && sketches.map(sketch => sketch.thumbnail ? (
            <ImageContainer
              key={`sketch-${sketch.id}`}
              className="image-modal-overlay"
              onClick={disableModal ? undefined : (e) => { e.stopPropagation(); e.preventDefault(); }}
              $reducedSize={reducedSize}
              $disableModal={disableModal}
            >
              <ThumbnailImage src={sketch.thumbnail} alt="Sketch" />
            </ImageContainer>
          ) : null)}
        </GalleryContainer>
        {/* Add fade overlay only if not disabled and has multiple images */}
        {!disableFade && hasMultipleImages && (
          <FadeOverlay
            style={fadeOverlayStyle}
            $disableFade={disableFade}
          />
        )}
      </div>
      
      {!disableModal && selectedImage && ReactDOM.createPortal(
        <ModalOverlay 
          className="image-modal-overlay"
          onClick={(e) => {
            // Stop propagation to prevent document click handlers from firing
            e.stopPropagation();
            closeFullsize(e);
          }}
        >
          <ModalContent onClick={e => e.stopPropagation()}>
            {isLoadingFullImage ? (
              <LoadingIndicator style={{ width: '32px', height: '32px' }} />
            ) : (
              <FullsizeImage 
                src={selectedImage.data || selectedImage.thumbnail} 
                alt="Full size" 
                onClick={(e) => {
                  e.stopPropagation();
                  closeFullsize(e);
                }}
              />
            )}
            <CloseModalButton 
              onClick={(e) => {
                e.stopPropagation();
                closeFullsize(e);
              }}
            >
              <Icon name="close" size={24} color="white" />
            </CloseModalButton>
          </ModalContent>
        </ModalOverlay>,
        document.body
      )}
    </>
  );
};

export default ImageGallery;