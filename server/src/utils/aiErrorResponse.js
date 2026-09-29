const { getOllamaBaseUrl } = require('../services/aiProvider');

// Map an AI-provider failure to a toast-ready { message } response. Every AI
// route funnels its catch block through here so the real cause reaches the
// UI (client toasts display error.response.data.message).
function respondAIError(res, error, fallback) {
  // Our own deliberate errors (no model configured, empty AI answer) already
  // carry a message written for the user.
  if (error.nonRetryable && error.message) {
    return res.status(400).json({ message: error.message });
  }
  const isOllama = (process.env.AI_PROVIDER || 'openai') === 'ollama';
  // Ollama's own request errors are specific (a text-only model sent an
  // image, a cloud model with no sign-in…), so pass them on. Some arrive
  // double-wrapped: a whole JSON error body inside the message string.
  if (isOllama && error.status >= 400 && error.status < 500) {
    let detail = typeof error.error === 'string' ? error.error : error.error?.message || error.message;
    try { detail = JSON.parse(detail).error?.message || detail; } catch { /* plain text */ }
    if (/multimodal|does not support (images|vision)/i.test(detail)) {
      return res.status(400).json({ message: "This model can't read images — pick one with vision support for OCR in Settings → AI." });
    }
    return res.status(400).json({ message: `Ollama: ${detail}` });
  }
  if (error.status === 401) {
    return res.status(500).json({ message: 'Invalid API key' });
  }
  // Any connection-level failure (no HTTP status) on Ollama means the server
  // itself is unreachable — say so, with the URL being tried.
  if (isOllama && error.status === undefined) {
    return res.status(502).json({
      message: `Can't reach Ollama at ${getOllamaBaseUrl()} — is it running, and reachable from the itsnotes server?`,
    });
  }
  return res.status(500).json({ message: fallback });
}

module.exports = { respondAIError };
