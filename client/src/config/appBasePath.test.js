import { describe, expect, it } from 'vitest';
import { normalizeAppBasePath } from './normalizeBasePath';

describe('normalizeAppBasePath', () => {
  it('keeps the root deployment path', () => {
    expect(normalizeAppBasePath('/')).toBe('/');
  });

  it('normalizes a subpath for Vite', () => {
    expect(normalizeAppBasePath('notes')).toBe('/notes/');
    expect(normalizeAppBasePath('/notes///')).toBe('/notes/');
  });
});
