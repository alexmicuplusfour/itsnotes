import React from 'react';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  LabelBold,
  Input,
} from './styles';

const NotificationsTab = ({ settings, onChange }) => (
  <SectionContainer>
    <SectionTitle>Notifications</SectionTitle>
    <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)', margin: 0 }}>
      Configure where reminder notifications are sent.
    </p>

    <SectionContainer>
      <LabelBold>Pushover</LabelBold>
      <FormGroup>
        <Label>User Key</Label>
        <Input
          type="text"
          name="PUSHOVER_USER"
          value={settings.PUSHOVER_USER}
          onChange={onChange}
        />
      </FormGroup>
      <FormGroup>
        <Label>API Token</Label>
        <Input
          type="text"
          name="PUSHOVER_TOKEN"
          value={settings.PUSHOVER_TOKEN}
          onChange={onChange}
        />
      </FormGroup>
    </SectionContainer>

    <SectionContainer>
      <LabelBold>Pushbullet</LabelBold>
      <FormGroup>
        <Label>Access Token</Label>
        <Input
          type="text"
          name="PUSHBULLET_TOKEN"
          value={settings.PUSHBULLET_TOKEN}
          onChange={onChange}
        />
      </FormGroup>
    </SectionContainer>

    <SectionContainer>
      <LabelBold>Ntfy</LabelBold>
      <FormGroup>
        <Label>Server URL</Label>
        <Input
          type="text"
          name="NTFY_SERVER"
          value={settings.NTFY_SERVER}
          onChange={onChange}
          placeholder="https://ntfy.sh"
        />
      </FormGroup>
      <FormGroup>
        <Label>Topic</Label>
        <Input
          type="text"
          name="NTFY_TOPIC"
          value={settings.NTFY_TOPIC}
          onChange={onChange}
        />
      </FormGroup>
    </SectionContainer>
  </SectionContainer>
);

export default NotificationsTab;
