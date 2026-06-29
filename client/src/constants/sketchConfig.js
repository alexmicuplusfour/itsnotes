export const SKETCH_COLORS = {
  black:  { light: '#111111', dark: '#AAAAAA' },
  red:    { light: '#C62828', dark: '#EF9A9A' },
  orange: { light: '#E65100', dark: '#FFAB91' },
  green:  { light: '#2E7D32', dark: '#A5D6A7' },
  blue:   { light: '#1565C0', dark: '#90CAF9' },
  purple: { light: '#6A1B9A', dark: '#CE93D8' },
  teal:   { light: '#00695C', dark: '#80DEEA' },
};

export const SKETCH_COLOR_IDS = Object.keys(SKETCH_COLORS);

export const SKETCH_SIZES = {
  xs: { pen: 2,  highlighter: 8  },
  s:  { pen: 4,  highlighter: 14 },
  m:  { pen: 7,  highlighter: 22 },
  l:  { pen: 12, highlighter: 32 },
  xl: { pen: 20, highlighter: 44 },
};

export const SKETCH_SIZE_IDS = Object.keys(SKETCH_SIZES);

export const CANVAS_HEIGHT = 500;
export const DEFAULT_COLOR_ID = 'purple';
export const DEFAULT_SIZE_ID = 'm';
export const ERASER_RADIUS = 18;
export const HIGHLIGHTER_OPACITY = 0.35;

export const resolveColor = (colorId, isDark) =>
  (SKETCH_COLORS[colorId] ?? SKETCH_COLORS.black)[isDark ? 'dark' : 'light'];

export const resolveSize = (sizeId, tool) =>
  (SKETCH_SIZES[sizeId] ?? SKETCH_SIZES.m)[tool === 'highlighter' ? 'highlighter' : 'pen'];

export const canvasBg = (isDark) => isDark ? '#1e1e1e' : '#ffffff';
