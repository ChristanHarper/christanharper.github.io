/*
 * ASCII eye background with a club scene around it.
 *
 * Two canvases, both drawn only with characters:
 *   - a scene canvas (inserted behind #bg-canvas): moving-head spotlights, haze,
 *     a night sky and a packed dance floor of silhouettes revealed by the light;
 *   - #bg-canvas: a large feminine eye whose iris follows the pointer and blinks.
 *
 * Lighting and motion share one beat clock. Each spotlight holds on a spot while
 * it is lit, goes dark for one beat at the end of its phrase, moves in the dark,
 * and slams back on with a flash on the downbeat. Dancers ease into each key pose
 * so they land on it exactly on the beat.
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
  const sceneBuckets = Array.from({ length: NB }, () => []);

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
  const CHARSET = [...new Set((LIGHT + SOFT + MED + HEAVY + '-\\|/=#@*+o%!XMH').split(''))].join('');
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
  // A fox-eye shape: the outer corner is lifted high, the upper lid runs long and sleek
  // toward it, and the lid sits a little low over the iris for a sultry look.
  function lidBase(u) { return a * (0.045 - 0.08 * (u + 1)); }
  function top0(u, gy) {
    const q = 1 - u * u;
    if (q <= 0) return lidBase(u);
    return lidBase(u) - a * 0.335 * Math.pow(q, 0.8 + 0.25 * u) * (1 - 0.18 * u) + gy * 0.06 * a * q;
  }
  function bot0(u, gy) {
    const q = 1 - u * u;
    if (q <= 0) return lidBase(u);
    return lidBase(u) + a * 0.235 * Math.pow(q, 0.8 + 0.2 * u) * (1 + 0.05 * u) + gy * 0.025 * a * q;
  }
  function botB(u, gy, b) { return bot0(u, gy) - b * 0.05 * a * Math.max(0, 1 - u * u); }
  function topB(u, gy, b) { const t = top0(u, gy); return t + (botB(u, gy, b) - t) * b; }
  function crease(u, b) {
    const q = 1 - ((u - 0.05) / 1.05) ** 2;
    if (q <= 0) return NaN;
    return lidBase(u) - a * 0.5 * Math.pow(q, 0.7) + b * 0.04 * a;
  }
  // Liner thickens toward the outer corner.
  function lineTh(u) { return a * (0.009 + 0.02 * ss(-0.4, 0.92, u)); }
  const slopeOf = (f, u) => (f(u + 0.004) - f(u - 0.004)) / (0.008 * a);

  // Cat-eye liner: from the outer corner a wing extends the lower lash line upward,
  // and the upper liner tapers out to meet its tip, forming a filled triangle.
  const WING_ANG = -0.62, WING_LEN = 0.3, WING_U = 0.87;
  function wingGeom() {
    const P = [ex + a, ey + lidBase(1)];
    const T = [P[0] + Math.cos(WING_ANG) * WING_LEN * a, P[1] + Math.sin(WING_ANG) * WING_LEN * a];
    const U = [ex + WING_U * a, ey + top0(WING_U, 0) - lineTh(WING_U) * 0.6];
    return { P, T, U };
  }
  function segDist(x, y, A, B) {
    const dx = B[0] - A[0], dy = B[1] - A[1], qx = x - A[0], qy = y - A[1];
    const t = clamp((qx * dx + qy * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(qx - t * dx, qy - t * dy);
  }

  // The region the eye owns (lids, crease, lashes, wing). The scene never draws inside it.
  const ZU0 = -1.06, ZU1 = 1.08;
  function zoneUpper(u) { const c = crease(u, 0); return (c === c ? c : lidBase(u)) - 0.045 * a; }
  function zoneLower(u) { return (Math.abs(u) < 1 ? bot0(u, 1) : lidBase(u)) + 0.1 * a; }

  // Draw grouped by colour to keep state changes low (fillText is the fastest path here).
  function drawBuckets(c2d, bk, font, cellW, cellH, nCols) {
    c2d.font = `bold ${font}px monospace`;
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    for (let q = 0; q < NB; q++) {
      const list = bk[q];
      if (!list.length) continue;
      c2d.fillStyle = STYLE[q];
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        const i = e >> 7;
        const c = i % nCols, r = (i / nCols) | 0;
        c2d.fillText(CHARSET[e & 127], (c + 0.5) * cellW, (r + 0.5) * cellH);
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

    // Upper lashes: long, flared and swept toward the lifted outer corner.
    upLashes = [];
    const NU = 24;
    for (let i = 0; i < NU; i++) {
      const t = i / (NU - 1);
      const u = -0.76 + 1.74 * Math.pow(t, 0.88) + (Math.random() - 0.5) * 0.015;
      upLashes.push({
        u,
        len: a * (0.03 + 0.04 * ss(-0.6, 0.5, u) + 0.1 * ss(0.3, 0.95, u))
          * (0.84 + 0.24 * Math.random()) * (u > 0.97 ? 0.85 : 1),
        tilt: 0.08 + 0.5 * u + 0.55 * Math.pow(Math.max(u, 0), 1.3),
        curl: -0.24 - 0.46 * Math.max(u, 0) + (Math.random() - 0.5) * 0.09,
      });
    }
    // Fine companion lashes make loose, wispy fans instead of a picket fence.
    const primary = upLashes.slice();
    for (let j = 3; j < primary.length - 1; j += 4) {
      const L = primary[j];
      upLashes.push({ ...L, u: L.u + 0.018, len: L.len * 0.72, tilt: L.tilt + 0.12, curl: L.curl * 0.82 });
    }
    // Lower lashes: short, sparse, mostly outer half.
    lowLashes = [];
    const NL = 8;
    for (let i = 0; i < NL; i++) {
      const t = i / (NL - 1);
      const u = 0.05 + 0.9 * t + (Math.random() - 0.5) * 0.03;
      lowLashes.push({
        u,
        len: a * (0.012 + 0.028 * ss(-0.3, 1.0, u)) * (0.7 + 0.5 * Math.random()),
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
    if (Math.hypot(tx - gaze.tx, ty - gaze.ty) > 0.7 && blinkStart < 0 && now - lastBlinkEnd > 1500 && Math.random() < 0.35) startBlink(now);
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
        const lv = bright * Math.pow(1 - 0.86 * t, 0.8);
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
    const c1 = Math.min(cols - 1, Math.ceil((ex + 1.5 * a) / cw));
    const r0 = Math.max(0, Math.floor((ey - 0.9 * a) / LH));
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
    const icy = ey - 0.07 * a + gy * 0.1 * a;
    const rp = 0.33;                               // pupil radius (fraction of R)

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
      stampLash(L, rootX, rootY, a0, curlDir, 0.32 + 0.5 * ss(-0.2, 0.95, L.u));
    }
    for (const L of lowLashes) {
      const u = clamp(L.u, -0.99, 0.99);
      const rootX = ex + L.u * a;
      const rootY = ey + fBot(u) + LH * 0.6;
      const a0 = Math.PI / 2 - L.tilt;           // downward, swept outward
      stampLash(L, rootX, rootY, a0, 1, 0.28);
    }

    for (let q = 0; q < NB; q++) buckets[q].length = 0;
    const chars = lashCh;
    const add = (base, v, ch, i) => {
      const l = Math.round(clamp(v, 0, 1) * LV);
      if (l <= 0) return;
      buckets[base * (LV + 1) + l].push(i * 128 + CI[ch]);
    };

    const { P: wP, T: wT, U: wU } = wingGeom();
    const cross = (A, B, x, y) => (B[0] - A[0]) * (y - A[1]) - (B[1] - A[1]) * (x - A[0]);
    const wingTopAng = Math.atan2(wT[1] - wU[1], wT[0] - wU[0]);
    const wingSpan = Math.hypot(wT[0] - wP[0], wT[1] - wP[1]);

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
        // Cat-eye wing: a filled liner triangle, drawn over the lashes.
        if (u > WING_U - 0.05) {
          const s1 = cross(wP, wT, xC, yC), s2 = cross(wT, wU, xC, yC), s3 = cross(wU, wP, xC, yC);
          const dBot = segDist(xC, yC, wP, wT), dTop = segDist(xC, yC, wU, wT);
          const edgeHalf = 0.5 * (LH * 0.8 + cw * 0.2);
          const inside = (s1 <= 0 && s2 <= 0 && s3 <= 0) || (s1 >= 0 && s2 >= 0 && s3 >= 0);
          if (!(inEye && dy > topY) && (inside || dBot < edgeHalf || dTop < edgeHalf * 0.8)) {
            const tip = clamp(Math.hypot(xC - wP[0], yC - wP[1]) / wingSpan, 0, 1);
            const ch = dBot < edgeHalf ? dirGlyph(WING_ANG) : dTop < edgeHalf ? dirGlyph(wingTopAng)
              : (rv > 0.55 ? '#' : '=');
            add(SK, 0.9 - 0.3 * tip, ch, i);
            continue;
          }
          // Smoky outer-V shadow, tucked above the wing.
          const smokeW = 0.12 * a;
          if (s2 * cross(wT, wU, wP[0], wP[1]) < 0 && dTop < smokeW && !(inEye && dy > topY)) {
            const tip = clamp((xC - wU[0]) / (wT[0] - wU[0]), 0, 1);
            const sm = (1 - dTop / smokeW) * (1 - 0.6 * tip);
            if (rv < 0.15 + 0.5 * sm) {
              add(sm > 0.55 ? FU : PU, 0.06 + 0.2 * sm, SOFT[(rnd2[i] * 6) | 0], i);
              continue;
            }
          }
        }
        if (lashLv[i] > 0) { add(SK, lashLv[i], chars[i], i); continue; }

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
          // Eyelid: smoky shadow, deepest at the lash line and the outer corner, fading
          // up toward the crease. It rides the lid, so it also covers the eye in a blink.
          if (inEye && dy > crY + minHalf && dy < topY) {
            const mid = clamp((dy - crY) / Math.max(1, topY - crY), 0, 1);
            const outer = 0.35 + 0.65 * ss(-0.5, 0.95, u);
            const smoke = Math.pow(mid, 1.4) * outer;
            const cover = clamp((dy - top0(u, gy)) / Math.max(1, topY - top0(u, gy) + 1), 0, 1);
            if (rv < 0.1 + 0.55 * smoke + 0.45 * cover * b) {
              const v = (0.06 + 0.27 * smoke + 0.08 * cover * b) * ss(-1, -0.85, u);
              add(smoke > 0.5 ? FU : PU, v, SOFT[(rnd2[i] * 6) | 0], i);
            }
            continue;
          }
        }

        // Lower lid: a soft smudge of shadow under the outer lashes.
        if (inEye && dy > botY && dy < botY + 0.08 * a) {
          const depth = 1 - (dy - botY) / (0.08 * a);
          const sm = ss(0.05, 0.75, u) * depth;
          if (rv < 0.12 + 0.3 * sm) add(sm > 0.15 ? PU : SK, 0.05 + 0.1 * sm, pick(0.1, rnd2[i]), i);
          continue;
        }
      }
    }

    drawBuckets(ctx, buckets, FS, cw, LH, cols);
  }

  // ── Club scene ─────────────────────────────────────────────────────────
  // Everything here is printed as characters on its own, finer grid. Geometry is
  // only used to decide which character goes where; nothing else is painted.
  const BPM = 122;
  const PHRASE = 8;                                // beats each spotlight stays on one spot
  let beatTime = 0;
  let SF, SW, SL, Scols, Srows, sceneMask, sceneNoise, sceneNoise2;
  let lightLevels, lightColors, occupied, floorField, figures = [], targets = [];
  let rays = [];
  // Moving-head fixtures along the top and sides; beams cross the room.
  const ALL_BEAMS = [
    { color: FU, x: 0.06, y: 0.15, width: 0.14 },
    { color: CY, x: 0.94, y: 0.15, width: 0.14 },
    { color: PU, x: 0.25, y: 0.12, width: 0.11 },
    { color: BL, x: 0.75, y: 0.12, width: 0.11 },
    { color: CY, x: -0.03, y: 0.48, width: 0.19 },
    { color: FU, x: 1.03, y: 0.48, width: 0.19 },
    { color: BL, x: 0.39, y: 0.1, width: 0.09 },
    { color: PU, x: 0.61, y: 0.1, width: 0.09 },
  ];
  let BEAMS = ALL_BEAMS;
  let regionOrder = [];

  function reservedAt(x, y) {
    // The winged liner and its smoky outer-V reach past the lid's outer corner.
    const g = wingGeom();
    const wingD = Math.min(segDist(x, y, g.P, g.T), segDist(x, y, g.U, g.T));
    const wing = 1 - ss(0.1 * a, 0.14 * a, wingD);
    const u = (x - ex) / a;
    if (u < ZU0 - 0.02 || u > ZU1 + 0.02) return wing;
    const uc = clamp(u, ZU0, ZU1), dy = y - ey;
    const d = Math.min(dy - zoneUpper(uc), zoneLower(uc) - dy, (u - ZU0) * a, (ZU1 - u) * a);
    return Math.max(wing, ss(-7, 7, d));
  }

  function setupScene() {
    SF = clamp(W / 205, 5.8, 8);
    SW = SF * 0.61; SL = SF * 1.12;
    Scols = Math.ceil(W / SW); Srows = Math.ceil(H / SL);
    const n = Scols * Srows;
    sceneMask = new Float32Array(n); sceneNoise = new Float32Array(n);
    sceneNoise2 = new Float32Array(n); occupied = new Uint8Array(n);
    lightLevels = new Float32Array(n); lightColors = new Uint8Array(n);
    floorField = new Float32Array(n);
    for (let r = 0; r < Srows; r++) for (let c = 0; c < Scols; c++) {
      const i = r * Scols + c, x = (c + 0.5) * SW, y = (r + 0.5) * SL;
      sceneMask[i] = reservedAt(x, y);
      sceneNoise[i] = hash(c + 3, r + 13); sceneNoise2[i] = hash(c + 199, r + 77);
      const fy = ey + 0.35 * a;
      if (y > fy) {
        const depth = (y - fy) / Math.max(1, H - fy);
        const perspective = (x - ex) / (depth + 0.15);
        const rail = Math.abs(((perspective + 10000) % 175) - 87.5);
        floorField[i] = rail < 2.3 ? 0.5 * depth : 0;
      }
    }
    // Fewer fixtures on small screens.
    BEAMS = W < 650 ? ALL_BEAMS.filter((_, j) => j < 4) : ALL_BEAMS;
    buildCrowd();
    buildTargets();
    setupSky();
  }

  // ── Sky ────────────────────────────────────────────────────────────────
  let skyStars = [], moon = null, shooting = null, nextShooting = 6, skyBottom = 180;
  function setupSky() {
    skyStars = []; shooting = null; nextShooting = 5 + hash(W, H) * 5;
    skyBottom = Math.max(135, ey - 0.64 * a);
    const count = W < 650 ? 17 : 36;
    for (let j = 0; j < count; j++) {
      skyStars.push({
        x: W * (0.035 + 0.93 * hash(j + 17, 23)),
        y: 93 + (skyBottom - 85) * hash(j + 31, 7), phase: hash(j, 99) * 6.283,
        bright: 0.15 + 0.15 * hash(j, 76), ch: j % 9 === 0 ? '+' : j % 13 === 0 ? '*' : '.',
      });
    }
    moon = { x: W * 0.76, y: Math.max(113, skyBottom * 0.51), r: clamp(W * 0.018, 13, 24) };
  }

  function renderSky(t, add) {
    const put = (x, y, ch, v, col = SK) => {
      const c = Math.floor(x / SW), r = Math.floor(y / SL), i = r * Scols + c;
      if (c >= 0 && r >= 0 && c < Scols && r < Srows && sceneMask[i] < 0.1) add(col, v, ch, i);
    };
    for (const star of skyStars) {
      const twinkle = reduced ? 1 : 0.72 + 0.28 * Math.sin(t * 0.45 + star.phase);
      put(star.x, star.y, star.ch, star.bright * twinkle, SC);
    }
    if (moon) {
      const { x, y, r } = moon;
      for (let row = Math.floor((y - r) / SL); row <= Math.ceil((y + r) / SL); row++)
        for (let col = Math.floor((x - r) / SW); col <= Math.ceil((x + r) / SW); col++) {
          const px0 = (col + 0.5) * SW, py0 = (row + 0.5) * SL, dx = px0 - x, dy = py0 - y;
          if (dx * dx + dy * dy > r * r) continue;
          const cut = (dx - r * 0.43) ** 2 + (dy + r * 0.12) ** 2;
          if (cut < (r * 0.93) ** 2) continue;
          put(px0, py0, Math.abs(dx) > 0.77 * r ? ':' : '+', 0.27, SK);
        }
    }
    if (reduced) return;
    if (!shooting && t >= nextShooting) {
      const seed = Math.floor(t * 11);
      shooting = {
        start: t, duration: 1.15, x: W * (0.1 + 0.46 * hash(seed, 1)),
        y: 100 + Math.max(0, skyBottom - 150) * hash(seed, 2), vx: W * 0.19, vy: Math.min(48, skyBottom * 0.14),
      };
      nextShooting = t + 10 + hash(seed, 4) * 12;
    }
    if (shooting) {
      const s = shooting, age = t - s.start;
      if (age > s.duration || age < 0) { shooting = null; return; }
      const fade = ss(0, 0.1, age) * (1 - ss(0.75, s.duration, age));
      const used = new Set();
      for (let k = 0; k < 17; k++) {
        const tail = k / 16, dt = age - tail * 0.38;
        if (dt < 0) continue;
        const x = s.x + s.vx * dt, y = s.y + s.vy * dt;
        if (y > skyBottom + 12) continue;
        const index = Math.floor(x / SW) + Math.floor(y / SL) * Scols;
        if (used.has(index)) continue; used.add(index);
        put(x, y, k === 0 ? '*' : k < 6 ? '-' : '.', fade * (0.43 - 0.35 * tail), SC);
      }
    }
  }

  // ── Crowd ──────────────────────────────────────────────────────────────
  function buildCrowd() {
    figures = [];
    let seed = 1849;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const make = (x, feet, h, index, layer, type) => {
      const gender = index % 2 ? 'woman' : 'man';
      const f = {
        x, feet, h: h * (0.94 + rand() * 0.12), type, face: index % 2 ? 1 : -1, z: layer,
        gender, athletic: rand() < 0.42 ? 1 : 0, build: 0.87 + rand() * 0.24,
        energy: 0.8 + rand() * 0.3, mirror: rand() < 0.5 ? -1 : 1,
        choreo: gender === 'woman' ? (rand() < 0.75 ? Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2))
          : (rand() < 0.8 ? 2 + Math.floor(rand() * 2) : Math.floor(rand() * 2)),
        offset: Math.floor(rand() * 8), skirt: gender === 'woman' && rand() < 0.35,
        hair: rand() < 0.65, drink: type === 'social' && rand() < 0.65 ? 1 : 0,
        caps: new Float32Array(5 * 28), nCaps: 0, polys: [], bounds: [0, 0, 0, 0],
      };
      figures.push(f);
      return f;
    };
    const mobile = W < 650;
    const pair = (anchor, feet, h, index, depth) => {
      const gap = 0.18 * h;
      const man = make(anchor - gap / 2, feet, h, index * 2, depth, 'couple');
      const woman = make(anchor + gap / 2, feet, h * 0.97, index * 2 + 1, depth + 0.01, 'couple');
      man.mirror = woman.mirror = 1; man.face = 1; woman.face = -1;
      man.partner = woman; woman.partner = man;
      man.pairOffset = woman.pairOffset = (index * 2) % 8;
      man.pairStyle = woman.pairStyle = index % 3;
      woman.hair = true;
    };
    const layers = mobile ? 3 : 4, frontCount = mobile ? 6 : Math.round(clamp(W / 105, 10, 18));
    const floorBottom = H - (mobile ? 72 : 84);
    let group = 0;
    for (let row = 0; row < layers; row++) {
      const depth = row / (layers - 1), count = frontCount + (layers - 1 - row) * (mobile ? 1 : 2);
      for (let j = 0; j < count; j++) {
        const position = (j + 0.5 + (row % 2 ? 0.22 : -0.12) + (rand() - 0.5) * 0.22) / count;
        const x = W * position, u = (x - ex) / a;
        const eyeFloor = Math.abs(u) < 1.08 ? ey + zoneLower(clamp(u, -1.05, 1.07)) + 8 : H * 0.49;
        const top = Math.min(floorBottom - 65, Math.max(H * 0.54, eyeFloor));
        const room = floorBottom - top;
        const h = Math.min(H * (0.105 + 0.095 * depth), room * (0.44 + 0.4 * depth)) * (0.92 + rand() * 0.12);
        const feet = top + h * 0.96 + depth * Math.max(0, room - h * 0.96) + (rand() - 0.5) * h * 0.09;
        // Couples dominate the floor; solo dancers break up the repeating pattern.
        if ((j + row) % 5 === 3) make(x, feet, h, group++, depth, 'dance');
        else pair(x, feet, h, group++, depth);
      }
    }
    // More dancers reach up the side aisles, beyond the eye's silhouette.
    for (const side of [-1, 1]) for (let row = 0; row < (mobile ? 2 : 5); row++) {
      const y = H * (0.4 + row * 0.065), h = clamp(H * 0.12, 65, 125);
      const x = side < 0 ? W * (0.025 + 0.017 * (row % 2)) : W * (0.975 - 0.017 * (row % 2));
      pair(x, y + h, h, group++, 0.2 + row * 0.05);
    }
    figures.sort((p, q) => q.feet - p.feet);
  }

  // Spotlight targets: the room is split into as many regions as there are beams,
  // each region a slice of the visible crowd from left to right.
  function buildTargets() {
    const vis = figures.filter(f => reservedAt(f.x, f.feet - 0.85 * f.h) < 0.3 && f.x > 0 && f.x < W)
      .sort((p, q) => p.x - q.x);
    const nB = BEAMS.length;
    targets = [];
    for (let k = 0; k < nB; k++) {
      const lo = Math.floor(vis.length * k / nB), hi = Math.max(lo + 1, Math.floor(vis.length * (k + 1) / nB));
      targets.push(vis.slice(lo, hi));
    }
    // A fixed shuffle so beams jump around the room rather than marching in order.
    regionOrder = Array.from({ length: nB }, (_, k) => k);
    for (let k = nB - 1; k > 0; k--) {
      const j = Math.floor(hash(k, 41) * (k + 1));
      [regionOrder[k], regionOrder[j]] = [regionOrder[j], regionOrder[k]];
    }
  }

  // Where beam j points during its phrase number ph. Beam j's phrases start j beats
  // after beam 0's, and each phrase moves every beam one region along the shuffled
  // order. With the last beat of each phrase dark, no two lit beams share a region.
  function aimFor(j, ph) {
    const nB = BEAMS.length;
    const region = targets[regionOrder[(((j + ph) % nB) + nB) % nB]] || [];
    if (!region.length) return [W * 0.5, H * 0.85];
    const f = region[Math.floor(hash(ph * 7 + 3, j * 13 + 5) * region.length)];
    return [f.x, f.feet - 0.5 * f.h];
  }

  function updateLighting() {
    const nB = BEAMS.length;
    const spacing = PHRASE / nB;                    // beats between beams' phrase changes
    const gap = Math.min(1, spacing);               // the dark beat while a beam moves
    const bp = beatTime - Math.floor(beatTime);
    const pulse = 0.9 + 0.1 * Math.exp(-6 * bp);    // a small lift on every beat
    rays = BEAMS.map((B, j) => {
      const local = beatTime - j * spacing;
      const ph = Math.floor(local / PHRASE), into = local - ph * PHRASE;
      const darkStart = PHRASE - gap;
      let aim, env;
      if (into < darkStart) {
        // Lit: holding still on this phrase's target, flashing on the downbeat.
        aim = aimFor(j, ph);
        const flash = 1 + 0.55 * Math.exp(-4 * into);
        env = ss(0, 0.06, into) * (1 - ss(darkStart - 0.18, darkStart, into)) * flash * pulse;
      } else {
        // Dark: swing to the next target where nobody can see the move.
        const A = aimFor(j, ph), B2 = aimFor(j, ph + 1), m = ss(darkStart, PHRASE, into);
        aim = [A[0] + (B2[0] - A[0]) * m, A[1] + (B2[1] - A[1]) * m];
        env = 0;
      }
      if (reduced) env = into < darkStart ? 1 : 0;
      const x = B.x * W, y = B.y * H, angle = Math.atan2(aim[1] - y, aim[0] - x);
      return { x, y, col: B.color, dx: Math.cos(angle), dy: Math.sin(angle), spread: Math.tan(B.width), strength: env };
    });
    for (let r = 0; r < Srows; r++) for (let c = 0; c < Scols; c++) {
      const i = r * Scols + c;
      if (sceneMask[i] > 0.96) { lightLevels[i] = 0; continue; }
      const L = rayLight((c + 0.5) * SW, (r + 0.5) * SL);
      lightLevels[i] = L; lightColors[i] = rayCol;
    }
  }

  let rayCol = SH;
  function rayLight(x, y) {
    let best = 0; rayCol = SH;
    for (const ray of rays) {
      if (ray.strength <= 0) continue;
      const dx = x - ray.x, dy = y - ray.y, along = dx * ray.dx + dy * ray.dy;
      if (along <= 0) continue;
      const radial = Math.abs(dx * ray.dy - dy * ray.dx) / (along * ray.spread);
      if (radial >= 1) continue;
      const fade = ss(12, 80, along) * (1 - 0.18 * ss(H * 0.65, H * 1.4, along));
      const s = (1 - ss(0.48, 1, radial)) * ray.strength * fade;
      if (s > best) { best = s; rayCol = ray.col; }
    }
    return best;
  }

  // Two-bone IK: knee position for a planted foot.
  const tmp = new Float32Array(4);
  function knee(hx, hy, fx, fy, l1, l2, bend, out) {
    let dx = fx - hx, dy = fy - hy;
    let d = Math.hypot(dx, dy) || 1e-4;
    const dm = Math.min(d, l1 + l2 - 1e-4);
    const ang = Math.atan2(dy, dx) + bend * Math.acos(clamp((l1 * l1 + dm * dm - l2 * l2) / (2 * l1 * dm), -1, 1));
    out[0] = hx + Math.cos(ang) * l1; out[1] = hy + Math.sin(ang) * l1;
    if (d > l1 + l2) { out[2] = hx + dx / d * (l1 + l2); out[3] = hy + dy / d * (l1 + l2); }
    else { out[2] = fx; out[3] = fy; }
  }

  // Eight key poses per routine. Pose: hip offset, torso lean, knee dip, shoulder tilt,
  // hip tilt, left arm, right arm, stance. Everyone reaches a key pose on every beat;
  // individual offsets and routines keep them from being copies.
  const ROUTINES = [
    [
      [-.075, .18, .012, -.12, .22, [2.7, .4], [2.5, .55], .09],
      [.02, -.06, .075, .1, -.08, [2.9, -.1], [2.65, .3], .11],
      [.085, -.24, .02, .14, -.25, [2.35, .8], [.5, -1.3], .075],
      [.035, -.08, .065, -.06, -.1, [2.6, .55], [.3, -.8], .07],
      [-.085, .26, .015, -.16, .22, [.55, -1.35], [2.5, .8], .085],
      [-.015, .02, .08, .08, .06, [1.65, -2.4], [2.8, .4], .12],
      [.075, -.2, .02, .1, -.22, [2.6, .45], [2.9, -.15], .08],
      [0, .1, .055, -.1, .1, [2.85, -.3], [2.4, .6], .1],
    ],
    [
      [.09, -.28, .015, .16, -.24, [2.45, .7], [.5, -1.15], .065],
      [.045, -.15, .065, .04, -.1, [2.1, .9], [.65, -1.8], .085],
      [-.075, .24, .03, -.16, .2, [.55, -1.25], [2.4, .8], .07],
      [-.04, .12, .08, -.04, .12, [.7, -2.4], [2.65, .25], .1],
      [.08, -.22, .025, .12, -.2, [.5, -1.4], [.45, -1.2], .06],
      [.015, .08, .09, -.08, .06, [1.3, -2.7], [.6, -2.5], .11],
      [-.09, .28, .015, -.17, .25, [2.3, .8], [.4, -1.1], .065],
      [-.02, .06, .06, .08, .06, [2.65, .35], [1, -2.6], .09],
    ],
    [
      [-.035, .13, .02, -.1, .08, [.7, -2.6], [2.4, .35], .12],
      [.025, -.1, .085, .12, -.1, [1, -2.7], [1.9, .5], .15],
      [.05, -.2, .025, .13, -.12, [2.2, .5], [.65, -2.4], .1],
      [0, .02, .095, -.04, .04, [1.2, -2.7], [.8, -2.5], .14],
      [-.055, .22, .025, -.13, .13, [.5, -2.3], [2.7, -.1], .11],
      [-.015, .06, .075, .06, .02, [.9, -2.7], [2.2, .5], .14],
      [.045, -.16, .03, .1, -.1, [1.8, .4], [.65, -2.5], .12],
      [0, -.06, .085, -.1, .04, [.8, -2.6], [1.1, -2.7], .15],
    ],
    [
      [-.07, .2, .025, -.12, .16, [1.5, -.6], [.55, -2.4], .13],
      [-.025, .08, .085, .06, .05, [.7, -2.5], [1.5, -1.5], .15],
      [.07, -.22, .02, .14, -.16, [.5, -2.4], [1.8, -.5], .1],
      [.02, -.05, .075, -.08, -.06, [1.2, -2.6], [.7, -2.5], .13],
      [-.06, .2, .02, -.1, .14, [2.6, .25], [.55, -2.5], .1],
      [0, .06, .09, .04, 0, [1.9, .4], [1.7, -2.3], .16],
      [.07, -.23, .025, .12, -.17, [.5, -1.3], [2.65, .2], .1],
      [.015, -.05, .08, -.04, -.04, [.8, -2.5], [1, -2.6], .14],
    ],
  ];

  function couplePose(f, beat) {
    const k = ((beat + f.pairOffset) % 8 + 8) % 8;
    const woman = f.gender === 'woman';
    const hips = [-.065, -.025, .055, .025, -.055, -.015, .065, .02];
    const dip = [.01, .035, .015, .025, .01, .035, .015, .025];
    const turn = woman && k === 3 ? .62 : woman && k === 4 ? .82 : 1;
    const p = [hips[k] * (woman ? 1 : .6),
      woman ? [-.2, -.12, -.06, .1, .16, -.17, -.22, -.12][k] : [.16, .12, .1, .06, -.04, .12, .18, .1][k],
      dip[k], woman ? -.08 : .06, hips[k] * -2,
      woman ? [2.45, .65] : [.45, -1.3], woman ? [.5, -1.2] : [.65, -2.3],
      woman ? .07 : .095, turn];
    if (woman && (k === 1 || k === 6)) p[6] = [2.6, .5];
    if (woman && (k === 4 || k === 5)) p[6] = [.45, -1.3];
    if (f.pairStyle === 1) { p[0] *= .7; p[1] *= 1.25; if (woman) p[6] = k % 2 ? [2.6, .45] : [.45, -1.25]; }
    if (f.pairStyle === 2) { p[0] *= 1.12; if (woman && k !== 3) p[5] = [.7, -2.3]; p[4] *= .75; }
    return p;
  }

  function keyPose(f, beat) {
    if (f.type === 'couple') return couplePose(f, beat);
    if (f.type === 'dance') return ROUTINES[f.choreo][((beat + f.offset) % 8 + 8) % 8];
    // People at the edges stay in conversation, with infrequent held gestures.
    const talk = Math.floor(beat / 4 + f.offset) % 3;
    return [f.face * .02, f.face * .1, .015, -.05 * f.face, .08 * f.face,
      f.drink ? [.35, -2.6] : [.2, -.55], talk === 1 ? [.9, -2.3] : [.4, -1.1], .065, 1];
  }

  const lerp = (x, y, m) => x + (y - x) * m;
  function blendPose(A, B, m) {
    return [lerp(A[0], B[0], m), lerp(A[1], B[1], m), lerp(A[2], B[2], m), lerp(A[3], B[3], m),
      lerp(A[4], B[4], m), [lerp(A[5][0], B[5][0], m), lerp(A[5][1], B[5][1], m)],
      [lerp(A[6][0], B[6][0], m), lerp(A[6][1], B[6][1], m)], lerp(A[7], B[7], m),
      lerp(A[8] || 1, B[8] || 1, m)];
  }

  // Hold the pose just after the beat, then ease into the next one so it lands on the beat.
  const moveCurve = (frac) => ss(0.42, 1, frac);

  function partnerTarget(f, beat) {
    const other = f.partner, p = couplePose(other, beat), k = ((beat + f.pairOffset) % 8 + 8) % 8;
    const hipX = p[0] * other.energy, hipY = -.52 + p[2] * other.energy * .45;
    let nx, ny;
    if (k === 3) {
      // Joined hands overhead for a held turn.
      const wx = (f.x + other.x) / 2;
      const wy = Math.min(f.feet - .99 * f.h, other.feet - .99 * other.h);
      return [(wx - f.x) / f.h, (wy - f.feet) / f.h];
    }
    if (f.gender === 'man') { nx = hipX - .055 * other.build; ny = hipY - .055; }
    else { nx = hipX + p[1] * .3 + .075 * other.build; ny = hipY - .285; }
    return [(other.x + nx * other.h - f.x) / f.h, (other.feet + ny * other.h - f.feet) / f.h];
  }

  function stepOffset(f, beat) {
    const s = (f.type === 'dance' || f.type === 'couple') ? ((beat + f.offset) % 4 + 4) % 4 : 0;
    return s;
  }

  function poseAndCaps(f) {
    const k = Math.floor(beatTime + 1e-7);
    const frac = beatTime - k;
    const m = moveCurve(frac);
    const p = blendPose(keyPose(f, k), keyPose(f, k + 1), m);
    const mirror = f.mirror;
    const groove = (f.type === 'dance' || f.type === 'couple') ? 0.012 * Math.exp(-6 * frac) : 0; // a dip on every beat
    const hipX = p[0] * f.energy * mirror, dip = p[2] * f.energy * .45 + groove;
    const lean = p[1] * mirror, shoulderTilt = p[3] * mirror, hipTilt = p[4] * mirror;
    const aL = mirror > 0 ? p[5] : p[6], aR = mirror > 0 ? p[6] : p[5];
    const female = f.gender === 'woman', h = f.h;
    const pel = [hipX, -.52 + dip];
    const waist = [pel[0] + lean * .09, pel[1] - .11];
    const chest = [pel[0] + lean * .24, pel[1] - .245];
    const neck = [pel[0] + lean * .3, pel[1] - .32];
    const head = [neck[0] + lean * .035, neck[1] - .082];
    const shoulderW = (female ? .08 + f.athletic * .012 : .105 + f.athletic * .025) * f.build * p[8];
    const waistW = (female ? .031 : .039) * f.build;
    const hipW = (female ? .088 : .057) * f.build;
    const bustW = (female ? .086 : .097 + f.athletic * .018) * f.build;
    const sl = [neck[0] - shoulderW, neck[1] + .025 - shoulderTilt * .25];
    const sr = [neck[0] + shoulderW, neck[1] + .025 + shoulderTilt * .25];
    const hl = [pel[0] - hipW * .6, pel[1] - hipTilt * .17];
    const hr = [pel[0] + hipW * .6, pel[1] + hipTilt * .17];
    f.polys = []; f.nCaps = 0;
    f.bounds = [W, H, 0, 0];
    const expand = (x, y, r = 0) => {
      f.bounds[0] = Math.min(f.bounds[0], x - r); f.bounds[1] = Math.min(f.bounds[1], y - r);
      f.bounds[2] = Math.max(f.bounds[2], x + r); f.bounds[3] = Math.max(f.bounds[3], y + r);
    };
    const cap = (p1, p2, r) => {
      const o = f.nCaps++ * 5;
      const x = f.x + p1[0] * h, y = f.feet + p1[1] * h, bx = f.x + p2[0] * h, by = f.feet + p2[1] * h;
      f.caps[o] = x; f.caps[o + 1] = y; f.caps[o + 2] = bx; f.caps[o + 3] = by; f.caps[o + 4] = r * h;
      expand(x, y, r * h); expand(bx, by, r * h);
    };
    const poly = (vertices) => {
      const points = vertices.map(q => [f.x + q[0] * h, f.feet + q[1] * h]);
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of points) {
        expand(x, y);
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
      }
      f.polys.push({ points, bounds });
    };
    const limb = (A, B, r1, r2) => {
      const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      poly([[A[0] + nx * r1, A[1] + ny * r1], [B[0] + nx * r2, B[1] + ny * r2],
        [B[0] - nx * r2, B[1] - ny * r2], [A[0] - nx * r1, A[1] - ny * r1]]);
    };
    // Faceted hourglass / inverted triangle, with a pinched waist.
    poly([sl, [chest[0] - bustW, chest[1] + .045],
      [waist[0] - waistW, waist[1]], [pel[0] - hipW, pel[1] - .015 - hipTilt * .17],
      [pel[0] - hipW * .6, pel[1] + .07], [pel[0] + hipW * .6, pel[1] + .07],
      [pel[0] + hipW, pel[1] - .015 + hipTilt * .17], [waist[0] + waistW, waist[1]],
      [chest[0] + bustW, chest[1] + .045], sr,
      [neck[0] + .022, neck[1] + .025], [neck[0], neck[1] + .055], [neck[0] - .022, neck[1] + .025]]);
    cap(neck, [head[0], head[1] + .03], .017);
    // Small angular jaw and long neck.
    const hw = female ? .039 : .043;
    poly([[head[0] - hw * .83, head[1] - .047], [head[0] + hw * .85, head[1] - .05],
      [head[0] + hw, head[1] + .006], [head[0] + hw * .62, head[1] + .045],
      [head[0] - .012, head[1] + .05], [head[0] - hw, head[1] + .014]]);
    if (female && f.hair) {
      const side = -f.face;
      poly([[head[0] - .045, head[1] - .046], [head[0] + .04, head[1] - .055],
        [head[0] + .055 * side, head[1] + .025], [head[0] + .11 * side, head[1] + .14],
        [head[0] + .035 * side, head[1] + .1], [head[0] - .046, head[1] + .02]]);
    }
    let reach = null;
    if (f.partner) {
      const A = partnerTarget(f, k), B = partnerTarget(f, k + 1);
      reach = [lerp(A[0], B[0], m), lerp(A[1], B[1], m)];
    }
    const arm = (S, angles, side) => {
      let e = [S[0] + side * Math.sin(angles[0]) * .155, S[1] + Math.cos(angles[0]) * .155];
      let w = [e[0] + side * Math.sin(angles[0] + angles[1]) * .15, e[1] + Math.cos(angles[0] + angles[1]) * .15];
      if (reach && side === (female ? -1 : 1)) {
        knee(S[0], S[1], reach[0], reach[1], .155, .15, side > 0 ? -1 : 1, tmp);
        e = [tmp[0], tmp[1]]; w = [tmp[2], tmp[3]];
      }
      const r = (female ? .018 : .021 + f.athletic * .006) * f.build;
      limb(S, e, r, .014); cap(e, e, .014); limb(e, w, .014, .009); cap(w, w, .013);
      return w;
    };
    const leftHand = arm(sl, aL, -1), rightHand = arm(sr, aR, 1);
    const stance = p[7];
    // Side steps glide between beats too.
    const s0 = stepOffset(f, k), s1 = stepOffset(f, k + 1);
    const stepL = lerp(s0 === 1 ? 1 : 0, s1 === 1 ? 1 : 0, m), stepR = lerp(s0 === 3 ? 1 : 0, s1 === 3 ? 1 : 0, m);
    const fl = [-stance + .035 * stepL, -.025 * stepL];
    const fr = [stance - .035 * stepR, -.025 * stepR];
    knee(hl[0], hl[1], fl[0], fl[1], .265, .255, 1, tmp); const kl = [tmp[0], tmp[1]];
    knee(hr[0], hr[1], fr[0], fr[1], .265, .255, -1, tmp); const kr = [tmp[0], tmp[1]];
    const thigh = (female ? .033 : .028 + f.athletic * .004) * f.build;
    limb(hl, kl, thigh, .018); limb(hr, kr, thigh, .018);
    cap(kl, kl, .017); cap(kr, kr, .017);
    limb(kl, fl, .018, .011); limb(kr, fr, .018, .011);
    if (female && f.skirt) poly([[pel[0] - hipW, pel[1] - .01], [pel[0] + hipW, pel[1] - .01],
      [pel[0] + hipW * .8, pel[1] + .19], [pel[0] - hipW * .84, pel[1] + .19]]);
    limb(fl, [fl[0] - .035, fl[1] + .007], .014, .01);
    limb(fr, [fr[0] + .035, fr[1] + .007], .014, .01);
    if (f.drink) { const hand = f.face > 0 ? leftHand : rightHand; limb(hand, [hand[0], hand[1] - .045], .012, .016); }
  }

  // Fill a person's shape into a small cell grid: polygons by scanline, joints as discs.
  let rasterBuf = new Uint8Array(4096);
  function rasterFigure(f) {
    const [x0, y0, x1, y1] = f.bounds;
    const ca = Math.max(0, Math.floor(x0 / SW)), cb = Math.min(Scols - 1, Math.ceil(x1 / SW));
    const ra = Math.max(0, Math.floor(y0 / SL)), rb = Math.min(Srows - 1, Math.ceil(y1 / SL));
    const w = cb - ca + 1, h = rb - ra + 1;
    if (w <= 0 || h <= 0) return null;
    if (rasterBuf.length < w * h) rasterBuf = new Uint8Array(w * h * 2);
    const m = rasterBuf;
    m.fill(0, 0, w * h);
    const xs = [];
    for (const pl of f.polys) {
      const p = pl.points, b = pl.bounds;
      const r0 = Math.max(ra, Math.ceil(b[1] / SL - 0.5)), r1 = Math.min(rb, Math.floor(b[3] / SL - 0.5));
      for (let r = r0; r <= r1; r++) {
        const y = (r + 0.5) * SL;
        xs.length = 0;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
          const A = p[j], B = p[i];
          if ((A[1] > y) !== (B[1] > y)) xs.push(A[0] + (y - A[1]) * (B[0] - A[0]) / (B[1] - A[1]));
        }
        xs.sort((u, v) => u - v);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(ca, Math.ceil(xs[k] / SW - 0.5)), c1 = Math.min(cb, Math.floor(xs[k + 1] / SW - 0.5));
          for (let c = c0; c <= c1; c++) m[(r - ra) * w + (c - ca)] = 1;
        }
      }
    }
    const cp = f.caps;
    for (let j = 0; j < f.nCaps; j++) {
      const o = j * 5, ax = cp[o], ay = cp[o + 1], bx = cp[o + 2], by = cp[o + 3], rad = cp[o + 4];
      const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy;
      const r0 = Math.max(ra, Math.floor((Math.min(ay, by) - rad) / SL)), r1 = Math.min(rb, Math.ceil((Math.max(ay, by) + rad) / SL));
      const c0 = Math.max(ca, Math.floor((Math.min(ax, bx) - rad) / SW)), c1 = Math.min(cb, Math.ceil((Math.max(ax, bx) + rad) / SW));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const qx = (c + 0.5) * SW - ax, qy = (r + 0.5) * SL - ay;
        const t = clamp(d2 ? (qx * dx + qy * dy) / d2 : 0, 0, 1);
        const ex2 = qx - t * dx, ey2 = qy - t * dy;
        if (ex2 * ex2 + ey2 * ey2 <= rad * rad) m[(r - ra) * w + (c - ca)] = 1;
      }
    }
    return { ca, ra, w, h, m };
  }

  function renderScene(t) {
    sctx.clearRect(0, 0, W, H);
    for (const bk of sceneBuckets) bk.length = 0;
    updateLighting();
    const add = (base, v, ch, i) => {
      const level = Math.round(clamp(v, 0, 1) * LV);
      if (level > 0) sceneBuckets[base * (LV + 1) + level].push(i * 128 + CI[ch]);
    };

    // People only show where a spotlight falls on them, so only lit people are posed
    // and drawn each frame. Light is applied per character, so a beam can catch a
    // shoulder and an arm while the rest of the body stays dark.
    occupied.fill(0);
    for (const f of figures) {
      // Quick test: is any part of this person inside a lit beam?
      const top = f.feet - 1.05 * f.h;
      if (rayLight(f.x, f.feet - 0.5 * f.h) < 0.05 && rayLight(f.x, top + 0.15 * f.h) < 0.05 &&
          rayLight(f.x - 0.2 * f.h, f.feet - 0.6 * f.h) < 0.05 && rayLight(f.x + 0.2 * f.h, f.feet - 0.6 * f.h) < 0.05 &&
          rayLight(f.x, f.feet - 0.1 * f.h) < 0.05) continue;
      poseAndCaps(f);
      const g = rasterFigure(f);
      if (!g) continue;
      const { ca, ra, w, h: gh, m } = g;
      const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= gh) ? 0 : m[y * w + x];
      for (let y = 0; y < gh; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const c = ca + x, r = ra + y, i = r * Scols + c;
        if (occupied[i] || sceneMask[i] > 0.8) continue;
        const L = lightLevels[i];
        if (L < 0.14) continue;                     // no outline or texture outside a spotlight
        occupied[i] = 1;
        const reveal = ss(0.14, 0.42, L);
        let ch, tex;
        const l = at(x - 1, y), rr = at(x + 1, y), u = at(x, y - 1), dn = at(x, y + 1);
        if (!(l && rr && u && dn)) {
          // Outline: stroke direction from the shape's local gradient.
          const gx = (at(x + 1, y - 1) + 2 * rr + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * l + at(x - 1, y + 1));
          const gy = (at(x - 1, y + 1) + 2 * dn + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * u + at(x + 1, y - 1));
          if (!l && !rr) ch = '|';
          else if (!u && !dn) ch = '-';
          else ch = dirGlyph(Math.atan2(gy / SL, gx / SW) + Math.PI / 2);
          tex = 0.98;
        } else {
          const ramp = L > 0.65 ? 'X#%MH' : L > 0.25 ? '=+xX%' : '.,:;+=x';
          ch = ramp[Math.floor(sceneNoise2[i] * ramp.length)];
          const garment = 0.76 + 0.24 * Math.sin(((c + 0.5) * SW - f.x) / f.h * 35 + ((r + 0.5) * SL - f.feet) / f.h * 5);
          tex = 0.94 * garment * (0.78 + 0.22 * sceneNoise[i]);
        }
        add(lightColors[i], tex * Math.min(1, L) * reveal * (1 - sceneMask[i]), ch, i);
      }
    }
    // Volumetric haze, as sparse characters inside each cone.
    for (let r = 0; r < Srows; r++) for (let c = 0; c < Scols; c++) {
      const i = r * Scols + c;
      if (occupied[i] || sceneMask[i] > 0.8) continue;
      const L = Math.min(1, lightLevels[i]), rv = sceneNoise[i], vis = 1 - sceneMask[i];
      const drift = 0.7 + 0.3 * Math.sin(r * 0.13 + c * 0.037 - t * 0.3);
      if (L > 0.035 && rv < (0.19 + 0.38 * L) * drift) {
        const ramp = L > 0.7 ? '.:;+=/' : '.,:;';
        add(lightColors[i], (0.08 + 0.36 * L) * vis * drift, ramp[Math.floor(sceneNoise2[i] * ramp.length)], i);
      } else if (floorField[i] && rv > 0.4) {
        add(L > 0.1 ? lightColors[i] : BL, (0.055 + 0.09 * L) * floorField[i], '.', i);
      }
    }
    renderSky(t, add);
    drawBuckets(sctx, sceneBuckets, SF, SW, SL, Scols);
  }

  // ── Loop ───────────────────────────────────────────────────────────────
  const STATIC_BEAT = 3.5;                        // a moment with nearly every light on
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
    // The scene runs at ~30 fps.
    if (now - lastScene >= 32) {
      lastScene = now;
      beatTime = now / 1000 * BPM / 60;
      renderScene(now / 1000);
    }
  }

  function renderStatic() {
    gaze.x = gaze.y = 0;
    blinkV = 0;
    render();
    beatTime = STATIC_BEAT;
    renderScene(0);
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
