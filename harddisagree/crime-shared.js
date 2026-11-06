// Things both the big screen and the phones draw: body maps and sketches.

const CrimeArt = {
  // A plain figure, front and back. Pins are stored as 0-1 fractions of this picture.
  body(pins = '') {
    const figure = (x) => `<g transform="translate(${x} 0)">
      <circle cx="50" cy="19" r="14"/>
      <path d="M50 35c-14 0-27 4-29 14l-9 44c-1 6 8 8 10 2l9-34 2 33-5 76c-1 8 12 9 13 1l8-68h2l8 68c1 8 14 7 13-1l-5-76 2-33 9 34c2 6 11 4 10-2l-9-44c-2-10-15-14-29-14z"/>
    </g>`;
    return `<svg class="body-map" viewBox="0 0 220 190" role="img" aria-label="Body map, front and back">
      <g class="body-figure">${figure(5)}${figure(115)}</g>
      <text x="55" y="188">front</text><text x="165" y="188">back</text>
      ${pins}
    </svg>`;
  },

  pin(point, cls, label = '') {
    const [x, y] = [point[0] * 220, point[1] * 190];
    return `<g class="pin-mark ${cls}" transform="translate(${x} ${y})"><circle r="6"/><text y="2.6">${label}</text></g>`;
  },

  // Sketches arrive as strokes of base-36 pairs on a 0-1295 grid.
  paths(d) {
    return String(d || '').split(',').filter(Boolean).map((stroke) => {
      const points = stroke.match(/.{4}/g) || [];
      return points.map((pair, i) => `${i ? 'L' : 'M'}${parseInt(pair.slice(0, 2), 36)} ${parseInt(pair.slice(2), 36)}`).join('');
    });
  },

  sketch(d, cls = '') {
    const paths = CrimeArt.paths(d);
    if (!paths.length) return `<div class="sketch-blank ${cls}">Left the page blank. A bold choice.</div>`;
    const each = Math.min(0.5, 5 / paths.length);
    return `<svg class="sketch ${cls}" viewBox="0 0 1296 972">${paths.map((p, i) => `<path d="${p}" pathLength="1" style="animation-delay:${(i * each).toFixed(2)}s"/>`).join('')}</svg>`;
  },
};
