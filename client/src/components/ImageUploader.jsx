import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { v4 as uuidv4 } from 'uuid';
import Icon from './Icons';
import { fileToBase64, createThumbnail } from '../services/imageUtils';

const UploadContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 8px 0;
`;

const HiddenInput = styled.input`
  display: none;
`;

const PreviewContainer = styled.div`
  margin-top: 10px;
  position: relative;
  display: ${props => props.$isVisible ? 'block' : 'none'};
`;

const Preview = styled.img`
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  object-fit: contain;
`;

const LoadingIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
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
 * Component for uploading images within notes
 */
const ImageUploader = ({ onImageSelected, onCancel }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);
  const fileInputRef = useRef(null);
  
  const handleFileChange = async (e) => {
    e.stopPropagation(); // Prevent event bubbling
    e.preventDefault(); // Prevent default behavior
    
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file type and size
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    // Limit file size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Convert image to base64
      const base64Data = await fileToBase64(file);
      setPreviewSrc(base64Data);
      
      // Generate thumbnail
      const thumbnail = await createThumbnail(base64Data);
      
      // Create image data object
      const imageData = {
        id: uuidv4(),
        data: base64Data,
        thumbnail,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: new Date().toISOString()
      };
      
      // Pass image data to parent
      onImageSelected(imageData);
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCancel = () => {
    setPreviewSrc(null);
    onCancel();
  };
  
  return (
    <UploadContainer>
      <HiddenInput 
        ref={fileInputRef}
        type="file" 
        accept="image/*"
        onChange={handleFileChange}
      />
      
      {isLoading && (
        <LoadingIndicator>
          <span>Processing image...</span>
        </LoadingIndicator>
      )}
      
      <PreviewContainer $isVisible={!!previewSrc}>
        {previewSrc && (
          <>
            <Preview src={previewSrc} alt="Preview" />
            <CloseButton onClick={handleCancel}>
              <Icon name="close" size={16} color="white" />
            </CloseButton>
          </>
        )}
      </PreviewContainer>
    </UploadContainer>
  );
};

export default ImageUploader;