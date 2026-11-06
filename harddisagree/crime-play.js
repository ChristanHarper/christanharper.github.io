// Partners in Crime: the phone. Mostly tapping, swiping, and drawing, plus the pocket:
// a soft blob and your loose loot to play with while you wait. It makes no sound.

window.CrimePlay = (() => {
  const ME = Show.role;
  const THEM = ME === 'p1' ? 'p2' : 'p1';
  const name = (v, p) => esc(v.players[p].name);
  const head = (s, label) => `<p class="eyebrow">${esc(label || s.roundTitle || '')}${s.of > 1 ? ` · ${s.n} of ${s.of}` : ''}</p>`;
  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

  const nextBtn = (v, label = 'Next') => {
    if (!v.canNext) return '';
    if (v.ready[ME]) return `<button class="next" disabled>Waiting for ${name(v, THEM)}…</button>`;
    return `<button class="next" data-next>${esc(label)}${v.ready[THEM] ? ` (${name(v, THEM)} is ready)` : ''}</button>`;
  };
  const watch = (v, text = 'Eyes on the big screen.', label) => `<div class="watch pocketed"><p class="logo">${esc(text)}</p>${nextBtn(v, label)}</div>`;
  const locked = () => '<div class="watch pocketed"><div class="locked-in">Locked in</div></div>';
  const timer = (s, field = 'endsAt') => `<div class="p-clock" data-starts="${s.startsAt || 0}" data-ends="${s[field] || 0}"></div>`;

  // ---- The shared stages: the vote and the argument ----

  function cutScreen(v) {
    const { cut } = v.step;
    if (v.mine !== undefined) return locked();
    return `${head(v.step)}<h1 class="q">${esc(cut.prompt)}</h1>
      ${cut.round > 1 ? '<p class="fine">Last vote. Match or it deadlocks.</p>' : ''}
      <div class="choices">${cut.options.map((o) => `<button class="choice" data-vote="${esc(o.id)}"><span>${esc(o.label)}</span></button>`).join('')}</div>
      ${callBtn(v)}`;
  }

  function callBtn(v) {
    if (v.step.called) return '<p class="fine">The Informant is on the line. Watch the big screen.</p>';
    return `<button class="fifth" data-call>Call the Informant</button><p class="fine">Asks for an opinion. You can ignore it. One call each per episode.</p>`;
  }

  function argueScreen(v) {
    const skipped = v.mine !== undefined;
    return `<div class="watch pocketed"><p class="eyebrow">Argue!</p>
      <div class="p-clock big" data-starts="${v.step.arg.startsAt}" data-ends="${v.step.arg.endsAt}"></div>
      ${skipped ? '<p class="waiting">You voted to skip. Waiting on them.</p>' : '<button class="next quietish" data-skip>Nothing to argue about</button>'}
      ${v.step.cut ? callBtn(v) : ''}</div>`;
  }

  function shared(v) {
    const { stage } = v.step;
    if (stage === 'cut') return cutScreen(v);
    if (stage === 'argue') return argueScreen(v);
    if (stage === 'paid') return watch(v);
    return null;
  }

  const withShared = (fn) => (v) => shared(v) ?? fn(v);

  // ---- Screens ----

  let deckState = { key: null, i: 0, picks: [] };
  let sketchState = { key: null, strokes: [] };
  let friskState = { key: null, mine: null };

  const screens = {
    deck: withShared((v) => {
      const s = v.step;
      if (s.stage !== 'answer') return watch(v);
      if (v.mine !== undefined) return locked();
      if (deckState.key !== v.i) deckState = { key: v.i, i: 0, picks: [] };
      const buttons = s.q.mode === 'menu'
        ? '<button class="swipe-btn no" data-pick="no">No</button><button class="swipe-btn maybe" data-pick="maybe">Maybe</button><button class="swipe-btn yes" data-pick="yes">Yes</button>'
        : `<button class="swipe-btn p1" data-pick="p1">${name(v, 'p1')}</button><button class="swipe-btn p2" data-pick="p2">${name(v, 'p2')}</button>`;
      return `${head(s)}<div class="deck" id="deck">
        <div class="deck-count"><span id="deck-n"></span> / ${s.q.cards.length}</div>
        <div class="deck-card" id="deck-card"></div>
        <div class="deck-buttons">${buttons}</div>
        ${s.q.mode === 'menu' ? '<p class="fine">Only overlap ever shows. The rest gets thrown away.</p>' : ''}
      </div>`;
    }),

    sketch: withShared((v) => {
      const s = v.step;
      if (s.stage !== 'answer') return watch(v);
      if (v.mine !== undefined) return locked();
      return `${head(s)}<h1 class="q small-q">${esc(s.q.q)}</h1>${timer(s)}
        <canvas id="sketchpad" class="sketchpad" width="1296" height="972"></canvas>
        <div class="sketch-actions"><button class="fifth" id="sketch-undo">Undo</button><button class="next" id="sketch-done">Done</button></div>`;
    }),

    alibi: withShared((v) => {
      const s = v.step;
      if (s.stage !== 'answer') return watch(v);
      if (v.mine !== undefined) return locked();
      return `${head(s)}<h1 class="q">${esc(s.q.q)}</h1>
        <div class="write"><textarea id="text" maxlength="40" rows="2" placeholder="A few words…"></textarea>
        <div class="count"><span id="count">0</span>/40</div>
        <button class="next" id="send-text" disabled>Lock it in</button></div>`;
    }),

    claim: withShared((v) => {
      const s = v.step;
      if (s.stage !== 'answer') return watch(v);
      if (v.mine !== undefined) return locked();
      return `${head(s)}<h1 class="q">${esc(s.q.q)}</h1>
        <div class="choices">${s.q.options.map((o, i) => `<button class="choice" data-value="${i}"><span>${esc(o)}</span></button>`).join('')}</div>`;
    }),

    accuse: withShared((v) => watch(v)),

    dial: withShared((v) => {
      const s = v.step;
      if (s.stage !== 'answer') return watch(v);
      if (ME === s.giver) {
        const t = v.priv.target;
        return `${head(s)}<h1 class="q small-q">Say one thing out loud that lands right here. No numbers.</h1>
          <div class="p-scale"><div class="rail"></div><div class="p-pin" style="left:${t}%">${t}</div></div>
          <div class="slider"><div class="ends"><span>${esc(s.q.low)}</span><span>${esc(s.q.high)}</span></div></div>
          <p class="fine">${name(v, THEM)} moves the slider. Wait for them.</p>`;
      }
      return `${head(s)}<h1 class="q small-q">Listen to ${name(v, THEM)}, then slide.</h1>
        <div class="slider"><output id="val">50</output>
        <input id="range" type="range" min="0" max="100" step="1" value="50">
        <div class="ends"><span>${esc(s.q.low)}</span><span>${esc(s.q.high)}</span></div></div>
        <button class="next" id="send-range">Lock it in</button>`;
    }),

    charades: withShared((v) => {
      const s = v.step;
      if (s.stage === 'ready') return watch(v, s.actor === ME ? 'You act.' : 'You guess.', 'Ready');
      if (s.stage === 'play') {
        if (ME !== s.actor) return `<div class="watch pocketed"><p class="logo">Guess out loud!</p>${timer(s)}</div>`;
        return `<div class="word-stage">${timer(s)}<div class="word-card">${esc(v.priv?.word || '')}</div>
          <div class="point short"><button class="choice tall concede" data-value="skip">Skip</button><button class="choice tall ${ME}" data-value="got">Got it</button></div></div>`;
      }
      return watch(v);
    }),

    wires: withShared((v) => {
      const s = v.step;
      if (s.stage === 'ready') return watch(v, 'Get talking.', 'Ready');
      if (s.stage !== 'play') return watch(v);
      if (v.priv?.wires) {
        return `${head(s)}${timer(s)}<p class="ask">Describe these. Cut when they tell you to.</p>
          <div class="wires">${v.priv.wires.map((c, i) => `<button class="wire ${c}" data-value="${i}"><b>${i + 1}</b><span>${c}</span></button>`).join('')}</div>`;
      }
      if (v.priv?.rules) {
        return `${head(s)}${timer(s)}<p class="ask">Use the first rule that's true. ${name(v, THEM)} has the wires.</p>
          <ol class="manual">${v.priv.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`;
      }
      return watch(v);
    }),

    fuse: withShared((v) => {
      const s = v.step;
      if (s.stage === 'ready') return `<div class="watch pocketed"><p class="q">${esc(s.q.q)}</p>${nextBtn(v, 'Light it')}</div>`;
      if (s.stage === 'play') {
        if (s.holder === ME) return `<button class="giant-btn hot" data-value="pass">Say one, then pass</button>`;
        return `<div class="watch pocketed"><p class="logo">${name(v, THEM)} has it.</p><p class="waiting">Make sure it actually counts.</p></div>`;
      }
      return watch(v);
    }),

    safe: withShared((v) => {
      const s = v.step;
      if (s.stage === 'ready') return watch(v, 'Nerve.', 'Ready');
      if (s.stage === 'play') return `<button class="giant-btn grab" data-value="grab"><span class="p-pot" data-starts="${s.startsAt}">$0</span><small>Grab it</small></button>`;
      return watch(v);
    }),

    auction: withShared((v) => {
      const s = v.step;
      if (s.stage !== 'answer') return watch(v);
      if (v.mine !== undefined) return locked();
      const max = v.priv?.max ?? 0;
      return `${head(s)}<h1 class="q small-q">${esc(s.q.lot)}</h1>
        <div class="slider"><output id="val">0</output>
        <input id="range" type="range" min="0" max="${max}" step="10" value="0">
        <div class="ends"><span>0</span><span>${max}</span></div></div>
        <button class="next" id="send-range">Seal my bid</button>`;
    }),

    splitsteal: withShared((v) => {
      const s = v.step;
      if (s.stage === 'answer') {
        if (v.mine !== undefined) return locked();
        return `<h1 class="q">Split, or steal?</h1><div class="point">
          <button class="choice tall concede" data-value="split">Split</button>
          <button class="choice tall stand" data-value="steal">Steal</button></div>`;
      }
      return watch(v);
    }),

    frisk: withShared((v) => {
      const s = v.step;
      if (s.stage !== 'answer') return watch(v);
      if (v.mine !== undefined) return locked();
      if (friskState.key !== v.i) friskState = { key: v.i, mine: null };
      const picking = friskState.mine === null;
      return `${head(s)}<h1 class="q small-q">${esc(s.q.q)}</h1>
        <p class="ask">${picking ? 'Tap yours.' : `Now tap where ${name(v, THEM)} put theirs.`}</p>
        <div id="body-tap" class="body-tap">${CrimeArt.body(picking ? '' : CrimeArt.pin(friskState.mine, ME))}</div>
        ${picking ? '' : '<button class="back" id="frisk-back">Change mine</button>'}`;
    }),

    hilo: withShared((v) => {
      const s = v.step;
      if (s.stage === 'answer') {
        if (v.mine !== undefined) return locked();
        return `<div class="play-card small">${esc(s.q.card)}</div><div class="point short">
          <button class="choice tall concede" data-value="hi">Higher</button><button class="choice tall concede" data-value="lo">Lower</button></div>`;
      }
      if (s.stage === 'forfeit') {
        if (s.r.right[ME]) return watch(v, 'You read it right.');
        if (v.mine !== undefined) return locked();
        return `<h1 class="q">You lost. Pay up.</h1><div class="point short">
          <button class="choice tall stand" data-value="clothes">One item of clothing</button>
          <button class="choice tall concede" data-value="cash">Pay $${s.q.cost}</button></div>`;
      }
      return watch(v);
    }),

    coldread: withShared((v) => {
      const s = v.step;
      if (s.stage === 'ready') return watch(v, s.reader === ME ? 'You\'re reading.' : 'Do not laugh.', 'Ready');
      if (s.stage === 'play') {
        if (s.reader === ME) return `${timer(s)}<div class="quoted read-line">${esc(s.q.line)}</div><button class="next" data-value="done">Done</button>`;
        return `<div class="watch pocketed"><p class="logo">Do not laugh.</p>${timer(s)}</div>`;
      }
      return watch(v);
    }),

    dare: withShared((v) => {
      const s = v.step;
      if (s.stage === 'offer') {
        if (v.mine !== undefined) return locked();
        return `${head(s)}<h1 class="q">${esc(s.q.q)}</h1><div class="point short">
          <button class="choice tall ${ME}" data-value="do">I'm in</button>
          <button class="choice tall concede" data-value="pass">Pass</button></div>
          <p class="fine">A pass is free, and nobody finds out who passed.</p>`;
      }
      if (s.stage === 'doing') {
        return `<div class="watch pocketed">${timer(s)}<p class="logo">Go.</p>
          ${v.mine !== undefined ? '<p class="waiting">Waiting on them.</p>' : '<button class="next quietish" data-value="skip">We\'re done</button>'}</div>`;
      }
      return watch(v);
    }),

    job: withShared((v) => {
      const s = v.step;
      if (s.stage === 'answer' && s.offers) {
        if (s.chooser !== ME) return watch(v, `${v.players[s.chooser].name} is choosing.`);
        return `<p class="eyebrow">Tonight's job</p><h1 class="q">You're leading. You pick.</h1>
          <div class="choices">${s.offers.map((o, i) => `<button class="choice" data-value="${i}"><span>${esc(o)}</span></button>`).join('')}</div>`;
      }
      return watch(v);
    }),

    getaway: withShared((v) => {
      const s = v.step;
      if (s.stage === 'play') {
        return `<div class="getaway">${timer(s)}<canvas id="flick" class="flick"></canvas><p class="fine">Flick coins up into the van.</p></div>`;
      }
      return watch(v);
    }),

    debrief: withShared((v) => {
      if (v.step.stage === 'hold') return watch(v, 'Back at the hideout.');
      return watch(v, 'Look up.', 'End the night');
    }),
  };

  // ---- Wiring ----

  function bindDeck(v) {
    const s = v.step;
    const card = document.getElementById('deck-card');
    if (!card) return;
    const counter = document.getElementById('deck-n');
    const show = () => {
      counter.textContent = deckState.i + 1;
      card.className = 'deck-card';
      card.style.transform = '';
      card.textContent = s.q.cards[deckState.i];
    };
    const swipeValues = s.q.mode === 'menu' ? { left: 'no', right: 'yes', up: 'maybe' } : { left: 'p1', right: 'p2' };
    choose = (value, direction) => {
      buzz(8);
      deckState.picks[deckState.i] = value;
      deckState.i++;
      card.classList.add(`gone-${direction}`);
      setTimeout(() => {
        if (deckState.i >= s.q.cards.length) {
          Show.send('answer', { value: { picks: deckState.picks } });
          card.remove();
          return;
        }
        show();
      }, 170);
    };
    show();
    let start = null;
    card.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY };
      card.setPointerCapture(e.pointerId);
    });
    card.addEventListener('pointermove', (e) => {
      if (!start) return;
      const [dx, dy] = [e.clientX - start.x, e.clientY - start.y];
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
    });
    card.addEventListener('pointerup', (e) => {
      if (!start) return;
      const [dx, dy] = [e.clientX - start.x, e.clientY - start.y];
      start = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) >= Math.abs(dy)) {
        choose(swipeValues[dx > 0 ? 'right' : 'left'], dx > 0 ? 'right' : 'left');
      } else if (dy < -70 && swipeValues.up) {
        choose(swipeValues.up, 'up');
      } else {
        card.style.transform = '';
      }
    });
  }
  let choose = null;

  function encodeSketch(strokes) {
    const pair = (n) => Math.max(0, Math.min(1295, Math.round(n))).toString(36).padStart(2, '0');
    // Thin the strokes further until they fit in one message.
    for (let gap = 6; ; gap *= 1.5) {
      const out = strokes.map((stroke) => {
        const kept = [];
        for (const point of stroke) {
          const last = kept[kept.length - 1];
          if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= gap) kept.push(point);
        }
        const end = stroke[stroke.length - 1];
        if (kept[kept.length - 1] !== end) kept.push(end);
        return kept.map(([x, y]) => pair(x) + pair(y)).join('');
      }).join(',');
      if (out.length <= 3500 || gap > 400) return out.slice(0, 3600).replace(/,[^,]*$/, (m) => (out.length > 3600 ? '' : m));
    }
  }

  function bindSketch(v) {
    const pad = document.getElementById('sketchpad');
    if (!pad) return;
    if (sketchState.key !== v.i) sketchState = { key: v.i, strokes: [] };
    const g = pad.getContext('2d');
    const color = ME === 'p1' ? '#c52c15' : '#0d8f81';
    const redraw = () => {
      g.clearRect(0, 0, pad.width, pad.height);
      g.strokeStyle = color;
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const stroke of sketchState.strokes) {
        g.beginPath();
        stroke.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        if (stroke.length === 1) g.lineTo(stroke[0][0] + 0.1, stroke[0][1]);
        g.stroke();
      }
    };
    const toPad = (e) => {
      const box = pad.getBoundingClientRect();
      return [((e.clientX - box.left) / box.width) * pad.width, ((e.clientY - box.top) / box.height) * pad.height];
    };
    let drawing = false;
    pad.addEventListener('pointerdown', (e) => {
      drawing = true;
      pad.setPointerCapture(e.pointerId);
      sketchState.strokes.push([toPad(e)]);
      redraw();
    });
    pad.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      sketchState.strokes[sketchState.strokes.length - 1].push(toPad(e));
      redraw();
    });
    const stop = () => { drawing = false; };
    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointercancel', stop);
    redraw();
    const send = () => {
      if (sketchState.sent === v.i) return;
      sketchState.sent = v.i;
      Show.send('answer', { value: { d: encodeSketch(sketchState.strokes) } });
    };
    document.getElementById('sketch-undo').addEventListener('click', () => { sketchState.strokes.pop(); redraw(); });
    document.getElementById('sketch-done').addEventListener('click', send);
    sketchSend = send;
    sketchEnds = v.step.endsAt - (v.now - Date.now());
  }
  let sketchSend = null;
  let sketchEnds = 0;

  function bindFrisk(v) {
    const box = document.getElementById('body-tap');
    if (!box) return;
    box.querySelector('svg').addEventListener('pointerdown', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const point = [Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))];
      buzz(8);
      if (friskState.mine === null) {
        friskState.mine = point;
        rerender(v);
      } else {
        Show.send('answer', { value: { mine: friskState.mine, guess: point } });
      }
    });
    document.getElementById('frisk-back')?.addEventListener('click', () => {
      friskState.mine = null;
      rerender(v);
    });
  }

  function rerender(v) {
    document.getElementById('app').innerHTML = `<div class="pane">${SCREENS[v.step.t](v)}</div>`;
    bindAll(v);
  }

  // ---- Clocks on the phone, kept in step with the big screen ----

  let clockLoop = null;

  function runClocks(v) {
    clearInterval(clockLoop);
    const offset = Date.now() - v.now;
    const tick = () => {
      const now = Date.now() - offset;
      document.querySelectorAll('.p-clock').forEach((el) => {
        const starts = Number(el.dataset.starts);
        const ends = Number(el.dataset.ends);
        if (now < starts) {
          el.textContent = `Starting in ${Math.ceil((starts - now) / 1000)}`;
          el.classList.add('count-in');
          return;
        }
        el.classList.remove('count-in');
        const left = Math.max(0, Math.ceil((ends - now) / 1000));
        el.textContent = `${left}s`;
        el.classList.toggle('urgent', left <= 10);
      });
      document.querySelectorAll('.p-pot').forEach((el) => {
        const elapsed = now - Number(el.dataset.starts);
        el.textContent = elapsed < 0 ? Math.ceil(-elapsed / 1000) : `$${Math.floor(elapsed / 250) * 10}`;
      });
      if (sketchSend && document.getElementById('sketchpad') && Date.now() >= sketchEnds) {
        const send = sketchSend;
        sketchSend = null;
        send();
      }
    };
    tick();
    clockLoop = setInterval(tick, 120);
  }

  // ---- The getaway: flick coins up into the van ----

  function startFlick(v) {
    const canvas = document.getElementById('flick');
    if (!canvas || canvas.dataset.on) return;
    canvas.dataset.on = '1';
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const offset = Date.now() - v.now;
    const { startsAt, endsAt } = v.step;
    let score = 0;
    let done = false;
    let coin = null;
    let flying = [];
    let vanX = box.width / 2;
    let dir = 1;
    let drag = null;
    const home = () => ({ x: box.width / 2, y: box.height - 46 });
    const fresh = () => { coin = home(); };
    fresh();
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || !coin) return;
      const r = canvas.getBoundingClientRect();
      coin.x = e.clientX - r.left;
      coin.y = e.clientY - r.top;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!drag || !coin) return;
      const r = canvas.getBoundingClientRect();
      const dt = Math.max(16, performance.now() - drag.t);
      const vx = ((e.clientX - r.left - drag.x) / dt) * 1000;
      const vy = ((e.clientY - r.top - drag.y) / dt) * 1000;
      drag = null;
      if (vy < -150) {
        flying.push({ x: coin.x, y: coin.y, vx, vy });
        fresh();
        buzz(6);
      } else {
        fresh();
      }
    });
    const frame = (t) => {
      if (!document.body.contains(canvas)) return;
      const now = Date.now() - offset;
      g.clearRect(0, 0, box.width, box.height);
      vanX += dir * 1.6;
      if (vanX < 60 || vanX > box.width - 60) dir *= -1;
      // The van.
      g.fillStyle = '#fff1d6';
      g.beginPath();
      g.roundRect(vanX - 52, 12, 104, 44, 8);
      g.fill();
      g.fillStyle = '#24101a';
      g.fillRect(vanX - 36, 22, 72, 30);
      g.fillStyle = '#ffc23d';
      g.font = '800 18px sans-serif';
      g.textAlign = 'center';
      g.fillText(score, vanX, 44);
      const running = now >= startsAt && now < endsAt;
      flying = flying.filter((c) => {
        c.x += c.vx / 60;
        c.y += c.vy / 60;
        c.vy += 8;
        if (c.y <= 50 && c.y >= 14 && Math.abs(c.x - vanX) < 44 && c.vy < 0) {
          if (running) {
            score++;
            Pocket.queue('throw');
          }
          buzz(10);
          return false;
        }
        drawCoin(c.x, c.y);
        return c.y > -20 && c.y < box.height + 20 && c.x > -20 && c.x < box.width + 20;
      });
      if (coin) drawCoin(coin.x, coin.y, 22);
      if (now < startsAt) {
        g.fillStyle = '#fff1d6';
        g.font = '800 24px sans-serif';
        g.fillText(`Ready… ${Math.ceil((startsAt - now) / 1000)}`, box.width / 2, box.height / 2);
      }
      if (now >= endsAt && !done) {
        done = true;
        Show.send('answer', { value: score });
      }
      requestAnimationFrame(frame);
    };
    function drawCoin(x, y, r = 16) {
      g.fillStyle = '#ffc23d';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b9811a';
      g.lineWidth = 3;
      g.stroke();
    }
    requestAnimationFrame(frame);
  }

  // ---- The pocket: a soft blob and your loot, for idle fingers ----

  const Pocket = {
    el: null,
    outbox: [],
    lastSent: 0,
    coins: [],
    blob: { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, squash: 0 },
    touching: false,
    running: false,

    queue(gesture) {
      this.outbox.push(gesture);
      this.flush();
    },

    // Sends at most one message every 700ms, however fast the fingers are.
    flush() {
      const now = Date.now();
      if (!this.outbox.length || this.pending) return;
      const wait = Math.max(0, this.lastSent + 700 - now);
      this.pending = setTimeout(() => {
        this.pending = null;
        this.lastSent = Date.now();
        Show.deliver({ role: Show.role, type: 'fidget', g: this.outbox.splice(0, 6) });
        if (this.outbox.length) this.flush();
      }, wait);
    },

    setup() {
      this.el = document.getElementById('pocket');
      this.canvas = this.el.querySelector('canvas');
      this.g = this.canvas.getContext('2d');
      const size = () => {
        const box = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.w = box.width;
        this.h = box.height;
        this.canvas.width = box.width * dpr;
        this.canvas.height = box.height * dpr;
        this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      this.size = size;
      window.addEventListener('resize', size);
      const point = (e) => {
        const r = this.canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      let down = null;
      let lastTap = 0;
      let holdTimer = null;
      let sprinting = null;
      this.canvas.addEventListener('pointerdown', (e) => {
        this.canvas.setPointerCapture(e.pointerId);
        const [x, y] = point(e);
        this.touching = true;
        this.blob.tx = x;
        this.blob.ty = y;
        down = { x, y, t: performance.now(), moved: 0, lx: x, ly: y, lt: performance.now(), vx: 0, vy: 0 };
        buzz(4);
        holdTimer = setTimeout(() => {
          this.queue('sprint');
          sprinting = setInterval(() => this.queue('sprint'), 1200);
          buzz(12);
        }, 450);
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (!down) return;
        const [x, y] = point(e);
        const now = performance.now();
        const dt = Math.max(1, now - down.lt);
        down.vx = ((x - down.lx) / dt) * 1000;
        down.vy = ((y - down.ly) / dt) * 1000;
        down.moved += Math.hypot(x - down.lx, y - down.ly);
        down.lx = x;
        down.ly = y;
        down.lt = now;
        this.blob.tx = x;
        this.blob.ty = y;
        if (down.moved > 16) clearTimeout(holdTimer);
      });
      const up = () => {
        clearTimeout(holdTimer);
        clearInterval(sprinting);
        sprinting = null;
        if (!down) return;
        const speed = Math.hypot(down.vx, down.vy);
        const age = performance.now() - down.t;
        if (speed > 650 && down.moved > 24) {
          this.blob.vx = down.vx / 60;
          this.blob.vy = down.vy / 60;
          this.queue('throw');
          buzz(10);
        } else if (down.moved < 12 && age < 250) {
          const now = performance.now();
          if (now - lastTap < 300) this.queue('flip');
          else this.queue('jump');
          lastTap = now;
        }
        down = null;
        this.touching = false;
      };
      this.canvas.addEventListener('pointerup', up);
      this.canvas.addEventListener('pointercancel', up);
    },

    setCoins(score) {
      const target = Math.min(36, Math.floor(score / 80));
      while (this.coins.length < target) this.coins.push({ x: Math.random() * (this.w || 300), y: Math.random() * (this.h || 150), vx: 0, vy: 0, r: 7 + Math.random() * 4 });
      this.coins.length = target;
    },

    show(on) {
      if (!this.el) this.setup();
      this.el.hidden = !on;
      document.body.classList.toggle('pocket-on', on);
      if (on) {
        this.size();
        if (!this.blob.x) {
          this.blob.x = this.w / 2;
          this.blob.y = this.h / 2;
          this.blob.tx = this.blob.x;
          this.blob.ty = this.blob.y;
        }
        if (!this.running) {
          this.running = true;
          requestAnimationFrame(() => this.frame());
        }
      }
    },

    frame() {
      if (this.el.hidden) {
        this.running = false;
        return;
      }
      const { blob, coins, w, h, g } = this;
      if (this.touching) {
        blob.vx += (blob.tx - blob.x) * 0.16;
        blob.vy += (blob.ty - blob.y) * 0.16;
        blob.vx *= 0.68;
        blob.vy *= 0.68;
      } else {
        blob.vx *= 0.975;
        blob.vy *= 0.975;
      }
      blob.x += blob.vx;
      blob.y += blob.vy;
      const radius = 30;
      if (blob.x < radius || blob.x > w - radius) { blob.vx *= -0.7; blob.squash = 1; blob.x = Math.max(radius, Math.min(w - radius, blob.x)); }
      if (blob.y < radius || blob.y > h - radius) { blob.vy *= -0.7; blob.squash = 1; blob.y = Math.max(radius, Math.min(h - radius, blob.y)); }
      blob.squash *= 0.9;

      for (const c of coins) {
        const dx = c.x - blob.x;
        const dy = c.y - blob.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < radius + c.r + 6) {
          const push = (radius + c.r + 6 - d) * 0.28;
          c.vx += (dx / d) * push + blob.vx * 0.1;
          c.vy += (dy / d) * push + blob.vy * 0.1;
        }
        c.x += c.vx;
        c.y += c.vy;
        c.vx *= 0.93;
        c.vy *= 0.93;
        if (c.x < c.r) { c.x = c.r; c.vx *= -0.6; }
        if (c.x > w - c.r) { c.x = w - c.r; c.vx *= -0.6; }
        if (c.y < c.r) { c.y = c.r; c.vy *= -0.6; }
        if (c.y > h - c.r) { c.y = h - c.r; c.vy *= -0.6; }
      }

      g.clearRect(0, 0, w, h);
      for (const c of coins) {
        g.fillStyle = '#ffc23d';
        g.beginPath();
        g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#b9811a';
        g.lineWidth = 2;
        g.stroke();
      }
      // The blob stretches along its direction of travel and wobbles when it stops.
      const speed = Math.min(1, Math.hypot(blob.vx, blob.vy) / 26);
      const angle = Math.atan2(blob.vy, blob.vx);
      const color = getComputedStyle(document.documentElement).getPropertyValue('--me') || '#ff5a36';
      g.save();
      g.translate(blob.x, blob.y);
      g.rotate(angle);
      g.scale(1 + speed * 0.35 - blob.squash * 0.2, 1 - speed * 0.25 + blob.squash * 0.2);
      g.fillStyle = color;
      g.beginPath();
      const time = performance.now() / 300;
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const r = radius + Math.sin(a * 3 + time) * 1.8 + Math.sin(a * 5 - time * 1.4) * 1.1;
        const [x, y] = [Math.cos(a) * r, Math.sin(a) * r];
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.fill();
      g.fillStyle = 'rgba(255, 255, 255, 0.28)';
      g.beginPath();
      g.ellipse(-8, -10, 10, 6, -0.4, 0, Math.PI * 2);
      g.fill();
      g.restore();
      requestAnimationFrame(() => this.frame());
    },
  };

  function bindAll(v) {
    if (!document.getElementById('deck-card')) choose = null;
    bindDeck(v);
    bindSketch(v);
    bindFrisk(v);
    startFlick(v);
    runClocks(v);
    const pocketed = !!document.querySelector('.pocketed, .watch');
    if (Pocket.el || pocketed) Pocket.show(pocketed);
    if (pocketed) Pocket.setCoins(v.players[ME].score);
  }

  return {
    screens,
    afterRender: bindAll,
    click(button, d) {
      if (d.pick !== undefined) {
        const dir = { no: 'left', p1: 'left', yes: 'right', p2: 'right', maybe: 'up' }[d.pick];
        choose?.(d.pick, dir);
        return true;
      }
      if (d.vote !== undefined) {
        Show.send('answer', { value: d.vote });
        button.classList.add('pressed');
        return true;
      }
      if ('skip' in d) {
        Show.send('answer', { value: 'skip' });
        return true;
      }
      if ('call' in d) {
        Show.send('call');
        return true;
      }
      if (d.value !== undefined) {
        const number = Number(d.value);
        Show.send('answer', { value: Number.isNaN(number) ? d.value : number });
        button.classList.add('pressed');
        buzz(8);
        return true;
      }
      return false;
    },
  };
})();
