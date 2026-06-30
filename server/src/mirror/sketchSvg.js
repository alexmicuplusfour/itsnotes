'use strict';

const { getStroke } = require('perfect-freehand');

// Renders a sketch's stored vector strokes into a single self-adapting SVG for the
// Markdown mirror. The drawing geometry is reproduced exactly (perfect-freehand is
// deterministic for the same points + options), but the colors are driven by CSS
// variables with a `prefers-color-scheme` override, so ONE file carries both the
// light and dark palettes and switches to match the viewer (e.g. Obsidian's theme).
// Viewers that ignore the embedded <style> (e.g. GitHub) fall back to the light
// defaults. Pure: no DB, no canvas, no I/O.
//
// The palette/sizing here is a deliberate copy of the client's sketchConfig — keep
// them in sync if the drawing colors or stroke sizes change there.

const SKETCH_COLORS = {
  black:  { light: '#111111', dark: '#AAAAAA' },
  red:    { light: '#C62828', dark: '#EF9A9A' },
  orange: { light: '#E65100', dark: '#FFAB91' },
  green:  { light: '#2E7D32', dark: '#A5D6A7' },
  blue:   { light: '#1565C0', dark: '#90CAF9' },
  purple: { light: '#6A1B9A', dark: '#CE93D8' },
  teal:   { light: '#00695C', dark: '#80DEEA' },
};

const SKETCH_SIZES = {
  xs: { pen: 2,  highlighter: 8  },
  s:  { pen: 4,  highlighter: 14 },
  m:  { pen: 7,  highlighter: 22 },
  l:  { pen: 12, highlighter: 32 },
  xl: { pen: 20, highlighter: 44 },
};

const HIGHLIGHTER_OPACITY = 0.35;
const CANVAS_BG = { light: '#ffffff', dark: '#1e1e1e' };

const resolveSize = (sizeId, tool) =>
  (SKETCH_SIZES[sizeId] || SKETCH_SIZES.m)[tool === 'highlighter' ? 'highlighter' : 'pen'];

const PEN_OPTS = (size) => ({ size, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true });
const HL_OPTS  = (size) => ({ size, thinning: 0,   smoothing: 0.5, streamline: 0.3, simulatePressure: false });

const r = (n) => Math.round(n * 10) / 10;

// Same quadratic-smoothed outline path the client builds from a getStroke outline.
function toSvgPath(pts) {
  if (!pts.length) return '';
  return pts.reduce((d, [x, y], i, a) => {
    const [nx, ny] = a[(i + 1) % a.length];
    return d + (i === 0 ? `M ${r(x)} ${r(y)} ` : '') + `Q ${r(x)} ${r(y)} ${r((x + nx) / 2)} ${r((y + ny) / 2)} `;
  }, '') + 'Z';
}

function strokePath(stroke) {
  const size = resolveSize(stroke.sizeId, stroke.tool);
  const opts = stroke.tool === 'highlighter' ? HL_OPTS(size) : PEN_OPTS(size);
  const outline = getStroke(stroke.points || [], opts);
  if (!outline.length) return '';
  const colorId = SKETCH_COLORS[stroke.colorId] ? stroke.colorId : 'black';
  const op = stroke.tool === 'highlighter' ? ` opacity="${HIGHLIGHTER_OPACITY}"` : '';
  return `<path class="c-${colorId}"${op} d="${toSvgPath(outline)}"/>`;
}

function styleBlock() {
  const vars = (theme) =>
    `--bg:${CANVAS_BG[theme]};` +
    Object.entries(SKETCH_COLORS).map(([id, c]) => `--c-${id}:${c[theme]};`).join('');
  const classes =
    '.bg{fill:var(--bg)}' +
    Object.keys(SKETCH_COLORS).map((id) => `.c-${id}{fill:var(--c-${id})}`).join('');
  return `:root{${vars('light')}}@media(prefers-color-scheme:dark){:root{${vars('dark')}}}${classes}`;
}

// Render the whole W×H canvas (matching what the note shows), highlighters first so
// they sit under the pen strokes, exactly like the on-canvas render order. `version`
// (the sketch's updated_at epoch ms) is stamped as data-v so the mirror can tell a
// stale file from a current one by comparing DB value to DB value — no timestamp/
// timezone skew, and unchanged sketches are left untouched (no editor churn).
function renderSketchSvg(strokes, width, height, version = 0) {
  const W = Math.max(1, Math.round(width) || 800);
  const H = Math.max(1, Math.round(height) || 500);
  const v = Number(version) || 0;
  const safe = Array.isArray(strokes) ? strokes : [];
  const ordered = [
    ...safe.filter((s) => s.tool === 'highlighter'),
    ...safe.filter((s) => s.tool !== 'highlighter'),
  ];
  const paths = ordered.map(strokePath).filter(Boolean).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" data-v="${v}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<style>${styleBlock()}</style>` +
    `<rect class="bg" x="0" y="0" width="${W}" height="${H}"/>` +
    paths +
    `</svg>\n`
  );
}

module.exports = { renderSketchSvg };
