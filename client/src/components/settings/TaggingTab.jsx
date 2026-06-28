import React from 'react';
import styled from 'styled-components';
import Icon from '../Icons';
import Switch from '../Switch';
import TagMultiSelect from '../TagMultiSelect';
import { useAutoTagging, AUTO_TAG_FEATURES } from '../../contexts/AutoTaggingContext';
import {
  SectionContainer,
  SectionTitle,
  OptionRow,
  OptionLabel,
  ModeSelector,
  ModeButton,
} from './styles';

const AutoTagRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background-color: ${props => props.$isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'};
  border-radius: 8px;
`;

const AutoTagHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const AutoTagTitle = styled.div`
  font-weight: 500;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const AutoTagDescription = styled.div`
  font-size: 13px;
  color: var(--text-secondary-color);
  margin-top: -4px;
`;

const AutoTagOptions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 0px;
`;

// Each entry mirrors one auto-tagging feature row. `mode` shows the
// auto/suggest selector; `tags` shows the tag multi-select. Some features
// expose only one of the two.
const FEATURES = [
  { feature: AUTO_TAG_FEATURES.ATTACHMENT_ADDED, id: 'attachment-added-autotag-toggle', icon: 'attachment', title: 'Attachment Added', description: 'Automatically tag a note when you add the first file attachment to it. Subsequent attachments won’t re-tag.', mode: true, tags: true },
  { feature: AUTO_TAG_FEATURES.URL_CONTENT, id: 'url-content-autotag-toggle', icon: 'link', title: 'URL Content', description: 'Automatically tag notes when adding content from a URL (articles, web pages).', mode: true, tags: true },
  { feature: AUTO_TAG_FEATURES.LINKED_NOTE, id: 'linked-note-autotag-toggle', icon: 'notes', title: 'Linked Note', description: 'Automatically tag notes created via "Add Note" from within another note.', mode: false, tags: true },
  { feature: AUTO_TAG_FEATURES.TAG_SEARCH, id: 'tag-search-autotag-toggle', icon: 'search', title: 'Tag Search', description: 'When creating a note while viewing tag search results, add the searched tag(s) to the new note.', mode: true, tags: false },
  { feature: AUTO_TAG_FEATURES.REMINDERS, id: 'reminder-autotag-toggle', icon: 'bell', title: 'Reminders', description: 'Automatically tag notes when creating reminders from them.', mode: true, tags: true },
  { feature: AUTO_TAG_FEATURES.TASK_COMPLETED, id: 'task-completed-autotag-toggle', icon: 'tiptap_tasklist', title: 'Task List Completed', description: 'When all tasks in a note are checked off, suggest or apply tags after a short delay.', mode: true, tags: true },
  { feature: AUTO_TAG_FEATURES.AI_GENERATED, id: 'ai-generated-autotag-toggle', icon: 'magic', title: 'AI Tag Generation', description: 'Configure behavior when using the "Auto-tag" action in the tag picker.', mode: true, tags: false },
  { feature: AUTO_TAG_FEATURES.BOOK_FINISHED, id: 'book-finished-autotag-toggle', icon: 'book', title: 'Book Finished', description: 'Automatically tag notes when marking a book as finished.', mode: true, tags: true },
  { feature: AUTO_TAG_FEATURES.BOOK_ADDED, id: 'book-added-autotag-toggle', icon: 'book', title: 'Book Added', description: 'Automatically tag notes when adding a book from Goodreads.', mode: true, tags: true },
  { feature: AUTO_TAG_FEATURES.IMDB_ADDED, id: 'imdb-added-autotag-toggle', icon: 'video', title: 'IMDB Added', description: 'Automatically tag notes when adding a movie or show from IMDB.', mode: true, tags: true },
];

const AutoTagFeature = ({ config, isDarkTheme }) => {
  const { getFeatureSettings, toggleFeatureEnabled, setFeatureMode, setFeatureTags } = useAutoTagging();
  const { feature, id, icon, title, description, mode, tags } = config;
  const fs = getFeatureSettings(feature);

  return (
    <AutoTagRow $isDark={isDarkTheme}>
      <AutoTagHeader>
        <AutoTagTitle>
          <Icon name={icon} size={18} />
          {title}
        </AutoTagTitle>
        <Switch
          id={id}
          checked={fs.enabled}
          onChange={() => toggleFeatureEnabled(feature)}
        />
      </AutoTagHeader>
      <AutoTagDescription>{description}</AutoTagDescription>

      {fs.enabled && (
        <AutoTagOptions>
          {mode && (
            <OptionRow>
              <OptionLabel>Tag behavior:</OptionLabel>
              <ModeSelector>
                <ModeButton
                  $active={fs.mode === 'auto'}
                  onClick={() => setFeatureMode(feature, 'auto')}
                >
                  {fs.mode === 'auto' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                  Apply automatically
                </ModeButton>
                <ModeButton
                  $active={fs.mode === 'suggest'}
                  onClick={() => setFeatureMode(feature, 'suggest')}
                >
                  {fs.mode === 'suggest' && <Icon name="check" size={16} strokeWidth="2.5"/>}
                  Suggest only
                </ModeButton>
              </ModeSelector>
            </OptionRow>
          )}
          {tags && (
            <OptionRow style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
              <OptionLabel>Tags to apply:</OptionLabel>
              <TagMultiSelect
                selectedTagIds={fs.tagIds || []}
                onChange={(tagIds) => setFeatureTags(feature, tagIds)}
                placeholder="Search and add tags..."
              />
            </OptionRow>
          )}
        </AutoTagOptions>
      )}
    </AutoTagRow>
  );
};

const TaggingTab = ({ isDarkTheme }) => (
  <SectionContainer>
    <SectionTitle>Auto-Tagging</SectionTitle>
    <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
      Configure automatic tagging for different features. Tags can be applied automatically or suggested for your approval.
    </p>

    {FEATURES.map(config => (
      <AutoTagFeature key={config.id} config={config} isDarkTheme={isDarkTheme} />
    ))}
  </SectionContainer>
);

export default TaggingTab;
