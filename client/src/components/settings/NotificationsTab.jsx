import React, { useState } from 'react';
import styled from 'styled-components';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  Input,
} from './styles';
import { notificationsApi } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import pushoverLogo from '../../assets/images/favicon_pushover.png';
import pushbulletLogo from '../../assets/images/favicon_pushbullet.png';
import ntfyLogo from '../../assets/images/favicon_ntfy.png';

// Rounded "app-icon" tile that gives each brand logo real visual weight
// instead of a tiny floating favicon. Neutral gray fill, no border.
const ServiceIcon = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 9px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--input-bg-color);
  img {
    width: 22px;
    height: 22px;
  }
`;

const Description = styled.p`
  font-size: 14px;
  color: var(--text-secondary-color);
  margin: 0;
`;

// Bordered card per service, matching the Maintenance tab.
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
  gap: 11px;
`;

// Subtle outline button, matching the "Refresh models" control in the AI tab.
const TestButton = styled.button`
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: ${props => (props.disabled ? 'not-allowed' : 'pointer')};
  color: var(--text-secondary-color);
  opacity: ${props => (props.disabled ? 0.6 : 1)};
  white-space: nowrap;
  &:hover { border-color: var(--foreground-color); }
`;

// Self-contained "Send test" control for a single service.
const TestControl = ({ service, config }) => {
  const [testing, setTesting] = useState(false);
  const { showToast } = useToast();

  const runTest = async () => {
    setTesting(true);
    try {
      await notificationsApi.test(service, config);
      showToast('Test sent — check your device', { variant: 'success' });
    } catch (e) {
      showToast(e.response?.data?.message || 'Test failed', { variant: 'error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <TestButton onClick={runTest} disabled={testing}>
      {testing ? 'Sending…' : 'Send test'}
    </TestButton>
  );
};

const NotificationsTab = ({ settings, onChange }) => (
  <SectionContainer>
    <SectionTitle>Notifications</SectionTitle>
    <Description>
      Configure where reminder notifications are sent.
    </Description>

    <Card>
      <CardHeader>
        <CardTitle><ServiceIcon><img src={pushoverLogo} alt="" /></ServiceIcon>Pushover</CardTitle>
        <TestControl
          service="pushover"
          config={{ user: settings.PUSHOVER_USER, token: settings.PUSHOVER_TOKEN }}
        />
      </CardHeader>
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
    </Card>

    <Card>
      <CardHeader>
        <CardTitle><ServiceIcon><img src={pushbulletLogo} alt="" /></ServiceIcon>Pushbullet</CardTitle>
        <TestControl
          service="pushbullet"
          config={{ token: settings.PUSHBULLET_TOKEN }}
        />
      </CardHeader>
      <FormGroup>
        <Label>Access Token</Label>
        <Input
          type="text"
          name="PUSHBULLET_TOKEN"
          value={settings.PUSHBULLET_TOKEN}
          onChange={onChange}
        />
      </FormGroup>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle><ServiceIcon><img src={ntfyLogo} alt="" /></ServiceIcon>Ntfy</CardTitle>
        <TestControl
          service="ntfy"
          config={{ server: settings.NTFY_SERVER, topic: settings.NTFY_TOPIC }}
        />
      </CardHeader>
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
    </Card>
  </SectionContainer>
);

export default NotificationsTab;
