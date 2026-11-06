// Draws an original, symmetrical inkblot from a seed, so the big screen and both
// phones show the same image.

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blotSvg(seed) {
  const rand = seededRandom(seed);
  const blobs = [];
  const main = 9 + Math.floor(rand() * 7);
  for (let i = 0; i < main; i++) {
    blobs.push(`<circle cx="${(100 + rand() * 62).toFixed(1)}" cy="${(22 + rand() * 156).toFixed(1)}" r="${(7 + rand() * 21).toFixed(1)}"/>`);
  }
  for (let i = 0; i < 14; i++) {
    blobs.push(`<circle cx="${(104 + rand() * 80).toFixed(1)}" cy="${(10 + rand() * 180).toFixed(1)}" r="${(0.8 + rand() * 3.2).toFixed(1)}"/>`);
  }
  const id = `ink${seed}`;
  return `<svg class="blot" viewBox="0 0 200 200" role="img" aria-label="An inkblot">
    <defs>
      <filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="${(0.018 + rand() * 0.016).toFixed(3)}" numOctaves="3" seed="${seed % 1000}"/>
        <feDisplacementMap in="SourceGraphic" scale="${(26 + rand() * 18).toFixed(0)}"/>
        <feGaussianBlur stdDeviation="2.2"/>
        <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/>
      </filter>
    </defs>
    <g id="${id}-half" filter="url(#${id})" fill="#1c0d15">${blobs.join('')}</g>
    <use href="#${id}-half" transform="translate(200 0) scale(-1 1)"/>
  </svg>`;
}
