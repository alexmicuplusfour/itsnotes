'use strict';

const fs = require('fs');
const path = require('path');
const { htmlToMarkdown } = require('./htmlToMarkdown');

const FIX = path.join(__dirname, '__fixtures__');
const read = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');
const md = (name, opts) => htmlToMarkdown(read(name), opts);

describe('htmlToMarkdown', () => {
  test('empty / whitespace input yields empty string', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('   \n  ')).toBe('');
    expect(htmlToMarkdown('<p></p><p></p>')).toBe('');
  });

  test('empty paragraph between content is preserved as a gap', () => {
    expect(htmlToMarkdown('<p>A</p><p></p><p>B</p>')).toBe('A\n\n&nbsp;\n\nB');
  });

  test('Tiptap trailing-break empty paragraph is preserved as a gap', () => {
    const html = '<p>A</p><p><br class="ProseMirror-trailingBreak"></p><p>B</p>';
    expect(htmlToMarkdown(html)).toBe('A\n\n&nbsp;\n\nB');
  });

  test('stacked empty paragraphs keep one gap per blank line', () => {
    expect(htmlToMarkdown('<p>A</p><p></p><p></p><p>B</p>')).toBe('A\n\n&nbsp;\n\n&nbsp;\n\nB');
  });

  test('leading and trailing empty paragraphs are trimmed away', () => {
    expect(htmlToMarkdown('<p></p><p>A</p><p></p>')).toBe('A');
    expect(htmlToMarkdown('<p><br></p><p>A</p><p><br></p>')).toBe('A');
  });

  test('plain list note: no HTML tags, bullets preserved', () => {
    const out = md('plain.html');
    expect(out).not.toMatch(/<[a-z]/i);
    expect(out).toContain('post office (return that package)');
    expect(out).toContain('groceries if needed');
    expect(out).toMatch(/^- /m);
  });

  test('tag mentions become #hashtags', () => {
    const out = md('tags.html');
    expect(out).toContain('#work');
    expect(out).toContain('#meeting');
    expect(out).toContain('#project');
    expect(out).toContain('## Q1 project kickoff');
    expect(out).not.toContain('data-type');
  });

  test('object mention becomes [label](object:uuid) link', () => {
    const out = md('object-mention.html');
    expect(out).toContain('[The Remains of the Day](object:59d25956-adcb-41cd-877c-281198663023)');
    expect(out).toContain('#books');
  });

  test('note reference mark becomes [text](note:uuid)', () => {
    const out = md('object-mention.html');
    expect(out).toContain('[d70a28bf-2ec9-4865-ae37-167fea48be24](note:d70a28bf-2ec9-4865-ae37-167fea48be24)');
  });

  test('object card (empty div) becomes ![title](object:uuid) image', () => {
    const out = md('object-card.html');
    // No resolver: falls back to objecttype ("movie")
    expect(out).toContain('![movie](object:0eed5ce7-5cf4-4098-afec-275f3693f683)');
    // Inline mention of the same object remains a link
    expect(out).toContain('[Conclave](object:0eed5ce7-5cf4-4098-afec-275f3693f683)');
  });

  test('object card uses resolveObjectTitle when provided', () => {
    const out = md('object-card.html', {
      resolveObjectTitle: (id) =>
        id === '0eed5ce7-5cf4-4098-afec-275f3693f683' ? 'Conclave (2024)' : null,
    });
    expect(out).toContain('![Conclave (2024)](object:0eed5ce7-5cf4-4098-afec-275f3693f683)');
  });

  test('inline images reference _resources by data-image-id', () => {
    const out = md('image.html');
    expect(out).toContain('![image.png](_resources/img-1136)');
    expect(out).toContain('![image.png](_resources/img-1137)');
    expect(out).toContain('![image.png](_resources/img-1138)');
    expect(out).toContain('## Belém');
    expect(out).toContain('#travel');
  });

  test('image resolver controls the resource filename', () => {
    const out = md('image.html', { resolveImage: (id) => `img-${id}.png` });
    expect(out).toContain('![image.png](_resources/img-1136.png)');
  });

  test('task list items become - [x] / - [ ]', () => {
    const out = md('tasklist.html');
    expect(out).toContain('- [x] clean the bathroom before Monday');
    expect(out).toContain('- [ ] call mom this week');
    expect(out).toContain('- [x] respond to that email from Lisa');
    expect(out).toContain('#personal');
    expect(out).toContain('#todo');
  });

  test('details block is preserved as raw HTML', () => {
    const out = md('details.html');
    expect(out).toContain('<details');
    expect(out).toContain('<summary>✨ Summary</summary>');
    expect(out).toContain('</details>');
  });

  test('attachment (empty div) becomes a _resources link', () => {
    const out = md('attachment-table.html');
    expect(out).toContain('[repository-open-graph-template.psd](_resources/att-118-repository-open-graph-template.psd)');
  });

  test('table is preserved as raw HTML passthrough', () => {
    const out = md('attachment-table.html');
    expect(out).toContain('<table');
    expect(out).toContain('</table>');
    expect(out).toContain('### April in review');
  });
});
