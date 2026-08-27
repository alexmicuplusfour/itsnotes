import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import api, { aiApi, getServerUrl } from '../../services/api';
import Icon from '../Icons';
import Switch from '../Switch';
import CopyableField from './CopyableField';
import { useToast } from '../../contexts/ToastContext';
import {
  SectionContainer,
  SectionTitle,
  FormGroup,
  Label,
  LabelBold,
  Input,
  Select,
} from './styles';

const TextArea = styled.textarea`
  width: 100%;
  min-height: 150px;
  padding: 10px;
  border-radius: 8px;
  background-color: transparent;
  color: var(--text-color);
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  border: 1px solid var(--border-color);

  &:focus {
    outline: none;
    border-color: var(--foreground-color);
  }

  &::placeholder {
    color: var(--text-secondary-color);
    opacity: 0.7;
  }
`;

const PromptDescription = styled.p`
  font-size: 13px;
  color: var(--text-secondary-color);
  margin-top: 0px;
  margin-bottom: 0;
`;

const ReadOnlyPromptBox = styled.div`
  background-color: ${props => props.$isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)'};
  border-radius: 8px;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary-color);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  margin-bottom: 12px;
`;

const McpCommandBox = styled.div`
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

const McpActionButton = styled.button`
  align-self: flex-start;
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  color: var(--text-color);
  opacity: ${props => props.disabled ? 0.6 : 1};
  &:hover { border-color: var(--foreground-color); }
