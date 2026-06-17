import { generateMeshGradient } from 'meshgrad';

// Number of color stops in the generated mesh.
const STOP_COUNT = 7;

// meshgrad emits hsl(h, 100%, L%) with L roughly 30–74% — bright pastels that
// look great washed over a light page. On a dark page those same colors read as
// neon, so for dark theme we knock the lightness down and mute the saturation to
// get a deep, jewel-toned glow instead.
const DARK_LIGHTNESS_SCALE = 0.42;
const DARK_SATURATION = 55;

const HSL_RE = /hsl\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/g;

const darkenHsl = (cssImage) =>
  cssImage.replace(HSL_RE, (_, h, _s, l) => {
    const newL = Math.max(0, Math.min(100, parseFloat(l) * DARK_LIGHTNESS_SCALE));
    return `hsl(${h}, ${DARK_SATURATION}%, ${newL.toFixed(1)}%)`;
  });

// Generate a fresh mesh and return just the radial-gradient stack (the
// `background-image` value). We deliberately drop meshgrad's solid
// `background-color` so the gradient layers over the real page background
// instead of repainting it.
export const generateBackground = () => {
  const css = generateMeshGradient(STOP_COUNT);
  const match = css.match(/background-image:\s*([\s\S]*)$/i);
  return match ? match[1].trim() : '';
};

// Re-light a previously generated mesh for the current theme so toggling
// dark/light keeps the same shape, just tuned for the background.
export const adaptBackgroundForTheme = (bgImage, isDark) =>
  isDark ? darkenHsl(bgImage) : bgImage;
