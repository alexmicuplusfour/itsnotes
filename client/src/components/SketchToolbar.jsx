import React, { useState } from 'react';
import styled from 'styled-components';
import Icon from './Icons';
import {
  SKETCH_COLOR_IDS,
  SKETCH_SIZE_IDS,
  resolveColor,
  DEFAULT_COLOR_ID,
  DEFAULT_SIZE_ID,
} from '../constants/sketchConfig';
import ThemeManager from '../utils/ThemeManager';

// ── round button (all interactive buttons share this) ─────────────────────────

// $active  = filled bg (caret buttons when panel is open)
// $outlined = ring stroke (selected tool / selected size dot)
const RoundBtn = styled.button.attrs(() => ({ type: 'button' }))`
  background: ${p => p.$active ? 'var(--button-bg)' : 'transparent'};
  border: none;
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color);
  opacity: ${p => p.$disabled ? 0.35 : 1};
  pointer-events: ${p => p.$disabled ? 'none' : 'auto'};
  flex-shrink: 0;
  box-shadow: ${p => p.$outlined ? 'inset 0 0 0 2px var(--text-color)' : 'none'};
  &:hover { background: var(--button-bg); }
`;

// ── pill ──────────────────────────────────────────────────────────────────────

const Pill = styled.div`
  display: inline-flex;
  flex-direction: column;
  background: var(--note-bg-color, #fff);
  border: 1px solid var(--border-transparent);
  border-radius: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  pointer-events: auto;
`;

const PillRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
`;

const PillExpandRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px 8px;
  border-top: 1px solid var(--border-transparent);
`;

const PillDivider = styled.div`
  width: 1px;
  height: 20px;
  background: var(--border-transparent);
  margin: 0 6px;
  flex-shrink: 0;
`;

// ── overlay layout ────────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
`;

const TopSection = styled.div`
  position: absolute;
  top: 10px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
`;

const BottomSection = styled.div`
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
`;

// ── color swatch (expand panel only) ─────────────────────────────────────────

const ColorSwatch = styled.button.attrs(() => ({ type: 'button' }))`
  width: ${p => p.$active ? 28 : 24}px;
  height: ${p => p.$active ? 28 : 24}px;
  border-radius: 50%;
  background: ${p => p.$color};
  border: ${p => p.$active ? '2px solid var(--text-color)' : '2px solid transparent'};
  cursor: pointer;
  flex-shrink: 0;
  outline: none;
  box-shadow: ${p => p.$active ? '0 0 0 1px var(--note-bg-color, #fff) inset' : 'none'};
  &:hover { transform: scale(1.1); }
`;

// ── combined indicator+caret button (pill-shaped, for size and color) ──────────

const LongBtn = styled.button.attrs(() => ({ type: 'button' }))`
  display: flex;
  align-items: center;
  gap: 4px;
  background: ${p => p.$active ? 'var(--button-bg)' : 'transparent'};
  border: none;
  border-radius: 19px;
  height: 38px;
  padding: 0 8px;
  cursor: pointer;
  color: var(--text-color);
  flex-shrink: 0;
  &:hover { background: var(--button-bg); }
`;

// small non-interactive circle showing current color
const ColorCircle = styled.div`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${p => p.$color};
  flex-shrink: 0;
`;

// small non-interactive dot showing current size
const SizeDotPreview = styled.div`
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  &::after {
    content: '';
    display: block;
    border-radius: 50%;
    background: var(--text-color);
    width: ${p => p.$dotSize}px;
    height: ${p => p.$dotSize}px;
  }
`;

// ── dot visual inside a RoundBtn (for expand panel) ───────────────────────────

const DotVisual = styled.div`
  border-radius: 50%;
  background: var(--text-color);
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
`;

const SIZE_DOT_PX = { xs: 5, s: 8, m: 12, l: 17, xl: 22 };

// ── component ─────────────────────────────────────────────────────────────────

export default function SketchToolbar({
  tool, colorId, sizeId,
  canUndo, canRedo,
  onToolChange, onColorChange, onSizeChange,
  onUndo, onRedo, onDone, onCancel,
}) {
  const [expanded, setExpanded] = useState(null);
  const isDark = ThemeManager.getTheme();

  const toggle = (panel) => setExpanded(p => p === panel ? null : panel);
  const activeColor = resolveColor(colorId ?? DEFAULT_COLOR_ID, isDark);

  return (
    <Overlay>
      <TopSection>
        <Pill>
          <PillRow>
            {/* tools — outlined ring on active */}
            <RoundBtn $outlined={tool === 'pen'} onClick={() => onToolChange('pen')} title="Pen">
              <Icon name="sketch" size={20} />
            </RoundBtn>
            <RoundBtn $outlined={tool === 'highlighter'} onClick={() => onToolChange('highlighter')} title="Highlighter">
              <Icon name="highlighter" size={20} />
            </RoundBtn>
            <RoundBtn $outlined={tool === 'eraser'} onClick={() => onToolChange('eraser')} title="Eraser">
              <Icon name="eraser" size={20} />
            </RoundBtn>

            <PillDivider />

            {/* size — single combined button */}
            <LongBtn $active={expanded === 'size'} onClick={() => toggle('size')}>
              <SizeDotPreview $dotSize={SIZE_DOT_PX[sizeId ?? DEFAULT_SIZE_ID]} />
              <Icon name={expanded === 'size' ? 'arrow_up_caret' : 'arrow_down_caret'} size={18} />
            </LongBtn>

            <PillDivider />

            {/* color — single combined button */}
            <LongBtn $active={expanded === 'color'} onClick={() => toggle('color')}>
              <ColorCircle $color={activeColor} />
              <Icon name={expanded === 'color' ? 'arrow_up_caret' : 'arrow_down_caret'} size={18} />
            </LongBtn>
          </PillRow>

          {expanded === 'size' && (
            <PillExpandRow>
              {SKETCH_SIZE_IDS.map(id => (
                <RoundBtn
                  key={id}
                  $outlined={sizeId === id}
                  onClick={() => { onSizeChange(id); setExpanded(null); }}
                  title={id.toUpperCase()}
                >
                  <DotVisual $size={SIZE_DOT_PX[id]} />
                </RoundBtn>
              ))}
            </PillExpandRow>
          )}

          {expanded === 'color' && (
            <PillExpandRow>
              {SKETCH_COLOR_IDS.map(id => (
                <ColorSwatch
                  key={id}
                  $color={resolveColor(id, isDark)}
                  $active={colorId === id}
                  onClick={() => { onColorChange(id); setExpanded(null); }}
                  title={id}
                />
              ))}
            </PillExpandRow>
          )}
        </Pill>
      </TopSection>

      <BottomSection>
        <Pill>
          <PillRow>
            <RoundBtn $disabled={!canUndo} onClick={onUndo} title="Undo">
              <Icon name="undo" size={20} />
            </RoundBtn>
            <RoundBtn $disabled={!canRedo} onClick={onRedo} title="Redo">
              <Icon name="redo" size={20} />
            </RoundBtn>
          </PillRow>
        </Pill>
        <Pill>
          <PillRow>
            <RoundBtn onClick={onDone} title="Save">
              <Icon name="check" size={20} />
            </RoundBtn>
            <RoundBtn onClick={onCancel} title="Cancel">
              <Icon name="close" size={20} />
            </RoundBtn>
          </PillRow>
        </Pill>
      </BottomSection>
    </Overlay>
  );
}
