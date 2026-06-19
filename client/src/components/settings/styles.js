import styled, { css } from 'styled-components';

// Shared danger styling so red buttons look identical everywhere: red
// text/border with a light red fill on hover.
const DANGER_COLOR = 'rgb(244, 67, 54)';
const DANGER_BORDER = 'rgba(244, 67, 54, 0.5)';
const DANGER_HOVER_BG = 'rgba(244, 67, 54, 0.08)';

const buttonSizes = {
  large: css`
    width: 100%;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
  `,
  small: css`
    gap: 6px;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    white-space: nowrap;
  `,
};

// Centralized button for the settings modal.
// Variants: $color = 'default' (black) | 'danger' (red); $size = 'large' | 'small'.
export const Button = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid ${props => (props.$color === 'danger' ? DANGER_BORDER : 'var(--foreground-color)')};
  color: ${props => (props.$color === 'danger' ? DANGER_COLOR : 'var(--text-color)')};
  ${props => buttonSizes[props.$size] || buttonSizes.large}

  &:hover:not(:disabled) {
    background-color: ${props => (props.$color === 'danger' ? DANGER_HOVER_BG : 'var(--menu-item-hover)')};
    border-color: ${props => (props.$color === 'danger' ? DANGER_BORDER : 'var(--border-hover-color)')};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const SectionContainer = styled.div`
  margin-bottom: 40px;

  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-left: 0px;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const SectionTitle = styled.h3`
  font-size: 18px;

  padding-left: 2px;
`;

export const FormGroup = styled.div`
  margin-bottom: 0px;
`;

export const Label = styled.label`
  display: block;
  padding-left: 2px;
  margin-bottom: 4px;
  font-weight: 400;
  font-size: 14px;
`;

export const LabelBold = styled.label`
  display: flex;
  margin-bottom: 4px;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
`;

export const Input = styled.input`
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  background-color: var(--input-bg-color, transparent);
  color: var(--text-color);

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }
`;

export const Select = styled.select`
  width: 100%;
  padding: 10px;
  border-radius: 4px;
  background-color: var(--input-bg-color, transparent);
  color: var(--text-color);
  border: 1px solid var(--menu-item-separator-dark);
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }
`;

export const OptionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
`;

export const OptionLabel = styled.label`
  font-size: 14px;
  color: var(--text-color);
  white-space: nowrap;
`;

export const ModeSelector = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

export const ModeButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  padding-left: 8px;
  border-radius: 6px;
  outline: ${props => props.$active ? '2px solid var(--foreground-color)' : 'none'};
  background-color: transparent;
  color: ${props => props.$active ? 'var(--text-color)' : 'var(--text-secondary-color)'};
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--menu-item-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const OperatorsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
`;

export const OperatorItem = styled.div`
  display: flex;
  gap: 8px;
  flex-direction: column;
  margin-bottom: 12px;
`;

export const OperatorSymbol = styled.code`
  background-color: var(--search-bg-color);
  color: var(--link);
  padding: 4px 8px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 14px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
`;

export const OperatorDescription = styled.div`
  font-size: 14px;
`;
