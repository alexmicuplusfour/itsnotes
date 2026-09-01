import { describe, expect, it } from 'vitest';
import { normalizeAppBasePath } from './normalizeBasePath';
import { APP_BASE_PATH, APP_BASE_URL, withAppBasePath } from './appBasePath';

describe('normalizeAppBasePath', () => {
  it('keeps the root deployment path', () => {
    expect(normalizeAppBasePath('/')).toBe('/');
    expect(normalizeAppBasePath('')).toBe('/');
    expect(normalizeAppBasePath(undefined)).toBe('/');
  });

  it('normalizes a subpath for Vite', () => {
    expect(normalizeAppBasePath('notes')).toBe('/notes/');
    expect(normalizeAppBasePath('/notes///')).toBe('/notes/');
    expect(normalizeAppBasePath('/apps/notes')).toBe('/apps/notes/');
  });
});

// Vitest runs with Vite's default BASE_URL of '/', i.e. a root deployment —
// these pin down the invariants every URL in the app is built on.
describe('appBasePath at the root deployment', () => {
  it('APP_BASE_URL ends in a slash and APP_BASE_PATH does not', () => {
    expect(APP_BASE_URL).toBe('/');
    expect(APP_BASE_PATH).toBe('');
  });

  it('withAppBasePath never doubles slashes', () => {
    expect(withAppBasePath('api')).toBe('/api');
    expect(withAppBasePath('/api')).toBe('/api');
    expect(withAppBasePath('//sw.js')).toBe('/sw.js');
    expect(withAppBasePath('')).toBe('/');
  });

  it('API and socket paths compose as the app expects', () => {
    expect(`${APP_BASE_PATH}/api`).toBe('/api');
    expect(withAppBasePath('socket.io')).toBe('/socket.io');
  });
});
