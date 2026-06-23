const { keepNoteToContent, textToHtml } = require('./keepNoteToContent');

describe('keepNoteToContent', () => {
  describe('checklist notes (listContent)', () => {
    it('renders a Tiptap task list instead of importing blank', () => {
      const note = {
        title: 'Groceries',
        listContent: [
          { text: 'Milk', isChecked: false },
          { text: 'Bread', isChecked: true },
        ],
      };
      const { html, plainText } = keepNoteToContent(note);

      expect(html).toBe(
        '<ul data-type="taskList">' +
          '<li data-type="taskItem" data-checked="false"><p>Milk</p></li>' +
          '<li data-type="taskItem" data-checked="true"><p>Bread</p></li>' +
          '</ul>'
      );
      // checked state preserved
      expect(html).toContain('data-checked="true"');
      // plain_content stays clean and searchable
      expect(plainText).toBe('Milk\nBread');
    });

    it('prefers listContent when textContent is empty', () => {
      const note = { textContent: '', listContent: [{ text: 'Task', isChecked: false }] };
      const { html } = keepNoteToContent(note);
      expect(html).toContain('data-type="taskList"');
      expect(html).toContain('Task');
    });

    it('escapes checklist item text', () => {
      const note = { listContent: [{ text: 'a < b & c', isChecked: false }] };
      const { html } = keepNoteToContent(note);
      expect(html).toContain('a &lt; b &amp; c');
      expect(html).not.toContain('a < b & c');
    });

    it('handles an empty item without breaking the list item', () => {
      const note = { listContent: [{ text: '', isChecked: true }] };
      const { html } = keepNoteToContent(note);
      expect(html).toBe(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p></p></li></ul>'
      );
    });
  });

  describe('plain-text notes (textContent)', () => {
    it('wraps each line in a paragraph so line breaks survive in the grid', () => {
      const { html } = keepNoteToContent({ textContent: 'line one\nline two' });
      expect(html).toBe('<p>line one</p><p>line two</p>');
    });

    it('preserves blank lines between paragraphs', () => {
      const { html } = keepNoteToContent({ textContent: 'a\n\nb' });
      expect(html).toBe('<p>a</p><p></p><p>b</p>');
    });

    it('escapes HTML special characters', () => {
      const { html } = keepNoteToContent({ textContent: '<script>alert(1)</script> & more' });
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<script>');
    });

    it('linkifies bare URLs', () => {
      const { html } = keepNoteToContent({ textContent: 'see https://example.com here' });
      expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    });

    it('keeps plain_content as the raw text for search', () => {
      const { plainText } = keepNoteToContent({ textContent: 'searchable text' });
      expect(plainText).toBe('searchable text');
    });

    it('returns empty html for an empty note', () => {
      expect(keepNoteToContent({ textContent: '' })).toEqual({ html: '', plainText: '' });
      expect(keepNoteToContent({})).toEqual({ html: '', plainText: '' });
    });
  });

  describe('textToHtml normalization', () => {
    it('normalizes CRLF line endings', () => {
      expect(textToHtml('a\r\nb')).toBe('<p>a</p><p>b</p>');
    });
  });
});
