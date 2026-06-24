import React, { useState } from 'react';
import styled from 'styled-components';
import Icon from '../Icons';
import { Label } from './styles';

// A read-only value in a monospace box with a copy button in the corner — the
// same treatment used for the MCP connector URL/command in AiTab. The icon flips
// to a checkmark for 2s after copying.

const Box = styled.div`
  position: relative;
  background-color: ${props => props.$isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'};
  border-radius: 8px;
  padding: 12px 44px 12px 12px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-color);
  white-space: pre-wrap;
  word-break: break-all;
`;

const CopyBtn = styled.button`
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary-color);
  cursor: pointer;
  border-radius: 6px;
  padding: 0;
  &:hover { background-color: var(--hover-color, rgba(0,0,0,0.06)); }
`;

const CopyableField = ({ label, value, isDark, copyTitle = 'Copy' }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {label && <Label>{label}</Label>}
      <Box $isDark={isDark}>
        {value}
        <CopyBtn onClick={copy} title={copyTitle}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </CopyBtn>
      </Box>
    </>
  );
};

export default CopyableField;
