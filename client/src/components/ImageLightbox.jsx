import React from 'react';
import ReactDOM from 'react-dom';
import styled, { keyframes } from 'styled-components';
import Icon from './Icons';

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

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const LoadingIndicator = styled.div`
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`;

/**
 * Full-size image viewer overlay, portaled to document.body.
 *
 * The `image-modal-overlay` class matters: the note form's click-outside
 * handler (useNoteFormInteractions) ignores clicks inside it, so interacting
 * with the lightbox never closes the note form behind it.
 */
const ImageLightbox = ({ src, isLoading = false, onClose }) => {
  const handleClose = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    onClose();
  };

  return ReactDOM.createPortal(
    <ModalOverlay
      className="image-modal-overlay"
      onClick={(e) => {
        // Stop propagation to prevent document click handlers from firing
        e.stopPropagation();
        handleClose(e);
      }}
    >
      <ModalContent onClick={e => e.stopPropagation()}>
        {isLoading || !src ? (
          <LoadingIndicator />
        ) : (
          <FullsizeImage
            src={src}
            alt="Full size"
            onClick={handleClose}
          />
        )}
        <CloseModalButton onClick={handleClose}>
          <Icon name="close" size={24} color="white" />
        </CloseModalButton>
      </ModalContent>
    </ModalOverlay>,
    document.body
  );
};

export default ImageLightbox;
