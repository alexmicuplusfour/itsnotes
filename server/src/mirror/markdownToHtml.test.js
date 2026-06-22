'use strict';

const fs = require('fs');
const path = require('path');
const { markdownToHtml } = require('./markdownToHtml');
const { htmlToMarkdown } = require('./htmlToMarkdown');

const FIX = path.join(__dirname, '__fixtures__');
const read = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');

// The mirror's source of truth is the note's HTML, and the .md file is what
// htmlToMarkdown produces from it. markdownToHtml must be the inverse of that, so
// the meaningful invariant is Markdown-level stability: starting from the file the
// mirror would write, MD -> HTML -> MD must reproduce the same Markdown.
const roundTrip = (name) => {
  const md1 = htmlToMarkdown(read(name));
  const html2 = markdownToHtml(md1);
  const md2 = htmlToMarkdown(html2);
  return { md1, md2, html2 };
};

describe('markdownToHtml', () => {
  test('empty / whitespace input yields empty string', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('   \n  ')).toBe('');
  });

  test('plain text and bullet lists survive the round-trip', () => {
    const { md1, md2 } = roundTrip('plain.html');
    expect(md2).toBe(md1);
  });

  test('headings and tag mentions survive the round-trip', () => {
    const { md1, md2, html2 } = roundTrip('tags.html');
    expect(md2).toBe(md1);
    expect(html2).toContain('data-type="tag-mention"');
    expect(html2).toContain('<h2');
  });

  test('object mention and note reference survive the round-trip', () => {
    const { md1, md2, html2 } = roundTrip('object-mention.html');
    expect(md2).toBe(md1);
    expect(html2).toContain('data-type="object-mention"');
    expect(html2).toContain('data-note-uuid="d70a28bf-2ec9-4865-ae37-167fea48be24"');
  });

  test('object card survives the round-trip', () => {
    const { md1, md2, html2 } = roundTrip('object-card.html');
    expect(md2).toBe(md1);
    expect(html2).toContain('data-type="object-card"');
    expect(html2).toContain('objectid="0eed5ce7-5cf4-4098-afec-275f3693f683"');
    expect(html2).toContain('objecttype="movie"');
  });

  test('inline images survive the round-trip', () => {
    const { md1, md2, html2 } = roundTrip('image.html');
    expect(md2).toBe(md1);
    expect(html2).toContain('data-image-id="1136"');
  });

  test('task lists survive the round-trip', () => {
    const { md1, md2, html2 } = roundTrip('tasklist.html');
    expect(md2).toBe(md1);
    expect(html2).toContain('data-type="taskList"');
    expect(html2).toContain('data-type="taskItem"');
    expect(html2).toContain('data-checked="true"');
    expect(html2).toContain('data-checked="false"');
  });

  // Tables and <details> have no Markdown equivalent and pass through as raw HTML;
  // jsdom re-serialization isn't guaranteed byte-stable, so assert the structure
  // survives rather than exact Markdown equality.
  test('details block passes through as raw HTML', () => {
    const md1 = htmlToMarkdown(read('details.html'));
    const html2 = markdownToHtml(md1);
    expect(html2).toContain('<details');
    expect(html2).toContain('<summary>');
    expect(html2).toContain('</details>');
  });

  test('attachment link and table pass through', () => {
    const md1 = htmlToMarkdown(read('attachment-table.html'));
    const html2 = markdownToHtml(md1);
    expect(html2).toContain('data-type="attachment"');
    expect(html2).toContain('filename="repository-open-graph-template.psd"');
    expect(html2).toContain('id="118"');
    expect(html2).toContain('<table');
    expect(html2).toContain('</table>');
  });
});

