'use strict';

const { renderSketchSvg } = require('./sketchSvg');

const penStroke = (over = {}) => ({
  tool: 'pen', colorId: 'purple', sizeId: 'm',
  points: [[10, 10, 0.5], [40, 40, 0.5], [70, 20, 0.5]],
  ...over,
});

describe('renderSketchSvg', () => {
  test('produces a sized SVG with the canvas viewBox and a background rect', () => {
    const svg = renderSketchSvg([penStroke()], 800, 500);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 800 500"');
    expect(svg).toContain('<rect class="bg"');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  test('carries both palettes via a prefers-color-scheme media query', () => {
    const svg = renderSketchSvg([penStroke()], 400, 300);
    // light defaults present...
    expect(svg).toContain('--c-purple:#6A1B9A');
    // ...and a dark override.
    expect(svg).toContain('@media(prefers-color-scheme:dark)');
    expect(svg).toContain('--c-purple:#CE93D8');
    // Colors are class-driven (theme-switchable), not baked onto the path.
    expect(svg).toContain('class="c-purple"');
  });

  test('renders one path per drawn stroke, highlighters before pens', () => {
    const svg = renderSketchSvg(
      [penStroke({ colorId: 'black' }), penStroke({ tool: 'highlighter', colorId: 'green' })],
      400, 300,
    );
    const paths = svg.match(/<path /g) || [];
    expect(paths).toHaveLength(2);
    // Highlighter (drawn first / underneath) carries opacity; the green class comes
    // before the black pen class in document order.
    expect(svg.indexOf('class="c-green"')).toBeLessThan(svg.indexOf('class="c-black"'));
    expect(svg).toContain('opacity="0.35"');
  });

  test('an empty sketch is just the background, no paths', () => {
    const svg = renderSketchSvg([], 400, 300);
    expect(svg).toContain('<rect class="bg"');
    expect(svg).not.toContain('<path');
  });

  test('stamps the given version as data-v for staleness checks', () => {
    expect(renderSketchSvg([penStroke()], 400, 300, 1719312000000)).toContain('data-v="1719312000000"');
    expect(renderSketchSvg([penStroke()], 400, 300)).toContain('data-v="0"');
  });
});
