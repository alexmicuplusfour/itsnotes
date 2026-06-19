'use strict';

const { imageExt, imageResourceName, attachmentResourceName } = require('./resourceNames');

describe('imageExt', () => {
  test('maps known mimes', () => {
    expect(imageExt('image/png')).toBe('png');
    expect(imageExt('image/jpeg')).toBe('jpg');
    expect(imageExt('image/svg+xml')).toBe('svg');
  });
  test('accepts a bare extension', () => {
    expect(imageExt('png')).toBe('png');
    expect(imageExt('.gif')).toBe('gif');
  });
  test('derives subtype for unknown mimes', () => {
    expect(imageExt('image/x-icon')).toBe('x-icon');
  });
  test('defaults to png when missing', () => {
    expect(imageExt(null)).toBe('png');
    expect(imageExt('')).toBe('png');
  });
});

describe('resource basenames', () => {
  test('image resource includes id and extension', () => {
    expect(imageResourceName(1136, 'image/png')).toBe('img-1136.png');
  });
  test('attachment resource is att-<id>-<name>', () => {
    expect(attachmentResourceName(118, 'template.psd')).toBe('att-118-template.psd');
  });
  test('attachment falls back when name missing', () => {
    expect(attachmentResourceName(7, null)).toBe('att-7-attachment-7');
  });
});
