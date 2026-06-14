function renderNoteHtml({ title, content, timestamp, timestampLabel = 'Created' }) {
  const headingTitle = title || 'Untitled';
  const documentTitle = title || 'Untitled Note';
  const timestampLine = timestamp
    ? `<div class="timestamp">${timestampLabel}: ${new Date(timestamp).toLocaleString()}</div>`
    : '';
  const body = content || '<p><em>No content</em></p>';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${documentTitle}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .timestamp {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 20px;
    }
    .content {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${headingTitle}</h1>
  ${timestampLine}
  <div class="content">
    ${body}
  </div>
</body>
</html>`;
}

module.exports = { renderNoteHtml };
