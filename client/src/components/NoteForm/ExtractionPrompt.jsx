import React from 'react';
import Icon from '../Icons';
import { SaveIndicator } from './NoteForm.styles';

const ExtractionPrompt = ({
  show,
  isExtracting,
  isGoodreadsExtracting,
  isImdbExtracting,
  extractionError,
  onExtract,
  onDismiss
}) => {
  if (!show) return null;

  const isLoading = isExtracting || isGoodreadsExtracting || isImdbExtracting;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "110px",
        left: "50%",
        width: "auto", // Changed from fixed width to auto
        maxWidth: "90%", // Add a max-width constraint
        transform: "translateX(-50%)",
        backgroundColor: "var(--floating-element)",
        color: "var(--text-color)",
        padding: "8px 15px",
        borderRadius: "20px",
        zIndex: 1101,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "14px",
        boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
        whiteSpace: "nowrap", // Prevents content from wrapping
      }}
    >
      {!isLoading && <span>📰 Extract content?</span>}
      {isLoading && <span>📰 Extracting...</span>}
      {/* Right-aligned buttons grouped together */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          marginLeft: "15px",
        }}
      >
        {/* Extraction Loading/Error Indicator */}
        {isLoading && (
          <SaveIndicator
            style={{ marginRight: "8px" }}
            title="Extracting content..."
          />
        )}
        {extractionError && (
          <Icon
            name="error"
            size={16}
            color="red"
            style={{ marginRight: "8px" }}
            title={`Extraction failed: ${extractionError}`}
          />
        )}
        {!isLoading && (
          <button
            onClick={onExtract}
            disabled={isExtracting} // Keep the disabled state
            style={{
              background: "none",
              border: "1px solid var(--text-color)",
              color: "var(--text-color)",
              padding: "3px 8px",
              borderRadius: "3px",
              cursor: "pointer",
            }}
          >
            Extract{" "}
            {/* Button text is handled by the isExtracting state */}
          </button>
        )}
        {!isLoading && (
          <button
            onClick={onDismiss}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-color)",
              fontSize: "24px", // Increased font size for better visibility
              cursor: "pointer",
              padding: "0 5px",
              lineHeight: "1",
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default ExtractionPrompt;
