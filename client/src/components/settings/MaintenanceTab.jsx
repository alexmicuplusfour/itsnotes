import React from 'react';
import styled from 'styled-components';
import Switch from '../Switch';
import Icon from '../Icons';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
} from './styles';

const Description = styled.p`
  font-size: 14px;
  color: var(--text-secondary-color);
  margin: 0;
`;

const Card = styled.div`
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`;

const CardTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary-color);
`;

const DaysRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const DaysInput = styled(Input)`
  width: 90px;
`;

const DaysSuffix = styled.span`
  font-size: 14px;
  color: var(--text-color);
`;

const MaintenanceTab = ({ settings, onChange, commit }) => {
  // Trash auto-delete is opt-out: anything other than the string 'false' is on.
  const trashEnabled = settings.TRASH_CLEANUP_ENABLED !== 'false';
  // Auto-archive is opt-in: off unless explicitly 'true'.
  const archiveEnabled = settings.AUTO_ARCHIVE_ENABLED === 'true';

  return (
    <SectionContainer>
      <SectionTitle>Maintenance</SectionTitle>
      <Description>
        Automatic housekeeping that runs once a day in the background. Use these to keep
        your notes tidy without doing it by hand.
      </Description>

      <Card>
        <CardHeader>
          <div>
            <CardTitle><Icon name="deleteForever" size={18} />Auto-empty trash</CardTitle>
          </div>
          <Switch
            id="trash-cleanup-toggle"
            checked={trashEnabled}
            onChange={() => commit({
              ...settings,
              TRASH_CLEANUP_ENABLED: trashEnabled ? 'false' : 'true',
            })}
          />
        </CardHeader>
        <Description>
          Permanently deletes notes that have been sitting in the trash longer than the
          age below. This cannot be undone.
        </Description>

        {trashEnabled && (
          <FormGroup>
            <Label>Delete trashed notes older than</Label>
            <DaysRow>
              <DaysInput
                type="number"
                min="1"
                name="TRASH_CLEANUP_AGE_DAYS"
                value={settings.TRASH_CLEANUP_AGE_DAYS || '30'}
                onChange={onChange}
              />
              <DaysSuffix>days</DaysSuffix>
            </DaysRow>
            <Hint style={{ marginTop: '6px' }}>
              Counted from when each note was moved to the trash.
            </Hint>
          </FormGroup>
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle><Icon name="archive" size={18} />Auto-archive old notes</CardTitle>
          </div>
          <Switch
            id="auto-archive-toggle"
            checked={archiveEnabled}
            onChange={() => commit({
              ...settings,
              AUTO_ARCHIVE_ENABLED: archiveEnabled ? 'false' : 'true',
            })}
          />
        </CardHeader>
        <Description>
          Moves notes you haven’t touched in a while into the archive to keep your main
          view focused. Pinned notes are never auto-archived, and nothing is deleted.
        </Description>

        {archiveEnabled && (
          <FormGroup>
            <Label>Archive notes not edited in</Label>
            <DaysRow>
              <DaysInput
                type="number"
                min="1"
                name="AUTO_ARCHIVE_AGE_DAYS"
                value={settings.AUTO_ARCHIVE_AGE_DAYS || '365'}
                onChange={onChange}
              />
              <DaysSuffix>days</DaysSuffix>
            </DaysRow>
            <Hint style={{ marginTop: '6px' }}>
              Counted from each note’s last edit. Editing a note resets the clock.
            </Hint>
          </FormGroup>
        )}
      </Card>
    </SectionContainer>
  );
};

export default MaintenanceTab;