`;

const PROMPT_FEATURES = [
  { icon: 'summarize_ai', title: 'Note Summarization', modelKey: 'AI_MODEL_SUMMARIZE', coreKey: 'AI_PROMPT_SUMMARIZE', customKey: 'AI_PROMPT_SUMMARIZE_CUSTOM', placeholder: "Add any additional instructions for summarization (e.g., 'Focus on action items' or 'Include relevant dates')...", description: 'Your custom requirements will be appended to the core prompt when generating summaries.' },
  { icon: 'ocr', title: 'OCR Text Extraction', modelKey: 'AI_MODEL_OCR', coreKey: 'AI_PROMPT_OCR', customKey: 'AI_PROMPT_OCR_CUSTOM', placeholder: "Add any additional instructions for OCR (e.g., 'Preserve line breaks' or 'Ignore page numbers')...", description: 'Your custom requirements will be appended to the core prompt when extracting text from images.' },
  { icon: 'bell', title: 'Reminder Generation', modelKey: 'AI_MODEL_REMINDER', coreKey: 'AI_PROMPT_REMINDER', customKey: 'AI_PROMPT_REMINDER_CUSTOM', placeholder: "Add any additional instructions for reminder parsing (e.g., 'Default to 9am if no time specified')...", description: 'Your custom requirements will be appended to the core prompt. Note: The core prompt ensures proper JSON format and date handling.' },
  { icon: 'tag', title: 'Auto-Tagging', modelKey: 'AI_MODEL_AUTO_TAG', coreKey: 'AI_PROMPT_AUTO_TAG', customKey: 'AI_PROMPT_AUTO_TAG_CUSTOM', placeholder: "Add any additional instructions for tag suggestions (e.g., 'Prefer more specific tags over general ones' or 'Always include project tags if mentioned')...", description: 'Your custom requirements will be appended to the core prompt when suggesting tags. This applies when you click "Auto-tag" in the tag picker.' },
];

const ModelSelect = ({ name, value, onChange, models, loading, provider }) => (
  <Select name={name} value={value} onChange={onChange} disabled={loading || models.length === 0}>
    {loading ? (
      <option value="">Loading models...</option>
    ) : models.length === 0 ? (
      <option value="">
        {provider === 'ollama'
          ? 'No models — pull one in Ollama and refresh'
          : 'No models — enter API key and refresh'}
      </option>
    ) : (
      models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
    )}
  </Select>
);

const PromptFeature = ({ config, settings, onChange, models, loading, isDarkTheme }) => (
  <SectionContainer>
    <FormGroup>
      <LabelBold> <Icon name={config.icon} size={20} /> {config.title}</LabelBold>

      <ModelSelect
        name={config.modelKey}
        value={settings[config.modelKey]}
        onChange={onChange}
        models={models}
        loading={loading}
        provider={settings.AI_PROVIDER || 'openai'}
      />

      <Label style={{ marginTop: '16px' }}>Core Prompt (Read-only)</Label>
      <ReadOnlyPromptBox $isDark={isDarkTheme}>
        {settings[config.coreKey]}
      </ReadOnlyPromptBox>

      <Label>Your Custom Requirements (Optional)</Label>
      <TextArea
        name={config.customKey}
        value={settings[config.customKey]}
        onChange={onChange}
        placeholder={config.placeholder}
        style={{ minHeight: '100px' }}
      />
      <PromptDescription>{config.description}</PromptDescription>
    </FormGroup>
  </SectionContainer>
);

const AiTab = ({ settings, onChange, commit, commitImmediate, isDarkTheme }) => {
  const { showToast } = useToast();
  const [availableModels, setAvailableModels] = useState([]);
  const [modelDefaults, setModelDefaults] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [mcpToken, setMcpToken] = useState(null);
  const [mcpTokenLoading, setMcpTokenLoading] = useState(false);

  // `notify` is true only for the explicit "Refresh models" click — the mount
  // and provider-change loads stay silent.
  const loadModels = useCallback(async ({ notify = false } = {}) => {
    setModelsLoading(true);
    try {
      const data = await aiApi.getModels();
      const models = data.models || [];
      setAvailableModels(models);
      setModelDefaults(data.defaults || null);
      // Success is self-evident (the dropdowns populate) — only speak up when
      // there's nothing to show. Ollama being reachable but empty is a
      // different problem than a bad API key, so say so.
      if (notify && models.length === 0) {
        showToast(
          data.provider === 'ollama'
            ? 'Ollama is running but has no models — pull one first, e.g. "ollama pull llama3.2"'
            : 'No models found — check your API key',
          { variant: 'error' }
        );
      }
    } catch (e) {
      setAvailableModels([]);
      // Prefer the server's diagnosis (e.g. "Can't reach Ollama at ...").
      if (notify) {
        showToast(
          e.response?.data?.message || 'Could not load models. Check your API key.',
          { variant: 'error' }
        );
      }
    } finally {
      setModelsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // When models load, auto-select for any feature with no selection: the
  // server's recommended default if the key can actually use it, otherwise
  // the first model in the list. Without the preference, "first in the list"
  // lands on the most expensive Anthropic model (alphabetical) or an ancient
  // OpenAI one (id sort).
  useEffect(() => {
    if (availableModels.length === 0) return;
    const pick = (key) => {
      const preferred = modelDefaults?.[key];
      return availableModels.some(m => m.id === preferred)
        ? preferred
        : availableModels[0].id;
    };
    const updates = {};
    if (!settings.AI_MODEL_SUMMARIZE) updates.AI_MODEL_SUMMARIZE = pick('AI_MODEL_SUMMARIZE');
    if (!settings.AI_MODEL_OCR) updates.AI_MODEL_OCR = pick('AI_MODEL_OCR');
    if (!settings.AI_MODEL_REMINDER) updates.AI_MODEL_REMINDER = pick('AI_MODEL_REMINDER');
    if (!settings.AI_MODEL_AUTO_TAG) updates.AI_MODEL_AUTO_TAG = pick('AI_MODEL_AUTO_TAG');
    if (Object.keys(updates).length > 0) {
      commit({ ...settings, ...updates });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableModels, modelDefaults]);

  const handleProviderChange = async (e) => {
    const newProvider = e.target.value;
    setAvailableModels([]);
    await commitImmediate({
      ...settings,
      AI_PROVIDER: newProvider,
      AI_MODEL_SUMMARIZE: '',
      AI_MODEL_OCR: '',
      AI_MODEL_REMINDER: '',
      AI_MODEL_AUTO_TAG: '',
    });
    loadModels();
  };

  const generateMcpToken = async () => {
    setMcpTokenLoading(true);
    try {
      const { data } = await api.post('/auth/mcp-token');
      setMcpToken(data.token);
    } catch (e) {
      showToast('Could not generate a token. Make sure you are logged in.', { variant: 'error' });
    } finally {
      setMcpTokenLoading(false);
    }
  };

  // getServerUrl returns a bare "/mcp" when SERVER_BASE_URL is unset (relative
  // deploys behind nginx). MCP clients run outside the browser and need an
  // absolute URL, so fall back to the current origin.
  const mcpUrlRaw = getServerUrl('/mcp');
  const mcpUrl = mcpUrlRaw.startsWith('http')
    ? mcpUrlRaw
    : `${window.location.origin}${mcpUrlRaw}`;
  const mcpCommand = mcpToken
    ? `claude mcp add --transport http itsnotes ${mcpUrl} --header "Authorization: Bearer ${mcpToken}"`
    : '';
  // Claude Desktop's custom-connector dialog takes only a URL, so embed the
  // token as a query param (the server accepts it for /mcp).
  const mcpConnectorUrl = mcpToken ? `${mcpUrl}?token=${mcpToken}` : '';

  return (
    <>
      <SectionContainer>
        <SectionTitle>MCP Server</SectionTitle>
        <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label style={{ marginBottom: 0 }}>Enable MCP endpoint</Label>
          <Switch
            id="mcp-enabled-toggle"
            checked={settings.MCP_ENABLED === 'true'}
            onChange={() => commit({ ...settings, MCP_ENABLED: settings.MCP_ENABLED === 'true' ? 'false' : 'true' })}
          />
        </FormGroup>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary-color)', margin: '0 0 4px' }}>
          Exposes a read-only Model Context Protocol endpoint so AI clients
          (Claude, etc.) can search and read your notes. Access requires a
          connection token.
        </p>
        {settings.MCP_ENABLED === 'true' && (
          <>
            <FormGroup>
              <Label>Endpoint URL</Label>
              <McpCommandBox $isDark={isDarkTheme}>{mcpUrl}</McpCommandBox>
            </FormGroup>
            {!mcpToken ? (
              <FormGroup>
                <McpActionButton onClick={generateMcpToken} disabled={mcpTokenLoading}>
                  {mcpTokenLoading ? 'Generating…' : 'Generate connection token'}
                </McpActionButton>
              </FormGroup>
            ) : (
              <>
                <FormGroup>
                  <CopyableField
                    label="Claude Desktop / web (custom connector)"
                    value={mcpConnectorUrl}
                    isDark={isDarkTheme}
                    copyTitle="Copy URL"
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary-color)', margin: '8px 0 0' }}>
                    In Claude, add a custom connector and paste this URL — no files
                    to edit. The token is in the URL, so treat it as a secret.
                  </p>
                </FormGroup>
                <FormGroup>
                  <CopyableField
                    label="Claude Code (CLI)"
                    value={mcpCommand}
                    isDark={isDarkTheme}
                    copyTitle="Copy command"
                  />
                </FormGroup>
              </>
            )}
          </>
        )}
      </SectionContainer>

      <SectionContainer>
        <SectionTitle>AI Features</SectionTitle>
        <FormGroup style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label style={{ marginBottom: 0 }}>Enable AI Features</Label>
          <Switch
            id="ai-enabled-toggle"
            checked={settings.AI_ENABLED !== 'false'}
            onChange={() => commit({ ...settings, AI_ENABLED: settings.AI_ENABLED === 'false' ? 'true' : 'false' })}
          />
        </FormGroup>
        <FormGroup>
          <Label>Provider</Label>
          <Select
            name="AI_PROVIDER"
            value={settings.AI_PROVIDER || 'openai'}
            onChange={handleProviderChange}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="ollama">Ollama (local)</option>
          </Select>
        </FormGroup>
        {(settings.AI_PROVIDER || 'openai') === 'openai' && (
          <FormGroup>
            <Label>OpenAI API Key</Label>
            <Input
              type="text"
              name="OPENAI_API_KEY"
              value={settings.OPENAI_API_KEY}
              onChange={onChange}
              placeholder="sk-..."
            />
          </FormGroup>
        )}
        {settings.AI_PROVIDER === 'anthropic' && (
          <FormGroup>
            <Label>Anthropic API Key</Label>
            <Input
              type="text"
              name="ANTHROPIC_API_KEY"
              value={settings.ANTHROPIC_API_KEY}
              onChange={onChange}
              placeholder="sk-ant-..."
            />
          </FormGroup>
        )}
        {settings.AI_PROVIDER === 'ollama' && (
          <FormGroup>
            <Label>Ollama Base URL</Label>
            <Input
              type="text"
              name="OLLAMA_BASE_URL"
              value={settings.OLLAMA_BASE_URL}
              onChange={onChange}
              placeholder="http://localhost:11434"
            />
            <p style={{ fontSize: '12px', color: 'var(--text-secondary-color)', margin: '6px 0 0' }}>
              No API key needed — notes never leave your server. If itsnotes runs
              in Docker and Ollama on the host, use http://host.docker.internal:11434.
              OCR needs a model with vision support.
            </p>
          </FormGroup>
        )}
      </SectionContainer>

      <SectionContainer>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <SectionTitle style={{ margin: 0 }}>AI Prompts</SectionTitle>
          <button
            onClick={() => loadModels({ notify: true })}
            disabled={modelsLoading}
            style={{
              background: 'none',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              cursor: modelsLoading ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary-color)',
              opacity: modelsLoading ? 0.6 : 1,
            }}
          >
            {modelsLoading ? 'Loading...' : '↻ Refresh models'}
          </button>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary-color)' }}>
          Add custom requirements to AI prompts. The core functionality is protected and cannot be modified.
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-color)', backgroundColor: 'rgba(251, 188, 4, 0.1)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--primary-color)' }}>
          💡 Core prompts are locked to ensure features work correctly. You can add additional instructions below.
        </p>

        {PROMPT_FEATURES.map(config => (
          <PromptFeature
            key={config.modelKey}
            config={config}
            settings={settings}
            onChange={onChange}
            models={availableModels}
            loading={modelsLoading}
            isDarkTheme={isDarkTheme}
          />
        ))}
      </SectionContainer>
    </>
  );
};

export default AiTab;