describe('markdownToHtml unit behaviours', () => {
  test('a single tag mention becomes a tag-mention span', () => {
    const html = markdownToHtml('a #work item');
    expect(html).toContain('data-type="tag-mention"');
    expect(html).toContain('data-label="work"');
    expect(html).toContain('#work');
  });

  test('resolveTag restores the data-tag-id on a tag mention', () => {
    const html = markdownToHtml('a #work item', { resolveTag: (label) => `id-${label}` });
    expect(html).toContain('data-tag-id="id-work"');
    expect(html).toContain('data-label="work"');
  });

  test('without resolveTag a tag mention has a label but no id', () => {
    const html = markdownToHtml('a #work item');
    expect(html).toContain('data-label="work"');
    expect(html).not.toContain('data-tag-id');
  });

  test('insignificant whitespace between block elements is stripped', () => {
    // A loose list (blank lines between items) wraps each item in <p>, exactly the
    // shape the user's note round-trips through — and the marker newlines must go.
    const html = markdownToHtml('- one\n\n- two');
    expect(html).toBe('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    expect(html).not.toMatch(/>\s+</);
  });

  test('a meaningful space between inline mentions is preserved', () => {
    const html = markdownToHtml('#cooking #recipe');
    // The space separating the two tag spans must survive the whitespace strip.
    expect(html).toMatch(/<\/span> <span/);
  });

  test('tags inside code spans are left alone', () => {
    const html = markdownToHtml('use the `#channel` syntax');
    expect(html).not.toContain('tag-mention');
    expect(html).toContain('<code>#channel</code>');
  });

  test('object mention link becomes an object-mention span with @label', () => {
    const html = markdownToHtml('see [Dune](object:abc-123) tonight');
    expect(html).toContain('data-type="object-mention"');
    expect(html).toContain('data-object-id="abc-123"');
    expect(html).toContain('data-label="Dune"');
    expect(html).toContain('@Dune');
  });

  test('note reference link becomes a note-reference span', () => {
    const html = markdownToHtml('[my note](note:uuid-9)');
    expect(html).toContain('data-note-uuid="uuid-9"');
    expect(html).toContain('class="note-reference-link"');
    expect(html).toContain('my note');
  });

  test('object image becomes an object-card div, replacing its wrapper paragraph', () => {
    const html = markdownToHtml('![movie](object:obj-7)');
    expect(html).toContain('data-type="object-card"');
    expect(html).toContain('objectid="obj-7"');
    expect(html).toContain('objecttype="movie"');
    // The block lands as a top-level div, not nested inside a <p>.
    expect(html).not.toMatch(/<p>\s*<div data-type="object-card"/);
  });

  test('resource image becomes an inline image referencing its image id', () => {
    const html = markdownToHtml('![pic](_resources/img-42.png)');
    expect(html).toContain('data-image-id="42"');
    expect(html).toContain('alt="pic"');
  });

  test('attachment link becomes an attachment div', () => {
    const html = markdownToHtml('[report.pdf](_resources/att-5-report.pdf)');
    expect(html).toContain('data-type="attachment"');
    expect(html).toContain('id="5"');
    expect(html).toContain('filename="report.pdf"');
  });

  test('remote and data images keep their src verbatim', () => {
    const remote = markdownToHtml('![x](https://example.com/a.png)');
    expect(remote).toContain('src="https://example.com/a.png"');
    const data = markdownToHtml('![x](data:image/png;base64,AAAA)');
    expect(data).toContain('src="data:image/png;base64,AAAA"');
  });

  test('a checkbox list becomes a Tiptap task list', () => {
    const html = markdownToHtml('- [x] done\n- [ ] todo');
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('data-checked="false"');
    // Task item content is wrapped in a paragraph, as Tiptap expects.
    expect(html).toMatch(/data-checked="true"[^>]*><p>done<\/p>/);
  });

  test('an &nbsp; paragraph becomes an empty paragraph gap', () => {
    const html = markdownToHtml('A\n\n&nbsp;\n\nB');
    expect(html).toContain('<p>A</p>');
    expect(html).toContain('<p>B</p>');
    expect(html).toContain('<p></p>');
  });
});
