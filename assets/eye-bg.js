/*
 * ASCII eye background with a club scene around it.
 *
 * Two canvases share one character grid:
 *   - a scene canvas (inserted behind #bg-canvas): slow sweeping beams that come
 *     from behind the eye, haze, and a crowd of ASCII silhouettes the beams light up;
 *   - #bg-canvas: a large feminine eye whose iris follows the pointer and blinks.
 */
(function () {
  'use strict';

  const cv = document.getElementById('bg-canvas');
  if (!cv || !cv.getContext) return;
  cv.setAttribute('aria-hidden', 'true');
  const ctx = cv.getContext('2d');

  // The scene canvas sits directly behind the eye canvas.
  const scv = document.createElement('canvas');
  scv.setAttribute('aria-hidden', 'true');
  scv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  cv.parentNode.insertBefore(scv, cv);
  const sctx = scv.getContext('2d');

  // ── Palette ────────────────────────────────────────────────────────────
  const BASES = [
    [255, 0, 200],   // 0 fuchsia  #FF00C8
    [0, 240, 255],   // 1 cyan     #00F0FF
    [40, 80, 255],   // 2 blue     #2850FF
    [170, 0, 255],   // 3 purple   #AA00FF
    [222, 212, 238], // 4 lids, lashes (soft lavender white)
    [172, 180, 210], // 5 sclera
    [255, 255, 255], // 6 catchlight / glints
    [150, 140, 200], // 7 crowd in shadow (dim indigo)
  ];
  const FU = 0, CY = 1, BL = 2, PU = 3, SK = 4, SC = 5, WH = 6, SH = 7;
  const LV = 48;                           // brightness steps per colour
  const NB = BASES.length * (LV + 1);
  const STYLE = [];
  for (const c of BASES) {
    for (let l = 0; l <= LV; l++) {
      const k = l / LV;
      STYLE.push(`rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`);
    }
  }
  const buckets = Array.from({ length: NB }, () => []);
  const sBuckets = Array.from({ length: NB }, () => []);

  // Character ramps, all drawn from the original background's character set.
  const LIGHT = '.,:;~^';
  const SOFT = '.:;~-+=*';
  const MED = '+=*!?|ijlrtcvxzsunoe';
  const HEAVY = '#%&@$0896BDMNQRWHKXA';
  function pick(v, r) {
    const s = v < 0.3 ? LIGHT : v < 0.62 ? MED : HEAVY;
    return s[(r * s.length) | 0];
  }
  // Glyph that best matches a stroke direction (screen angle, y down).
  function dirGlyph(ang) {
    let d = ang % Math.PI;
    if (d < 0) d += Math.PI;
    d = d * 180 / Math.PI;
    if (d < 20 || d > 160) return '-';
    if (d < 62) return '\\';
    if (d < 118) return '|';
    return '/';
  }
  const CHARSET = [...new Set((LIGHT + SOFT + MED + HEAVY + '-\\|/=#@*+o%!').split(''))].join('');
  const CI = {};
  for (let j = 0; j < CHARSET.length; j++) CI[CHARSET[j]] = j;

  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ── Environment ────────────────────────────────────────────────────────
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqTouch = window.matchMedia('(hover: none), (pointer: coarse)');
  let reduced = mqReduce.matches;
  let touch = mqTouch.matches;

  // ── Layout state ───────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1, FS = 12, LH = 14, cw = 7, cols = 0, rows = 0;
  let a = 300, ex = 0, ey = 0;            // a = half eye width, (ex, ey) = eye centre
  let rnd, rnd2, lashLv, lashCh, touched = [];
  let upLashes = [], lowLashes = [];

  // ── Eye geometry (y relative to ey, in px; u = -1 inner corner … +1 outer corner) ──
  function lidBase(u) { return a * (0.03 - 0.05 * (u + 1)); }   // outer corner lifted
  function top0(u, gy) {
    const q = 1 - u * u;
    if (q <= 0) return lidBase(u);
    return lidBase(u) - a * 0.355 * Math.pow(q, 0.83 + 0.21 * u) * (1 - 0.12 * u) + gy * 0.06 * a * q;
  }
  function bot0(u, gy) {
    const q = 1 - u * u;
    if (q <= 0) return lidBase(u);
    return lidBase(u) + a * 0.27 * Math.pow(q, 0.85 + 0.18 * u) * (1 + 0.1 * u) + gy * 0.025 * a * q;
  }
  function botB(u, gy, b) { return bot0(u, gy) - b * 0.05 * a * Math.max(0, 1 - u * u); }
  function topB(u, gy, b) { const t = top0(u, gy); return t + (botB(u, gy, b) - t) * b; }
  function crease(u, b) {
    const q = 1 - ((u - 0.05) / 1.05) ** 2;
    if (q <= 0) return NaN;
    return lidBase(u) - a * 0.52 * Math.pow(q, 0.7) + b * 0.04 * a;
  }
  function lineTh(u) { return a * (0.008 + 0.014 * ss(-0.5, 0.9, u)); }
  const slopeOf = (f, u) => (f(u + 0.004) - f(u - 0.004)) / (0.008 * a);

  // The region the eye owns (lids, crease, lashes). The scene never draws inside it.
  const ZU0 = -1.06, ZU1 = 1.08;
  function zoneUpper(u) { const c = crease(u, 0); return (c === c ? c : lidBase(u)) - 0.045 * a; }
  function zoneLower(u) { return (Math.abs(u) < 1 ? bot0(u, 1) : lidBase(u)) + 0.1 * a; }

  // Draw grouped by colour to keep state changes low (fillText is the fastest path here).
  function drawBuckets(c2d, bk) {
    c2d.font = `bold ${FS}px monospace`;
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    for (let q = 0; q < NB; q++) {
      const list = bk[q];
      if (!list.length) continue;
      c2d.fillStyle = STYLE[q];
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        const i = e >> 7;
        const c = i % cols, r = (i / cols) | 0;
        c2d.fillText(CHARSET[e & 127], (c + 0.5) * cw, (r + 0.5) * LH);
      }
    }
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = scv.width = Math.round(W * dpr);
    cv.height = scv.height = Math.round(H * dpr);

    a = Math.min(W * 0.41, H * 0.64);
    FS = clamp(Math.round(a / 50), 7, 13);
    LH = Math.round(FS * 1.16);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${FS}px monospace`;
    cw = ctx.measureText('M').width;
    cols = Math.ceil(W / cw);
    rows = Math.ceil(H / LH);
    ex = W / 2 - 0.06 * a;
    ey = H / 2 + 0.12 * a;

    const n = cols * rows;
    rnd = new Float32Array(n);
    rnd2 = new Float32Array(n);
    for (let i = 0; i < n; i++) { rnd[i] = Math.random(); rnd2[i] = Math.random(); }
    lashLv = new Float32Array(n);
    lashCh = new Array(n);
    touched = [];

    // Upper lashes: longer and more swept toward the outer corner.
    upLashes = [];
    const NU = 26;
    for (let i = 0; i < NU; i++) {
      const t = i / (NU - 1);
      const u = -0.62 + 1.62 * Math.pow(t, 0.85) + (Math.random() - 0.5) * 0.015;
      upLashes.push({
        u,
        len: a * (0.035 + 0.1 * ss(-0.6, 0.95, u)) * (0.85 + 0.25 * Math.random()) * (u > 0.96 ? 0.8 : 1),
        tilt: 0.12 + 0.3 * u + 0.35 * Math.pow(Math.max(u, 0), 1.2),
        curl: 0.1 + 0.3 * Math.max(u, 0) + (Math.random() - 0.5) * 0.12,
      });
    }
    // Lower lashes: short, sparse, mostly outer half.
    lowLashes = [];
    const NL = 11;
    for (let i = 0; i < NL; i++) {
      const t = i / (NL - 1);
      const u = 0.05 + 0.9 * t + (Math.random() - 0.5) * 0.03;
      lowLashes.push({
        u,
        len: a * (0.018 + 0.04 * ss(-0.3, 1.0, u)) * (0.7 + 0.5 * Math.random()),
        tilt: 0.25 + 0.6 * Math.max(u, 0),
        curl: -0.2 * u,
      });
    }
    setupScene();
    dirty = true;
  }

  // ── Motion state ───────────────────────────────────────────────────────
  const gaze = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  let pointerIn = false, px = 0, py = 0;
  let jitterX = 0, jitterY = 0, nextJitter = 0;
  let wanderX = 0, wanderY = 0, nextWander = 0;
  let blinkStart = -1, nextBlink = 0, pendingDouble = false, lastBlinkEnd = 0;
  let blinkV = 0;
  let dirty = true, last = 0, lastScene = -1e9;

  function scheduleBlink(now) { nextBlink = now + 2600 + Math.random() * 4200; }
  function startBlink(now) { blinkStart = now; pendingDouble = Math.random() < 0.16; }

  const CLOSE = 95, HOLD = 45, OPEN = 210;
  function blinkAt(now) {
    if (blinkStart < 0) return 0;
    const t = now - blinkStart;
    if (t < CLOSE) { const p = t / CLOSE; return 0.5 - 0.5 * Math.cos(Math.PI * p); }
    if (t < CLOSE + HOLD) return 1;
    if (t < CLOSE + HOLD + OPEN) { const p = (t - CLOSE - HOLD) / OPEN; return (1 - p) ** 3; }
    blinkStart = -1;
    lastBlinkEnd = now;
    if (pendingDouble) { pendingDouble = false; nextBlink = now + 140 + Math.random() * 90; }
    else scheduleBlink(now);
    return 0;
  }

  function updateTarget(now) {
    let tx, ty;
    if (pointerIn && !touch) {
      // Direction from the eyeball to the pointer, with natural saturation.
      const D = a * 1.1;
      const dx = px - ex, dy = py - (ey - 0.05 * a);
      const m = Math.sqrt(dx * dx + dy * dy + D * D);
      tx = clamp((dx / m) * 1.25, -1, 1);
      ty = clamp((dy / m) * 1.25, -1, 1);
      if (now > nextJitter) {                // tiny fixational shifts keep her alive
        jitterX = (Math.random() - 0.5) * 0.05;
        jitterY = (Math.random() - 0.5) * 0.04;
        nextJitter = now + 1300 + Math.random() * 2400;
      }
      tx += jitterX; ty += jitterY;
    } else {
      // Relaxed, mostly centred gaze with occasional soft glances.
      if (now > nextWander) {
        if (Math.random() < 0.6) { wanderX = (Math.random() - 0.5) * 0.06; wanderY = (Math.random() - 0.5) * 0.04; }
        else { wanderX = (Math.random() - 0.5) * 0.45; wanderY = (Math.random() - 0.5) * 0.25; }
        nextWander = now + 2400 + Math.random() * 3200;
      }
      tx = wanderX; ty = wanderY;
    }
    const l = Math.hypot(tx, ty);
    if (l > 1) { tx /= l; ty /= l; }
    // A large jump in where she looks sometimes comes with a blink.
    if (Math.hypot(tx - gaze.tx, ty - gaze.ty) > 0.7 && blinkStart < 0 && nextBlink !== Infinity && now - lastBlinkEnd > 1500 && Math.random() < 0.35) startBlink(now);
    gaze.tx = tx; gaze.ty = ty;
  }

  // ── Eye rendering ──────────────────────────────────────────────────────
  let colU, colTop, colBot, colTopS, colBotS, colCr, colCrS;

  function stampLash(L, rootX, rootY, a0, curlDir, bright) {
    const step = Math.min(cw, LH) * 0.5;
    const n = Math.max(2, Math.ceil(L.len / step));
    let x = rootX, y = rootY;
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const ang = a0 + curlDir * L.curl * t * t;
      const c = (x / cw) | 0, r = (y / LH) | 0;
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        const i = r * cols + c;
        const lv = bright * (1 - 0.6 * t);
        if (lv > lashLv[i]) {
          if (lashLv[i] === 0) touched.push(i);
          lashLv[i] = lv;
          lashCh[i] = dirGlyph(ang);
        }
      }
      x += Math.cos(ang) * step * (L.len / (n * step));
      y += Math.sin(ang) * step * (L.len / (n * step));
    }
  }

  function render() {
    const gx = gaze.x, gy = gaze.y, b = blinkV;
    ctx.clearRect(0, 0, W, H);

    const c0 = Math.max(0, Math.floor((ex - 1.3 * a) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((ex + 1.45 * a) / cw));
    const r0 = Math.max(0, Math.floor((ey - 0.85 * a) / LH));
    const r1 = Math.min(rows - 1, Math.ceil((ey + 0.62 * a) / LH));
    const nc = c1 - c0 + 1;
    if (nc <= 0 || r1 < r0) return;
    if (!colU || colU.length < nc) {
      colU = new Float32Array(nc); colTop = new Float32Array(nc); colBot = new Float32Array(nc);
      colTopS = new Float32Array(nc); colBotS = new Float32Array(nc); colCr = new Float32Array(nc);
      colCrS = new Float32Array(nc);
    }
    const fTop = (u) => topB(u, gy, b), fBot = (u) => botB(u, gy, b), fCr = (u) => crease(u, b);
    for (let k = 0; k < nc; k++) {
      const u = (((c0 + k) + 0.5) * cw - ex) / a;
      colU[k] = u;
      if (Math.abs(u) < 1) {
        colTop[k] = fTop(u); colBot[k] = fBot(u);
        colTopS[k] = slopeOf(fTop, clamp(u, -0.995, 0.995));
        colBotS[k] = slopeOf(fBot, clamp(u, -0.995, 0.995));
      } else { colTop[k] = NaN; colBot[k] = NaN; }
      colCr[k] = fCr(u); colCrS[k] = slopeOf(fCr, u);
    }

    // Iris placement: anchored eye, moving iris.
    const R = 0.35 * a;
    const sx = 1 - 0.1 * Math.abs(gx);            // slight foreshortening toward the sides
    const icx = ex + gx * 0.4 * a - 0.02 * a;
    const icy = ey - 0.05 * a + gy * 0.1 * a;
    const rp = 0.33;                               // pupil radius (fraction of R)

    // Soft luminous glow behind the iris, clipped to the eye opening.
    if (b < 0.98) {
      ctx.save();
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < nc; k++) {
        if (!(Math.abs(colU[k]) < 1)) continue;
        const x = (c0 + k + 0.5) * cw, y = ey + colTop[k];
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      for (let k = nc - 1; k >= 0; k--) {
        if (!(Math.abs(colU[k]) < 1)) continue;
        ctx.lineTo((c0 + k + 0.5) * cw, ey + colBot[k]);
      }
      ctx.closePath();
      ctx.clip();
      const g = ctx.createRadialGradient(icx, icy, R * rp, icx, icy, R * 1.3);
      g.addColorStop(0, 'rgba(170,0,255,0)');
      g.addColorStop(0.08, 'rgba(170,0,255,0.15)');
      g.addColorStop(0.6, 'rgba(40,80,255,0.08)');
      g.addColorStop(1, 'rgba(40,80,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(icx - R * 1.4, icy - R * 1.4, R * 2.8, R * 2.8);
      ctx.restore();
    }

    // Lashes move with the lid: their roots ride the lid line and they swing down as it closes.
    for (let j = 0; j < touched.length; j++) lashLv[touched[j]] = 0;
    touched.length = 0;
    for (const L of upLashes) {
      const u = clamp(L.u, -0.99, 0.99);
      const rootX = ex + L.u * a;
      const rootY = ey + fTop(u) - lineTh(u) * 1.2;
      const aRest = -Math.PI / 2 + L.tilt;        // fan out from vertical toward the outer corner
      const aClosed = -aRest * 0.75;              // mirrored downward when shut
      const a0 = aRest + (aClosed - aRest) * b;
      const curlDir = 1 - 2 * b;                  // curl flips as the lash swings
      stampLash(L, rootX, rootY, a0, curlDir, 0.45 + 0.35 * ss(-0.3, 0.9, L.u));
    }
    for (const L of lowLashes) {
      const u = clamp(L.u, -0.99, 0.99);
      const rootX = ex + L.u * a;
      const rootY = ey + fBot(u) + LH * 0.6;
      const a0 = Math.PI / 2 - L.tilt;           // downward, swept outward
      stampLash(L, rootX, rootY, a0, 1, 0.38);
    }

    for (let q = 0; q < NB; q++) buckets[q].length = 0;
    const chars = lashCh;
    const add = (base, v, ch, i) => {
      const l = Math.round(clamp(v, 0, 1) * LV);
      if (l <= 0) return;
      buckets[base * (LV + 1) + l].push(i * 128 + CI[ch]);
    };

    const wingX0 = ex + 0.86 * a, wingY0 = ey + top0(0.86, 0);
    const wingAng = -0.42, wingLen = 0.3 * a;
    const wdx = Math.cos(wingAng), wdy = Math.sin(wingAng);

    for (let r = r0; r <= r1; r++) {
      const yC = (r + 0.5) * LH;
      const dy = yC - ey;
      for (let k = 0; k < nc; k++) {
        const c = c0 + k;
        const i = r * cols + c;
        const xC = (c + 0.5) * cw;
        const u = colU[k];
        const rv = rnd[i];

        const inEye = Math.abs(u) < 1;
        const topY = colTop[k], botY = colBot[k];

        // Upper lid line (with liner): band sits just above the opening.
        if (inEye) {
          const s = colTopS[k];
          const cos2 = 1 / (1 + s * s);
          const minHalf = 0.55 * (LH * cos2 + cw * (1 - cos2));
          const th = lineTh(u);
          const half = Math.max(th, minHalf);
          const d = (dy - (topY - th * 0.6)) * Math.sqrt(cos2);
          if (Math.abs(d) < half) {
            const fade = ss(-1.0, -0.9, u);
            const heavy = th > minHalf * 1.1 && Math.abs(d) < th * 0.6;
            const ang = Math.atan(s);
            const hz = Math.abs(ang) < 0.35;
            const ch = hz ? (heavy || Math.abs(d) < half * 0.5 ? '=' : '-') : dirGlyph(ang);
            add(SK, (0.72 + 0.26 * ss(-0.6, 1, u)) * fade + 0.05, heavy && rv > 0.7 ? '#' : ch, i);
            continue;
          }
        }
        if (lashLv[i] > 0) { add(SK, lashLv[i], chars[i], i); continue; }

        // Winged liner flick past the outer corner.
        {
          const qx = xC - wingX0, qy = yC - wingY0;
          const t = qx * wdx + qy * wdy;
          if (t > 0 && t < wingLen) {
            const perp = Math.abs(qx * -wdy + qy * wdx);
            const th = lineTh(0.86) * 0.55 * (1 - t / wingLen) + 0.5;
            const minHalf = 0.5 * (LH * 0.85 + cw * 0.15);
            if (perp < Math.max(th, minHalf * (1 - 0.45 * t / wingLen))) {
              add(SK, 0.78 - 0.35 * (t / wingLen), dirGlyph(wingAng), i);
              continue;
            }
          }
        }
        // Lower lid line.
        if (inEye) {
          const s = colBotS[k];
          const cos2 = 1 / (1 + s * s);
          const minHalf = 0.5 * (LH * cos2 + cw * (1 - cos2));
          const d = (dy - (botY + LH * 0.25)) * Math.sqrt(cos2);
          if (Math.abs(d) < minHalf && botY - topY > LH * 0.4) {
            const ang = Math.atan(s);
            const inner = u < -0.75;
            add(inner ? FU : SK, inner ? 0.3 : 0.26 + 0.12 * ss(-0.5, 0.8, u), Math.abs(ang) < 0.35 ? '-' : dirGlyph(ang), i);
            continue;
          }
        }

        // Inside the opening: catchlight, iris, pupil, sclera, inner corner.
        if (inEye && dy > topY && dy < botY) {
          // Catchlights sit on the cornea, over the iris and pupil.
          const c1x = (xC - (icx - 0.36 * R)) / (0.15 * R * sx), c1y = (yC - (icy - 0.4 * R)) / (0.11 * R);
          const d1 = c1x * c1x + c1y * c1y;
          if (d1 < 1) { add(WH, 1 - 0.45 * d1, d1 < 0.35 ? '@' : d1 < 0.7 ? '*' : '+', i); continue; }
          const c2x = (xC - (icx + 0.3 * R)) / (0.06 * R * sx), c2y = (yC - (icy + 0.33 * R)) / (0.05 * R);
          const d2 = c2x * c2x + c2y * c2y;
          if (d2 < 1) { add(WH, 0.55, '+', i); continue; }

          const lidShade = 0.4 + 0.6 * ss(0, 0.09 * a, dy - topY);
          const lowShade = 0.7 + 0.3 * ss(0, 0.035 * a, botY - dy);
          const lx = (xC - icx) / (R * sx), ly = (yC - icy) / R;
          const rr = lx * lx + ly * ly;

          if (rr < 1) {
            const rad = Math.sqrt(rr);
            if (rad < rp) continue;                // pupil: true black
            const th = Math.atan2(ly, lx);
            const grain = hash(Math.floor(th * 40), Math.floor(rad * 16)) - 0.5;
            let fiber = 0.5 + 0.5 * (0.5 * Math.sin(th * 29 + 2.2 * Math.sin(th * 7) + rad * 3)
                                   + 0.3 * Math.sin(th * 53 - rad * 7 + 1.7)
                                   + 0.2 * Math.sin(th * 97 + rad * 11));
            fiber = clamp(fiber + grain * 0.3, 0, 1);
            const cr = rp + 0.17 + 0.035 * Math.sin(th * 11 + 0.6 * Math.sin(th * 3));
            let col, v;
            if (rad < cr - 0.03) {                 // pupillary zone: fuchsia / purple
              col = fiber > 0.45 ? FU : PU;
              v = 0.7 + 0.3 * fiber;
              if (rad < rp + 0.05) v *= 0.5;       // dark rim defines the pupil
            } else if (rad < cr + 0.03) {          // collarette ring
              col = FU;
              v = 0.85 + 0.15 * fiber;
            } else {                               // ciliary zone: cyan / blue / purple streaks
              const band = 0.5 + 0.5 * Math.sin(th * 5 + 1.3 + Math.sin(th * 2));
              if (fiber > 0.6) { col = CY; v = 0.7 + 0.3 * fiber; }
              else if (fiber > 0.4) { col = band > 0.5 ? BL : PU; v = 0.8 + 0.2 * fiber; }
              else { col = band > 0.55 ? PU : BL; v = 0.5 + 0.5 * fiber; }
              const t = (rad - cr) / (1 - cr);
              if (grain > 0.46 && t < 0.7) { col = FU; v = 0.9; }
              if (rad > 0.86) { col = band > 0.5 ? PU : BL; v *= 1 - 0.72 * ss(0.86, 1, rad); }
            }
            v *= 0.9 + 0.22 * (-0.5 * lx - 0.6 * ly) + 0.14 * Math.max(ly, 0);
            v *= lidShade * lowShade;
            const ch = (fiber > 0.52 || rad > 0.9) && rad > rp + 0.05 ? dirGlyph(th) : pick(v, rnd2[i]);
            add(col, v, ch, i);
            continue;
          }

          if (u < -0.93) {                         // inner corner (caruncle)
            add(FU, 0.2 * ss(-1, -0.95, u) + 0.05, rnd2[i] < 0.5 ? 'o' : '%', i);
            continue;
          }
          // Sclera: quiet, shaded toward lids and corners so the eyeball feels round.
          {
            let v = 0.34 * (1 - 0.55 * u * u) * lidShade * lowShade;
            if (rr < 1.5) v *= 0.6 + 0.4 * ss(1, 1.5, rr);
            add(SC, v, SOFT[(rnd2[i] * (v > 0.22 ? 8 : 5)) | 0], i);
          }
          continue;
        }

        // Crease of the upper lid.
        const crY = colCr[k];
        if (crY === crY) {
          const s = colCrS[k];
          const cos2 = 1 / (1 + s * s);
          const minHalf = 0.45 * (LH * cos2 + cw * (1 - cos2));
          const d = (dy - crY) * Math.sqrt(cos2);
          if (Math.abs(d) < minHalf) {
            const fade = ss(-0.8, -0.35, u) * (1 - ss(0.55, 0.95, u));
            if (fade > 0.05) { add(SK, 0.1 * fade, Math.abs(s) < 0.35 ? '-' : dirGlyph(Math.atan(s)), i); continue; }
          }
          // Lid skin between crease and lash line (it also covers the eye during a blink).
          if (inEye && dy > crY + minHalf && dy < topY) {
            // Sparse at rest; fills in as the lid stretches down over the eye.
            const cover = clamp((dy - top0(u, gy)) / Math.max(1, topY - top0(u, gy) + 1), 0, 1);
            if (rv < 0.12 + 0.5 * cover * b) {
              const mid = (dy - crY) / Math.max(1, topY - crY);
              const v = (0.06 + 0.05 * Math.sin(Math.PI * clamp(mid, 0, 1)) + 0.1 * cover * b) * ss(-1, -0.85, u);
              add(SK, v, SOFT[(rnd2[i] * 6) | 0], i);
            }
            continue;
          }
        }

        // Lower lid skin.
        if (inEye && dy > botY && dy < botY + 0.08 * a) {
          if (rv < 0.14) add(SK, 0.06 * (1 - (dy - botY) / (0.08 * a)), pick(0.1, rnd2[i]), i);
          continue;
        }
      }
    }

    drawBuckets(ctx, buckets);
  }

  // ── Club scene ─────────────────────────────────────────────────────────
  // Beams sweep out from behind the eye; the crowd stands on a floor whose horizon
  // runs just under the iris, so everyone's chest sits near eye level.
  let mask, cellAng, cellDist, occ, occList = [];
  let OX = 0, OY = 0, eyePath = null;
  let figures = [];

  const BEAMS = [
    { col: FU, c: 1.95, amp: 0.55, per: 19, ph: 0.0, w: 0.11, k: 1.0 },   // sweeps the lower left
    { col: CY, c: 1.1,  amp: 0.6,  per: 26, ph: 2.1, w: 0.09, k: 0.9 },   // sweeps the lower right
    { col: PU, c: 3.75, amp: 0.35, per: 31, ph: 4.0, w: 0.14, k: 0.85 },  // up and to the left
    { col: BL, c: 5.6,  amp: 0.35, per: 34, ph: 1.0, w: 0.14, k: 0.85 },  // up and to the right
    { col: FU, c: 0.3,  amp: 0.42, per: 41, ph: 3.3, w: 0.08, k: 0.7 },   // slow pass along the right
  ];
  const beamNow = BEAMS.map(() => ({ ang: 0, k: 0 }));

  function setupScene() {
    const n = cols * rows;
    mask = new Float32Array(n);
    cellAng = new Float32Array(n);
    cellDist = new Float32Array(n);
    occ = new Uint8Array(n);
    occList = [];
    OX = ex; OY = ey - 0.05 * a;                 // beams come from behind the iris
    const F = LH * 0.8;
    for (let r = 0; r < rows; r++) {
      const yC = (r + 0.5) * LH, dy = yC - ey;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, xC = (c + 0.5) * cw;
        const u = (xC - ex) / a;
        let m = 0;
        if (u > ZU0 - 0.05 && u < ZU1 + 0.05) {
          const uc = clamp(u, ZU0, ZU1);
          const d = Math.min(dy - zoneUpper(uc), zoneLower(uc) - dy, (u < 0 ? u - ZU0 : ZU1 - u) * a);
          m = ss(-F, F, d);
        }
        mask[i] = m;
        cellAng[i] = Math.atan2(yC - OY, xC - OX);
        cellDist[i] = Math.hypot(xC - OX, yC - OY);
      }
    }
    eyePath = new Path2D();
    const steps = 80;
    for (let s = 0; s <= steps; s++) {
      const u = ZU0 + (ZU1 - ZU0) * s / steps;
      const x = ex + u * a, y = ey + zoneUpper(u);
      if (s === 0) eyePath.moveTo(x, y); else eyePath.lineTo(x, y);
    }
    for (let s = steps; s >= 0; s--) {
      const u = ZU0 + (ZU1 - ZU0) * s / steps;
      eyePath.lineTo(ex + u * a, ey + zoneLower(u));
    }
    eyePath.closePath();
    buildCrowd();
  }

  const maskAt = (x, y) => {
    const c = (x / cw) | 0, r = (y / LH) | 0;
    if (c < 0 || r < 0 || c >= cols || r >= rows) return 0;
    return mask[r * cols + c];
  };

  function buildCrowd() {
    figures = [];
    const yh = ey + 0.12 * a;                        // horizon: chests line up here
    // Everyone stands well back in the room: small, distant figures.
    // On tall (portrait) screens the small crowd also fills the open floor below the eye.
    const yNear = yh + Math.max(LH * 6, Math.min(H - yh, 0.55 * a), (H - yh) * 0.85);
    const hMaxNear = Math.min(Math.max(0.48 * a, 0.26 * W), H * 0.4);
    const k = Math.min(1.82, hMaxNear / Math.max(1, yNear - yh));
    const hMin = Math.max(0.15 * a, LH * 5);
    const target = clamp(Math.round((W * H) / 48000), 8, 30);
    const placed = [];
    const rand = Math.random;
    const R = (lo, hi) => lo + (hi - lo) * rand();

    const mkFig = (x, feet, h, face, type, extra) => {
      const f = Object.assign({
        x, feet, h, face, type,
        z: clamp((feet - yh) / (yNear - yh), 0, 1),
        ph: R(0, 6.283), tempo: R(0.42, 0.6) * 6.283, slow: R(0.12, 0.22) * 6.283,
        sw: R(0.85, 1.0), hw: R(0.85, 1.0),
        skirt: rand() < 0.3,
        modeA: (rand() * 4) | 0, modeB: (rand() * 4) | 0, modeRate: R(0.05, 0.1),
        drink: 0, partner: 0,
        caps: new Float32Array(5 * 20), nCaps: 0, drinkCap: -1,
      }, extra || {});
      figures.push(f);
      return f;
    };

    let guard = 0;
    while (figures.length < target && guard++ < 400) {
      const z = Math.pow(rand(), 0.75);
      const feet = yh + (yNear - yh) * (0.07 + 0.93 * z);
      const h = Math.max(hMin, k * (feet - yh));
      const x = R(-0.04 * W, 1.04 * W);
      // People hidden behind the eye are skipped; the crowd gathers at the sides and below.
      if (maskAt(x, feet - 0.62 * h) > 0.3 || maskAt(x, feet - 0.9 * h) > 0.3) continue;
      if (placed.some(p => Math.abs(p.x - x) < 0.32 * (p.h + h) && Math.abs(p.feet - feet) < 0.18 * (p.h + h))) continue;
      const roll = rand();
      const members = [];
      if (roll < 0.34) {
        members.push(mkFig(x, feet, h, rand() < 0.5 ? 1 : -1, 'dance'));
      } else if (roll < 0.54) {
        const g = R(0.13, 0.17) * h;
        const ph = R(0, 6.283), tempo = R(0.42, 0.55) * 6.283;
        members.push(mkFig(x - g, feet, h * R(0.97, 1.03), 1, 'couple', { ph, tempo, partner: 1 }));
        members.push(mkFig(x + g, feet + R(-0.01, 0.01) * h, h * R(0.92, 1.0), -1, 'couple', { ph: ph + 0.3, tempo, partner: -1 }));
      } else if (roll < 0.84) {
        const nMem = rand() < 0.5 ? 2 : 3;
        const gap = R(0.27, 0.34) * h;
        for (let m = 0; m < nMem; m++) {
          const off = (m - (nMem - 1) / 2) * gap;
          const face = nMem === 3 && m === 1 ? (rand() < 0.5 ? 1 : -1) : (off < 0 ? 1 : -1);
          members.push(mkFig(x + off, feet + R(-0.03, 0.03) * h, h * R(0.92, 1.04), face, 'social',
            { drink: rand() < 0.6 ? (rand() < 0.5 ? 1 : -1) : 0 }));
        }
      } else {
        members.push(mkFig(x, feet, h, rand() < 0.5 ? 1 : -1, 'lean'));
      }
      placed.push({ x, feet, h: h * (members.length > 1 ? 1.4 : 1) });
    }
    // Draw nearest first so they occlude the people (and haze) behind them.
    figures.sort((p, q) => q.feet - p.feet);
  }

  // Two-bone IK: knee position for a planted foot.
  function knee(hx, hy, fx, fy, l1, l2, bend, out) {
    let dx = fx - hx, dy = fy - hy;
    let d = Math.hypot(dx, dy) || 1e-4;
    const dm = Math.min(d, l1 + l2 - 1e-4);
    const ang = Math.atan2(dy, dx) + bend * Math.acos(clamp((l1 * l1 + dm * dm - l2 * l2) / (2 * l1 * dm), -1, 1));
    out[0] = hx + Math.cos(ang) * l1; out[1] = hy + Math.sin(ang) * l1;
    if (d > l1 + l2) { out[2] = hx + dx / d * (l1 + l2); out[3] = hy + dy / d * (l1 + l2); }
    else { out[2] = fx; out[3] = fy; }
  }

  // Arm angles: phi1 from straight down (positive = away from the body), phi2 elbow (negative = inward/up).
  function danceArms(mode, t, f, side) {
    const w = f.tempo, p = f.ph + (side > 0 ? 0.9 : 0);
    switch (mode) {
      case 0: return [2.55 + 0.22 * Math.sin(w * t + p), -0.45 + 0.3 * Math.sin(w * t + p + 1)];          // hands up
      case 1: return [0.55 + 0.25 * Math.sin(2 * w * t + p), -1.6 + 0.35 * Math.sin(2 * w * t + p + 0.5)]; // grooving at the chest
      case 2: return side > 0 ? [2.2 + 0.35 * Math.sin(w * t + p), -0.3] : [0.45 + 0.2 * Math.sin(2 * w * t + p), -1.4];
      default: return [0.35 + 0.18 * Math.sin(w * t + p), -0.55 + 0.2 * Math.sin(w * t + p + 2)];         // loose
    }
  }

  const tmp = new Float32Array(4);
  function poseAndCaps(f, t) {
    // Body motion parameters (units of figure height, y up is negative).
    let sway = 0, bob = 0, lean = 0, headTilt = 0, hipTilt = 0;
    let aL, aR;                                       // [phi1, phi2] for screen-left / screen-right arm
    const w = f.tempo, p = f.ph;
    if (f.type === 'dance' || f.type === 'couple') {
      sway = 0.035 * Math.sin(w * t + p);
      bob = 0.018 * (0.5 - 0.5 * Math.cos(2 * w * t + p));
      lean = 0.07 * Math.sin(w * t + p + 0.6) + (f.type === 'couple' ? 0.09 * f.face : 0);
      hipTilt = 0.12 * Math.sin(w * t + p);
      headTilt = 0.16 * Math.sin(w * t + p + 1.2);
      if (f.type === 'couple') {
        const reach = [1.25 + 0.1 * Math.sin(w * t + p), -0.25];
        const free = danceArms(1, t, f, 1);
        if (f.face > 0) { aR = reach; aL = free; } else { aL = reach; aR = free; }
      } else {
        const mix = ss(0.25, 0.75, 0.5 + 0.5 * Math.sin(t * f.modeRate * 6.283 + p));
        const A1 = danceArms(f.modeA, t, f, -1), B1 = danceArms(f.modeB, t, f, -1);
        const A2 = danceArms(f.modeA, t, f, 1), B2 = danceArms(f.modeB, t, f, 1);
        aL = [A1[0] + (B1[0] - A1[0]) * mix, A1[1] + (B1[1] - A1[1]) * mix];
        aR = [A2[0] + (B2[0] - A2[0]) * mix, A2[1] + (B2[1] - A2[1]) * mix];
      }
    } else if (f.type === 'social') {
      const s = f.slow;
      sway = 0.015 * Math.sin(s * t + p);
      lean = 0.07 * f.face + 0.03 * Math.sin(s * 0.7 * t + p);
      hipTilt = 0.08 * Math.sin(s * t + p);
      const talk = ss(0.55, 0.9, Math.sin(0.33 * t + p));
      headTilt = 0.1 * f.face + 0.06 * Math.sin(1.7 * t + p) * (0.4 + talk);
      const sip = ss(0.9, 0.99, Math.sin(0.19 * t + p * 1.7));
      const drinkArm = [0.15 + 0.7 * sip, -2.3 - 0.35 * sip];
      const gest = [0.22 + 0.4 * talk, -0.7 - 0.9 * talk + 0.3 * talk * Math.sin(4.2 * t + p)];
      const rest = [0.12 + 0.04 * Math.sin(s * t), -0.25];
      const towardRight = f.face > 0;
      if (f.drink) {
        // The drink stays in the hand away from the conversation; the other hand talks.
        if (towardRight) { aL = drinkArm; aR = gest; } else { aR = drinkArm; aL = gest; }
      } else if (towardRight) { aR = gest; aL = rest; } else { aL = gest; aR = rest; }
    } else {                                           // leaning, arms folded
      sway = 0.008 * Math.sin(f.slow * t + p);
      lean = 0.15 * f.face;
      headTilt = 0.08 * Math.sin(0.5 * t + p) - 0.05 * f.face;
      aL = [0.32, -2.15 + 0.05 * Math.sin(0.4 * t)];
      aR = [0.28, -2.2];
    }

    const h = f.h, X = f.x, Y = f.feet;
    const caps = f.caps;
    let n = 0;
    const cap = (ax, ay, bx, by, r) => {
      caps[n * 5] = X + ax * h; caps[n * 5 + 1] = Y + ay * h;
      caps[n * 5 + 2] = X + bx * h; caps[n * 5 + 3] = Y + by * h; caps[n * 5 + 4] = r * h;
      n++;
    };
    const sinL = Math.sin(lean), cosL = Math.cos(lean);
    const up = (bx, by, L) => [bx + sinL * L, by - cosL * L];

    const pelX = sway, pelY = -0.5 + bob;
    const [chX, chY] = up(pelX, pelY, 0.17);
    const [nkX, nkY] = up(pelX, pelY, 0.33);
    const ht = lean + headTilt;
    const hdX = nkX + Math.sin(ht) * 0.085, hdY = nkY - Math.cos(ht) * 0.085;
    const shW = 0.085 * f.sw, hpW = 0.045 * f.hw;
    const shLx = nkX - cosL * shW, shLy = nkY + 0.035 - sinL * shW;
    const shRx = nkX + cosL * shW, shRy = nkY + 0.035 + sinL * shW;
    const ch = Math.cos(hipTilt), sh = Math.sin(hipTilt);
    const hLx = pelX - ch * hpW, hLy = pelY - sh * hpW;
    const hRx = pelX + ch * hpW, hRy = pelY + sh * hpW;

    // Legs with planted feet.
    const footW = 0.075 * (f.type === 'lean' ? 0.6 : 1);
    const liftL = f.type === 'dance' ? 0.03 * Math.max(0, Math.sin(f.tempo * t + p)) : 0;
    const liftR = f.type === 'dance' ? 0.03 * Math.max(0, -Math.sin(f.tempo * t + p)) : 0;
    knee(hLx, hLy, -footW, -liftL, 0.26, 0.25, 1, tmp);
    const kLx = tmp[0], kLy = tmp[1], fLx = tmp[2], fLy = tmp[3];
    knee(hRx, hRy, footW, -liftR, 0.26, 0.25, -1, tmp);
    const kRx = tmp[0], kRy = tmp[1], fRx = tmp[2], fRy = tmp[3];

    // Arms by forward kinematics.
    const arm = (sx0, sy0, ang, side) => {
      const d1x = side * Math.sin(ang[0]), d1y = Math.cos(ang[0]);
      const ex0 = sx0 + d1x * 0.17, ey0 = sy0 + d1y * 0.17;
      const a2 = ang[0] + ang[1];
      return [ex0, ey0, ex0 + side * Math.sin(a2) * 0.16, ey0 + Math.cos(a2) * 0.16];
    };
    const AL = arm(shLx, shLy, aL, -1), AR = arm(shRx, shRy, aR, 1);

    // Body.
    // Slender proportions throughout.
    cap(hdX, hdY, hdX, hdY, 0.052);                       // head
    cap(hdX, hdY, nkX, nkY, 0.018);                       // neck
    cap(nkX, nkY + 0.03, chX, chY, 0.05 * f.sw);          // chest
    cap(chX, chY, pelX, pelY, 0.038);                     // waist
    cap(shLx, shLy, shRx, shRy, 0.024);                   // shoulders
    cap(hLx, hLy, hRx, hRy, 0.036 * f.hw);                // hips
    cap(shLx, shLy, AL[0], AL[1], 0.02); cap(AL[0], AL[1], AL[2], AL[3], 0.016);
    cap(shRx, shRy, AR[0], AR[1], 0.02); cap(AR[0], AR[1], AR[2], AR[3], 0.016);
    cap(hLx, hLy, kLx, kLy, 0.028); cap(kLx, kLy, fLx, fLy, 0.02);
    cap(hRx, hRy, kRx, kRy, 0.028); cap(kRx, kRy, fRx, fRy, 0.02);
    if (f.skirt) {
      cap(pelX, pelY, kLx - 0.015, kLy - 0.04, 0.04);
      cap(pelX, pelY, kRx + 0.015, kRy - 0.04, 0.04);
    }
    f.drinkCap = -1;
    if (f.drink) {
      const hand = f.face > 0 ? AL : AR;          // same side as drinkArm above
      cap(hand[2], hand[3] - 0.01, hand[2], hand[3] - 0.055, 0.012);
      f.drinkCap = n - 1;
    }
    f.nCaps = n;
  }

  function sdf(f, x, y) {
    const c = f.caps;
    let best = 1e9;
    for (let j = 0, o = 0; j < f.nCaps; j++, o += 5) {
      const ax = c[o], ay = c[o + 1], bax = c[o + 2] - ax, bay = c[o + 3] - ay;
      const pax = x - ax, pay = y - ay;
      const L2 = bax * bax + bay * bay;
      let hh = L2 > 0 ? (pax * bax + pay * bay) / L2 : 0;
      hh = hh < 0 ? 0 : hh > 1 ? 1 : hh;
      const dx = pax - bax * hh, dy = pay - bay * hh;
      const d = Math.sqrt(dx * dx + dy * dy) - c[o + 4];
      if (d < best) best = d;
    }
    return best;
  }

  // Light at a cell: strongest beam colour and total intensity.
  let lightCol = 0;
  function lightAt(i) {
    const ang = cellAng[i], dist = cellDist[i];
    const fd = ss(0.45 * a, 0.95 * a, dist) * (1 - 0.5 * ss(1.1 * a, 2.8 * a, dist));
    if (fd <= 0) return 0;
    let sum = 0, best = 0;
    for (let j = 0; j < BEAMS.length; j++) {
      let d = ang - beamNow[j].ang;
      d -= Math.round(d / 6.283185) * 6.283185;
      const x = Math.abs(d) / BEAMS[j].w;
      if (x >= 1) continue;
      const q = 1 - x * x;
      const v = q * q * beamNow[j].k;
      sum += v;
      if (v > best) { best = v; lightCol = BEAMS[j].col; }
    }
    return Math.min(1, sum) * fd;
  }

  function renderScene(t) {
    sctx.clearRect(0, 0, W, H);
    for (let j = 0; j < BEAMS.length; j++) {
      const B = BEAMS[j];
      beamNow[j].ang = B.c + B.amp * Math.sin(6.283185 * t / B.per + B.ph);
      beamNow[j].k = B.k * (0.78 + 0.22 * Math.sin(t * 0.21 + B.ph * 1.3));
    }

    // Soft volumetric wedges: three nested fans give the beams feathered edges.
    const far = Math.hypot(W, H);
    sctx.save();
    sctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < BEAMS.length; j++) {
      const B = BEAMS[j], c = BASES[B.col], ang = beamNow[j].ang, kk = beamNow[j].k;
      for (const [wm, al] of [[1.0, 0.03], [0.7, 0.035], [0.4, 0.035]]) {
        const g = sctx.createRadialGradient(OX, OY, 0.4 * a, OX, OY, far);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        g.addColorStop(0.12, `rgba(${c[0]},${c[1]},${c[2]},${(al * kk).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},${(al * kk * 0.45).toFixed(3)})`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        sctx.fillStyle = g;
        const w = B.w * wm;
        sctx.beginPath();
        sctx.moveTo(OX, OY);
        sctx.lineTo(OX + Math.cos(ang - w) * far, OY + Math.sin(ang - w) * far);
        sctx.lineTo(OX + Math.cos(ang + w) * far, OY + Math.sin(ang + w) * far);
        sctx.closePath();
        sctx.fill();
      }
    }
    // The eye stands in front of the light: cut its zone out with a soft edge.
    sctx.globalCompositeOperation = 'destination-out';
    sctx.filter = `blur(${Math.max(4, LH * 0.6)}px)`;
    sctx.fillStyle = '#000';
    sctx.fill(eyePath);
    sctx.restore();

    for (let q = 0; q < NB; q++) sBuckets[q].length = 0;
    for (let j = 0; j < occList.length; j++) occ[occList[j]] = 0;
    occList.length = 0;
    const add = (base, v, ch, i) => {
      const l = Math.round(clamp(v, 0, 1) * LV);
      if (l <= 0) return;
      sBuckets[base * (LV + 1) + l].push(i * 128 + CI[ch]);
    };

    // Crowd, nearest first.
    const edgeW = Math.max(cw, LH) * 0.55;
    for (const f of figures) {
      poseAndCaps(f, t);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let j = 0, o = 0; j < f.nCaps; j++, o += 5) {
        const r = f.caps[o + 4];
        x0 = Math.min(x0, f.caps[o] - r, f.caps[o + 2] - r); x1 = Math.max(x1, f.caps[o] + r, f.caps[o + 2] + r);
        y0 = Math.min(y0, f.caps[o + 1] - r, f.caps[o + 3] - r); y1 = Math.max(y1, f.caps[o + 1] + r, f.caps[o + 3] + r);
      }
      const ca = Math.max(0, Math.floor(x0 / cw)), cb = Math.min(cols - 1, Math.ceil(x1 / cw));
      const ra = Math.max(0, Math.floor(y0 / LH)), rb = Math.min(rows - 1, Math.ceil(y1 / LH));
      // Distant people are hazier; near people are darker, back-lit shapes.
      const ambient = 0.16 + 0.06 * (1 - f.z);
      for (let r = ra; r <= rb; r++) {
        const yC = (r + 0.5) * LH;
        for (let c = ca; c <= cb; c++) {
          const i = r * cols + c;
          if (occ[i]) continue;
          const m = mask[i];
          if (m > 0.6) continue;
          const xC = (c + 0.5) * cw;
          const d = sdf(f, xC, yC);
          if (d > 0) continue;
          occ[i] = 1; occList.push(i);
          const vis = 1 - m;
          const L = lightAt(i);
          const lc = lightCol;
          if (d > -edgeW) {
            // Edge: outline glyph along the body contour, rim-lit on the side facing the beam source.
            const gx = sdf(f, xC + 1, yC) - sdf(f, xC - 1, yC);
            const gy = sdf(f, xC, yC + 1) - sdf(f, xC, yC - 1);
            const gl = Math.hypot(gx, gy) || 1;
            const facing = -((gx / gl) * (xC - OX) + (gy / gl) * (yC - OY)) / (cellDist[i] || 1);
            const rim = L * Math.max(0, facing + 0.25) / 1.25;
            const ch = isInCap(f, 0, xC, yC) ? 'o' : dirGlyph(Math.atan2(gy, gx) + Math.PI / 2);   // a simple round head
            if (rim > 0.06) add(lc, (0.2 + 0.55 * rim) * vis, ch, i);
            else add(SH, (ambient + 0.08 + 0.2 * L) * vis, ch, i);
          } else if (f.drinkCap >= 0 && L > 0.08 && isInCap(f, f.drinkCap, xC, yC)) {
            add(WH, (0.25 + 0.45 * L) * vis, '!', i);
          } else {
            // Interior: sparse in shadow; light reveals denser texture.
            const rv = rnd[i];
            if (rv < 0.3 + 0.2 * L) {
              const ch = LIGHT[(rnd2[i] * 6) | 0];
              if (L > 0.12) add(lc, (0.08 + 0.18 * L) * vis, ch, i);
              else add(SH, ambient * 0.75 * vis, ch, i);
            }
          }
        }
      }
    }

    // Haze: drifting motes inside the beams, hidden behind people and the eye.
    for (let i = 0, n = cols * rows; i < n; i++) {
      if (occ[i] || mask[i] > 0.55) continue;
      const L = lightAt(i);
      if (L < 0.06) continue;
      const s = (rnd[i] * 7.31 + t * (0.05 + 0.08 * rnd2[i])) % 1;
      if (s < L * 0.5) add(lightCol, L * 0.3 * (1 - mask[i]), LIGHT[(rnd2[i] * 6) | 0], i);
    }

    drawBuckets(sctx, sBuckets);
  }

  function isInCap(f, j, x, y) {
    const c = f.caps, o = j * 5;
    const ax = c[o], ay = c[o + 1], bax = c[o + 2] - ax, bay = c[o + 3] - ay;
    const pax = x - ax, pay = y - ay;
    const L2 = bax * bax + bay * bay;
    const hh = clamp(L2 > 0 ? (pax * bax + pay * bay) / L2 : 0, 0, 1);
    const dx = pax - bax * hh, dy = pay - bay * hh;
    return dx * dx + dy * dy < (c[o + 4] + cw * 0.5) ** 2;
  }

  // ── Loop ───────────────────────────────────────────────────────────────
  const SCENE_STATIC_T = 7.5;                     // a balanced moment for the still version
  function frame(now) {
    if (reduced) return;
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;

    updateTarget(now);
    if (blinkStart < 0 && now >= nextBlink) startBlink(now);
    const nb = blinkAt(now);

    // Slightly underdamped spring: smooth, a little delayed, settles naturally.
    const K = 40, C = 10;
    gaze.vx += (K * (gaze.tx - gaze.x) - C * gaze.vx) * dt;
    gaze.vy += (K * (gaze.ty - gaze.y) - C * gaze.vy) * dt;
    gaze.x += gaze.vx * dt;
    gaze.y += gaze.vy * dt;

    const moving = Math.abs(gaze.vx) + Math.abs(gaze.vy) > 0.0006 ||
                   Math.abs(gaze.tx - gaze.x) + Math.abs(gaze.ty - gaze.y) > 0.0006;
    if (moving || nb !== blinkV || nb > 0 || dirty) {
      blinkV = nb;
      dirty = false;
      render();
    }
    // The scene moves slowly, so ~30 fps is plenty.
    if (now - lastScene >= 32) { lastScene = now; renderScene(now / 1000); }
  }

  function renderStatic() {
    gaze.x = gaze.y = 0;
    blinkV = 0;
    render();
    renderScene(SCENE_STATIC_T);
  }

  // ── Events ─────────────────────────────────────────────────────────────
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointerIn = true; px = e.clientX; py = e.clientY;
  }, { passive: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) pointerIn = false; });
  window.addEventListener('blur', () => { pointerIn = false; });
  window.addEventListener('resize', () => { resize(); if (reduced) renderStatic(); });
  const onMQ = () => {
    const wasReduced = reduced;
    reduced = mqReduce.matches;
    touch = mqTouch.matches;
    if (reduced) renderStatic();
    else if (wasReduced) { last = 0; requestAnimationFrame(frame); }
  };
  (mqReduce.addEventListener ? mqReduce.addEventListener('change', onMQ) : mqReduce.addListener(onMQ));
  (mqTouch.addEventListener ? mqTouch.addEventListener('change', onMQ) : mqTouch.addListener(onMQ));

  resize();
  scheduleBlink(performance.now());
  if (reduced) renderStatic();
  else requestAnimationFrame(frame);
})();
