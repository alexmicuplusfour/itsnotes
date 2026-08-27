import { describe, it, expect } from 'vitest';
import { composeSharedNote } from './shareToNote';

describe('composeSharedNote', () => {
  it('turns a Chrome-style share (title + url-only text) into a title + standalone link line', () => {
    const { title, content, isEmpty } = composeSharedNote({
      title: 'An article',
      text: 'https://example.com/article',
    });
    expect(title).toBe('An article');
    expect(content).toBe('<p><a href="https://example.com/article">https://example.com/article</a></p>');
    expect(isEmpty).toBe(false);
  });

  it('splits a YouTube-style share (prose + trailing url in text) into prose then link line', () => {
    const { content } = composeSharedNote({ text: 'Cool video https://youtu.be/abc123' });
    expect(content).toBe('<p>Cool video</p><p><a href="https://youtu.be/abc123">https://youtu.be/abc123</a></p>');
  });

  it('keeps an explicit url param on its own line after the text', () => {
    const { content } = composeSharedNote({ title: 'T', text: 'my comment', url: 'https://example.com' });
    expect(content).toBe('<p>my comment</p><p><a href="https://example.com">https://example.com</a></p>');
  });

  it('does not duplicate a url that appears in both text and the url param', () => {
    const { content } = composeSharedNote({ text: 'look https://example.com', url: 'https://example.com' });
    expect(content).toBe('<p>look</p><p><a href="https://example.com">https://example.com</a></p>');
  });

  it('preserves blank-line paragraph breaks in shared text', () => {
    const { content } = composeSharedNote({ text: 'line one\n\nline two' });
    expect(content).toBe('<p>line one</p><p></p><p>line two</p>');
  });

  it('escapes HTML in shared text', () => {
    const { content } = composeSharedNote({ text: '<b>bold</b> & stuff' });
    expect(content).toBe('<p>&lt;b&gt;bold&lt;/b&gt; &amp; stuff</p>');
  });

  it('prefixes https:// on www links so the href is previewable', () => {
    const { content } = composeSharedNote({ text: 'see www.example.com' });
    expect(content).toBe('<p>see</p><p><a href="https://www.example.com">www.example.com</a></p>');
  });

  it('keeps a different inline url in the prose when an explicit url param is shared', () => {
    const { content } = composeSharedNote({ text: 'compare https://a.com and stuff', url: 'https://b.com' });
    // The &nbsp; after the inline link mirrors the editor's own paste conversion
    expect(content).toBe(
      '<p>compare <a href="https://a.com">https://a.com</a>&nbsp;and stuff</p>' +
      '<p><a href="https://b.com">https://b.com</a></p>'
    );
  });

  it('reports an all-empty share', () => {
    expect(composeSharedNote({}).isEmpty).toBe(true);
    expect(composeSharedNote({ text: '   ' }).isEmpty).toBe(true);
    expect(composeSharedNote().isEmpty).toBe(true);
  });

  it('keeps a title-only share', () => {
    const result = composeSharedNote({ title: 'Just a thought' });
    expect(result.title).toBe('Just a thought');
    expect(result.content).toBe('');
    expect(result.isEmpty).toBe(false);
  });
});
