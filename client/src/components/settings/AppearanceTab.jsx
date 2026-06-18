import React, { useCallback } from 'react';
import styled from 'styled-components';
import Icon from '../Icons';
import Switch from '../Switch';
import { COLORS } from '../ColorPicker';
import { useUIPreferences } from '../../contexts/UIPreferencesContext';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  OptionRow,
  ModeSelector,
  ModeButton,
} from './styles';

const ColorLabelsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
`;

const ColorLabelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  border-radius: 50vh;
  border: 1px solid var(--border-color);
`;

const ColorCircleSettings = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: ${props => `var(--note-color-${props.$color})`};
  border: 1px solid var(--border-color);
  flex-shrink: 0;
`;

const ColorLabelInput = styled.input`
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 4px;
  background-color: transparent;
  color: var(--text-color);
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }

  &::placeholder {
    color: var(--text-secondary-color);
    opacity: 0.7;
  }
`;

const ClearLabelButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-secondary-color);
  cursor: pointer;
  border-radius: 50%;
  padding: 0;
  flex-shrink: 0;
  opacity: 1;
  transition: opacity 0.15s, background-color 0.15s;

  &:hover {
    opacity: 1;
    background-color: rgba(128, 128, 128, 0.2);
  }
`;

const AppearanceTab = ({ settings, commit, isDarkTheme, toggleTheme }) => {
  const {
    showQuickAccess,
    showMonthMarkers,
    showNoteTabs,
    fullscreenNoteForm,
    layoutView,
    toggleQuickAccess,
    toggleMonthMarkers,
    toggleNoteTabs,
    toggleFullscreenNoteForm,
    changeLayoutView,
    colorLabels,
    setColorLabel,
    pageBackgroundEnabled,
    setPageBackgroundEnabled,
    regenerateBackground,
    pageBgPreview,
    notesFontFamily,
    notesBodyFontSize,
    setNotesFontFamily,
    setNotesBodyFontSize,
  } = useUIPreferences();

  const handleColorLabelChange = useCallback((color, label) => {
    setColorLabel(color, label);

    const newColorLabels = { ...colorLabels };
    if (label && label.trim()) {
      newColorLabels[color] = label.trim();
    } else {
      delete newColorLabels[color];
    }

    commit({ ...settings, COLOR_LABELS: JSON.stringify(newColorLabels) });
  }, [colorLabels, settings, setColorLabel, commit]);

  return (
    <>
      <SectionContainer>
        <SectionTitle>Theme</SectionTitle>
        <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label style={{ marginBottom: 0 }}>Dark Mode</Label>
          <Switch
            id="theme-toggle"
            checked={isDarkTheme}
            onChange={toggleTheme}
          />
        </FormGroup>
      </SectionContainer>

      <SectionContainer>
        <SectionTitle>Notes List Preferences</SectionTitle>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Layout</Label>
          <ModeSelector>
            <ModeButton
              $active={layoutView === 'grid'}
              onClick={() => changeLayoutView('grid')}
              title="Grid layout"
            >
              {layoutView === 'grid' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <Icon name="grid" size={16} />
              Grid
            </ModeButton>
            <ModeButton
              $active={layoutView === 'stacked'}
              onClick={() => changeLayoutView('stacked')}
              title="Stacked layout"
            >
              {layoutView === 'stacked' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <Icon name="rows" size={16} />
              Stacked
            </ModeButton>
            <ModeButton
              $active={layoutView === 'list'}
              onClick={() => changeLayoutView('list')}
              title="List layout with detail panel"
            >
              {layoutView === 'list' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <Icon name="layoutSidebar" size={16} />
              List
            </ModeButton>
            <ModeButton
              $active={layoutView === 'overview'}
              onClick={() => changeLayoutView('overview')}
              title="Overview layout"
            >
              {layoutView === 'overview' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <Icon name="viewOverview" size={16} />
              Overview
            </ModeButton>
          </ModeSelector>
        </OptionRow>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Show Quick Access</Label>
          <Switch
            id="quick-access-toggle"
            checked={showQuickAccess}
            onChange={toggleQuickAccess}
          />
        </OptionRow>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Show Month Markers</Label>
          <Switch
            id="month-markers-toggle"
            checked={showMonthMarkers}
            onChange={toggleMonthMarkers}
          />
        </OptionRow>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Show Note Tabs</Label>
          <Switch
            id="note-tabs-toggle"
            checked={showNoteTabs}
            onChange={toggleNoteTabs}
          />
        </OptionRow>
      </SectionContainer>

      <SectionContainer>
        <SectionTitle>Page Background</SectionTitle>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Enable page backgrounds</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {pageBackgroundEnabled && (
              <>
                {pageBgPreview && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: '30px', height: '30px', borderRadius: '8px',
                      backgroundImage: pageBgPreview, backgroundColor: 'var(--hover-color)',
                      border: '1px solid var(--border-color)', flexShrink: 0,
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={regenerateBackground}
                  title="New gradient"
                  aria-label="New gradient"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '30px', height: '30px', padding: 0, cursor: 'pointer',
                    color: 'var(--text-color)', background: 'var(--hover-color)',
                    border: '1px solid var(--border-color)', borderRadius: '8px',
                  }}
                >
                  <Icon name="refresh" size={15} />
                </button>
              </>
            )}
            <Switch
              id="page-background-toggle"
              checked={pageBackgroundEnabled}
              onChange={() => {
                const newVal = !pageBackgroundEnabled;
                setPageBackgroundEnabled(newVal);
                commit({ ...settings, BACKGROUND_ENABLED: newVal });
              }}
            />
          </div>
        </OptionRow>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)', margin: 0 }}>
          Shows a subtle mesh gradient, unique to each session, by{' '}
          <a
            href="https://github.com/cristicretu/meshgrad"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-secondary-color)', textDecoration: 'underline' }}
          >
            meshgrad
          </a>.
        </p>
      </SectionContainer>

      <SectionContainer>
        <SectionTitle>Note Editor</SectionTitle>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Fullscreen Note Form (Desktop)</Label>
          <Switch
            id="fullscreen-noteform-toggle"
            checked={fullscreenNoteForm}
            onChange={toggleFullscreenNoteForm}
          />
        </OptionRow>
      </SectionContainer>

      <SectionContainer>
        <SectionTitle>Typography</SectionTitle>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Font Family</Label>
          <ModeSelector>
            <ModeButton
              $active={notesFontFamily === 'sans'}
              onClick={() => setNotesFontFamily('sans')}
              title="Sans-serif (Product Sans)"
            >
              {notesFontFamily === 'sans' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <span style={{ fontFamily: "'Product Sans', Arial, sans-serif" }}>Sans</span>
            </ModeButton>
            <ModeButton
              $active={notesFontFamily === 'serif'}
              onClick={() => setNotesFontFamily('serif')}
              title="Serif (Source Serif 4)"
            >
              {notesFontFamily === 'serif' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <span style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}>Serif</span>
            </ModeButton>
          </ModeSelector>
        </OptionRow>
        <OptionRow>
          <Label style={{ marginBottom: 0 }}>Body Font Size</Label>
          <ModeSelector>
            <ModeButton
              $active={notesBodyFontSize === 's'}
              onClick={() => setNotesBodyFontSize('s')}
              title="Small"
            >
              {notesBodyFontSize === 's' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <span style={{ fontSize: '12px' }}>Small</span>
            </ModeButton>
            <ModeButton
              $active={notesBodyFontSize === 'm'}
              onClick={() => setNotesBodyFontSize('m')}
              title="Medium (default)"
            >
              {notesBodyFontSize === 'm' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <span style={{ fontSize: '14px' }}>Medium</span>
            </ModeButton>
            <ModeButton
              $active={notesBodyFontSize === 'l'}
              onClick={() => setNotesBodyFontSize('l')}
              title="Large"
            >
              {notesBodyFontSize === 'l' && <Icon name="check" size={16} strokeWidth="2.5"/>}
              <span style={{ fontSize: '16px' }}>Large</span>
            </ModeButton>
          </ModeSelector>
        </OptionRow>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)', margin: 0 }}>
          Applies to note body in the editor and note cards.
        </p>
      </SectionContainer>

      <SectionContainer>
        <SectionTitle>Custom Color Labels</SectionTitle>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
          Give colors custom names that make sense to you. These labels will appear in tooltips and search suggestions.
        </p>
        <ColorLabelsGrid>
          {COLORS.filter(color => color !== 'default').map(color => (
            <ColorLabelRow key={color} $isDark={isDarkTheme}>
              <ColorCircleSettings $color={color} />
              <ColorLabelInput
                type="text"
                placeholder={color}
                value={colorLabels[color] || ''}
                onChange={(e) => handleColorLabelChange(color, e.target.value)}
              />
              {colorLabels[color] && (
                <ClearLabelButton
                  onClick={() => handleColorLabelChange(color, '')}
                  title="Reset to default"
                >
                  <Icon name="close" size={18} strokeWidth="3" />
                </ClearLabelButton>
              )}
            </ColorLabelRow>
          ))}
        </ColorLabelsGrid>
      </SectionContainer>
    </>
  );
};

export default AppearanceTab;
