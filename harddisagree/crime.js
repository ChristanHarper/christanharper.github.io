// Partners in Crime: the rules. Runs on the big screen alongside engine.js.
//
// The players are the judges. Anything open to interpretation ends in a vote (the
// "cut"): matching votes pay out, and split votes start an argument by themselves.

(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory(require('../public/engine'));
  else factory(root.createShow);
}(typeof self !== 'undefined' ? self : this, (createShow) => {
  const TYPES = createShow.types;
  const LEAD_MS = 4000;
  const ARGUE_SECONDS = 45;
  const VERDICT_PATIENCE_MS = 120000;

  // Each QR code belongs to one person, whatever name they type in.
  const seat = (name) => ({ chris: 'p1', jasmine: 'p2' }[String(name).toLowerCase()]);
  const both = (step) => step.a.p1 !== undefined && step.a.p2 !== undefined;
  const isPoint = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n) && n >= 0 && n <= 1);

  // ---- The cut: both players vote, and only matching votes pay ----

  function openCut(step, options, prompt, hungPay = { p1: 0, p2: 0 }) {
    step.cut = { options, prompt, hungPay, round: 1 };
    step.stage = 'cut';
    step.a = {};
  }

  function potCut(step, pot, prompt, ctx) {
    const [one, two] = [ctx.nameOf('p1'), ctx.nameOf('p2')];
    const half = Math.round(pot / 2);
    openCut(step, [
      { id: 'p1', label: `${one} takes it`, pay: { p1: pot, p2: 0 } },
      { id: 'even', label: 'Split it', pay: { p1: half, p2: half } },
      { id: 'p2', label: `${two} takes it`, pay: { p1: 0, p2: pot } },
      { id: 'burn', label: 'Nobody earned that', pay: { p1: 0, p2: 0 } },
    ], prompt, { p1: Math.round(pot / 4), p2: Math.round(pot / 4) });
    step.cut.pot = pot;
  }

  function payCut(step, pay, label, hung, ctx) {
    ctx.award('p1', pay.p1);
    ctx.award('p2', pay.p2);
    step.r = { ...step.r, paid: { label, pay, hung } };
    step.a = {};
    step.stage = 'paid';
  }

  function voteCut(p, step, v, ctx) {
    const { cut } = step;
    if (!cut.options.some((o) => o.id === v)) return;
    step.a[p] = v;
    if (!both(step)) return;
    const { p1, p2 } = step.a;
    if (p1 === p2) {
      const option = cut.options.find((o) => o.id === p1);
      payCut(step, option.pay, option.label, false, ctx);
    } else if (cut.round === 1) {
      cut.split = { p1, p2 };
      startArgue(step, step.q?.argue || ARGUE_SECONDS, 'cut', ctx);
    } else {
      payCut(step, cut.hungPay, 'Deadlock', true, ctx);
    }
  }

  // ---- The argument: starts by itself, and both players can vote to skip it ----

  function startArgue(step, seconds, after, ctx) {
    const now = Date.now();
    step.stage = 'argue';
    step.a = {};
    step.arg = { startsAt: now + LEAD_MS, endsAt: now + LEAD_MS + seconds * 1000, after, first: ctx.coin() };
  }

  function endArgue(step, ctx) {
    const { after } = step.arg;
    step.a = {};
    step.stage = after;
    if (after === 'cut') step.cut.round = 2;
    if (after === 'pot') TYPES[step.t].afterArgue(step, ctx);
  }

  // Every step type gets the cut, the argument, and the call to the Informant.
  function define(type) {
    return {
      ...type,
      act(p, step, body, ctx) {
        if (body.type === 'call') {
          if (step.stage !== 'argue' && step.stage !== 'cut') return;
          const calls = ctx.G.calls || { p1: 0, p2: 0 };
          if (calls[p] >= 1) return;
          calls[p]++;
          ctx.G.calls = calls;
          step.called = true;
          ctx.ask(`ruling:${ctx.G.i}`);
          return;
        }
        if (step.stage === 'argue') {
          if (body.type === 'answer' && body.value === 'skip') {
            step.a[p] = 'skip';
            if (both(step)) endArgue(step, ctx);
          }
          return;
        }
        if (step.stage === 'cut') {
          if (body.type === 'answer' && step.a[p] === undefined) voteCut(p, step, body.value, ctx);
          return;
        }
        type.act?.(p, step, body, ctx);
      },
      tick(step, ctx) {
        if (step.stage === 'argue') {
          if (Date.now() < step.arg.endsAt) return false;
          endArgue(step, ctx);
          return true;
        }
        return !!type.tick?.(step, ctx);
      },
      canNext(step, ctx) {
        if (step.stage === 'paid') return true;
        return !!type.canNext?.(step, ctx);
      },
    };
  }

  const startClock = (step, seconds) => {
    const now = Date.now();
    step.startsAt = now + LEAD_MS;
    step.endsAt = step.startsAt + seconds * 1000;
  };
  const started = (step) => Date.now() >= step.startsAt;

  // ---- Swipe decks: quick taps, no typing ----

  TYPES.deck = define({
    build(step, raw, ctx) {
      step.stage = 'answer';
      step.q = { title: raw.title, mode: raw.mode, pot: raw.pot, cards: raw.cards.map((c) => c.text) };
      if (raw.mode === 'who') step.secret = { by: raw.cards.map((c) => seat(c.by)) };
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || step.a[p] !== undefined) return;
      const picks = body.value?.picks;
      const allowed = step.q.mode === 'menu' ? ['yes', 'maybe', 'no'] : ctx.PLAYERS;
      if (!Array.isArray(picks) || picks.length !== step.q.cards.length || !picks.every((x) => allowed.includes(x))) return;
      step.a[p] = picks;
      if (!both(step)) return;
      const { p1, p2 } = step.a;
      const { cards, mode } = step.q;
      if (mode === 'menu') {
        // Only overlap is ever shown or saved. One-sided answers are discarded here.
        const mutual = cards.filter((_, i) => p1[i] !== 'no' && p2[i] !== 'no' && (p1[i] === 'yes' || p2[i] === 'yes'));
        const each = step.q.pot * mutual.length;
        ctx.award('p1', each);
        ctx.award('p2', each);
        step.r = { mutual, each, total: cards.length };
        step.a = {};
        step.stage = 'reveal';
        return;
      }
      if (mode === 'who') {
        const { by } = step.secret;
        const score = { p1: 0, p2: 0 };
        const rows = cards.map((text, i) => {
          for (const x of ctx.PLAYERS) if (step.a[x][i] === by[i]) score[x]++;
          return { text, by: by[i], p1: p1[i], p2: p2[i] };
        });
        ctx.award('p1', score.p1 * step.q.pot);
        ctx.award('p2', score.p2 * step.q.pot);
        step.r = { rows, score };
        step.a = {};
        step.stage = 'reveal';
        return;
      }
      const rows = cards.map((text, i) => ({ text, p1: p1[i], p2: p2[i], match: p1[i] === p2[i] }));
      const matches = rows.filter((row) => row.match).length;
      step.r = { rows, matches, pot: matches * step.q.pot, contested: rows.filter((row) => !row.match).slice(0, 3).map((row) => row.text) };
      if (step.r.contested.length) startArgue(step, ARGUE_SECONDS, 'pot', ctx);
      else this.afterArgue(step, ctx);
    },
    afterArgue(step, ctx) {
      potCut(step, step.r.pot, 'Whose loot is it?', ctx);
    },
    canNext: (step) => step.stage === 'reveal',
  });

  // ---- Drawing: strokes travel as short strings and replay on the big screen ----

  TYPES.sketch = define({
    build(step) {
      step.stage = 'answer';
    },
    enter(step) {
      startClock(step, step.q.seconds || 45);
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || step.a[p] !== undefined) return;
      const d = body.value?.d;
      if (typeof d !== 'string' || d.length > 3700 || !/^[0-9a-z,]*$/.test(d)) return;
      step.a[p] = d;
      if (both(step)) this.finish(step, ctx);
    },
    finish(step, ctx) {
      step.r = { d: { p1: step.a.p1 ?? '', p2: step.a.p2 ?? '' } };
      potCut(step, step.q.pot, step.q.judge || 'Who got closer?', ctx);
    },
    tick(step, ctx) {
      if (step.stage !== 'answer' || Date.now() < step.endsAt + 5000) return false;
      this.finish(step, ctx);
      return true;
    },
  });

  // ---- A few words each, then the two of them rule on whether it's the same story ----

  TYPES.alibi = define({
    build(step) {
      step.stage = 'answer';
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || step.a[p] !== undefined) return;
      const text = ctx.cleanText(body.value?.text).slice(0, 40);
      if (!text) return;
      step.a[p] = text;
      if (!both(step)) return;
      step.r = { texts: { p1: step.a.p1, p2: step.a.p2 } };
      const pot = step.q.pot;
      const half = Math.round(pot / 2);
      openCut(step, [
        { id: 'same', label: `Same story. ${pot} each`, pay: { p1: pot, p2: pot } },
        { id: 'vibe', label: `Same vibe. ${half} each`, pay: { p1: half, p2: half } },
        { id: 'busted', label: 'Busted. Nothing', pay: { p1: 0, p2: 0 } },
      ], 'Did your stories match?');
    },
  });

  // ---- Small claims: each files a complaint, the argument starts, then they rule ----

  TYPES.claim = define({
    build(step) {
      step.stage = 'answer';
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || step.a[p] !== undefined) return;
      if (!Number.isInteger(body.value) || body.value < 0 || body.value >= step.q.options.length) return;
      step.a[p] = body.value;
      if (!both(step)) return;
      step.r = { picks: { p1: step.q.options[step.a.p1], p2: step.q.options[step.a.p2] } };
      startArgue(step, step.q.argue || 60, 'pot', ctx);
    },
    afterArgue(step, ctx) {
      potCut(step, step.q.pot, 'Who won the case?', ctx);
    },
  });

  // ---- The Informant's accusations, written live from tonight's answers ----

  TYPES.accuse = define({
    build(step) {
      step.stage = 'waiting';
    },
    enter(step, ctx) {
      const live = ctx.G.live?.accuse;
      const fresh = live?.length ? live.shift() : null;
      const item = fresh || step.q;
      const accused = seat(item.who) || ctx.coin();
      const victim = ctx.other(accused);
      const pot = step.q.pot;
      step.r = { text: item.text, accused, live: !!fresh };
      openCut(step, [
        { id: 'sustained', label: `Guilty. ${ctx.nameOf(accused)} pays ${ctx.nameOf(victim)} ${pot}`, pay: { [accused]: -pot, [victim]: pot } },
        { id: 'overruled', label: `Overruled. The Informant pays you ${Math.round(pot / 2)} each`, pay: { p1: Math.round(pot / 2), p2: Math.round(pot / 2) } },
      ], 'Is it true?');
    },
  });

  // ---- Dial: one sees the number, says one thing out loud, the other slides ----

  TYPES.dial = define({
    build(step, raw, ctx) {
      step.stage = 'answer';
      step.giver = seat(raw.giver) || ctx.coin();
      step.secret = { target: 5 + ctx.randomInt(91) };
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || p === step.giver) return;
      if (!Number.isInteger(body.value) || body.value < 0 || body.value > 100) return;
      const { target } = step.secret;
      const diff = Math.abs(body.value - target);
      const pts = diff <= 5 ? 200 : diff <= 12 ? 100 : diff <= 22 ? 50 : 0;
      ctx.award('p1', pts);
      ctx.award('p2', pts);
      step.r = { target, guess: body.value, diff, pts };
      step.stage = 'reveal';
    },
    canNext: (step) => step.stage === 'reveal',
    view(step, role, view) {
      if (role === step.giver && step.stage === 'answer') view.priv = { target: step.secret.target };
    },
  });

  // ---- Charades: only the actor's phone shows the word ----

  TYPES.charades = define({
    build(step, raw, ctx) {
      step.stage = 'ready';
      step.actor = seat(raw.actor) || ctx.coin();
      step.q = { title: raw.title, seconds: raw.seconds, each: raw.each };
      step.secret = { words: ctx.pick(raw.words, raw.words.length) };
      step.got = 0;
    },
    canNext: (step) => step.stage === 'ready' || step.stage === 'reveal',
    next(step) {
      if (step.stage !== 'ready') return false;
      step.stage = 'play';
      startClock(step, step.q.seconds);
      step.secret.i = 0;
      step.secret.got = [];
      step.secret.missed = [];
      return true;
    },
    act(p, step, body, ctx) {
      if (step.stage !== 'play' || p !== step.actor || !started(step) || body.type !== 'answer') return;
      if (body.value !== 'got' && body.value !== 'skip') return;
      const { secret } = step;
      (body.value === 'got' ? secret.got : secret.missed).push(secret.words[secret.i]);
      secret.i++;
      step.got = secret.got.length;
      if (secret.i >= secret.words.length) this.finish(step, ctx);
    },
    finish(step, ctx) {
      const pts = step.secret.got.length * step.q.each;
      ctx.award('p1', pts);
      ctx.award('p2', pts);
      step.r = { got: step.secret.got, missed: step.secret.missed, pts };
      step.stage = 'reveal';
    },
    tick(step, ctx) {
      if (step.stage !== 'play' || Date.now() < step.endsAt) return false;
      TYPES.charades.finish(step, ctx);
      return true;
    },
    view(step, role, view) {
      if (step.stage === 'play' && role === step.actor) view.priv = { word: step.secret.words[step.secret.i] };
    },
  });

  // ---- The panel: one sees the wires, the other has the manual, and they have to talk ----

  const COLORS = ['red', 'blue', 'yellow', 'white', 'black'];
  const count = (wires, color) => wires.filter((w) => w === color).length;
  const RULES = [
    { text: 'If there are no red wires, cut the 2nd wire.', test: (w) => !count(w, 'red'), cut: () => 1 },
    { text: 'If the last wire is white, cut the last wire.', test: (w) => w[w.length - 1] === 'white', cut: (w) => w.length - 1 },
    { text: 'If there is more than one blue wire, cut the last blue wire.', test: (w) => count(w, 'blue') > 1, cut: (w) => w.lastIndexOf('blue') },
    { text: 'If there are exactly two yellow wires, cut the first yellow wire.', test: (w) => count(w, 'yellow') === 2, cut: (w) => w.indexOf('yellow') },
    { text: 'If the first wire is black, cut the 3rd wire.', test: (w) => w[0] === 'black', cut: () => 2 },
    { text: 'If there are more red wires than blue wires, cut the first red wire.', test: (w) => count(w, 'red') > count(w, 'blue'), cut: (w) => w.indexOf('red') },
    { text: 'If there are no white wires, cut the last wire.', test: (w) => !count(w, 'white'), cut: (w) => w.length - 1 },
  ];

  function makePanel(ctx, agent) {
    const wires = Array.from({ length: 4 + ctx.randomInt(3) }, () => COLORS[ctx.randomInt(COLORS.length)]);
    const rules = ctx.pick(RULES, 4);
    const hit = rules.find((rule) => rule.test(wires));
    return { agent, wires, rules: [...rules.map((rule) => rule.text), 'Otherwise, cut the 1st wire.'], answer: hit ? hit.cut(wires) : 0 };
  }

  TYPES.wires = define({
    build(step, raw, ctx) {
      step.stage = 'ready';
      const first = ctx.coin();
      step.q = { title: raw.title, seconds: raw.seconds, each: raw.each, panels: raw.panels };
      step.secret = { panels: Array.from({ length: raw.panels }, (_, i) => makePanel(ctx, i % 2 ? ctx.other(first) : first)), i: 0 };
      step.solved = 0;
      step.strikes = 0;
    },
    canNext: (step) => step.stage === 'ready' || step.stage === 'reveal',
    next(step) {
      if (step.stage !== 'ready') return false;
      step.stage = 'play';
      startClock(step, step.q.seconds);
      step.agent = step.secret.panels[0].agent;
      return true;
    },
    act(p, step, body, ctx) {
      if (step.stage !== 'play' || !started(step) || body.type !== 'answer') return;
      const panel = step.secret.panels[step.secret.i];
      if (p !== panel.agent || !Number.isInteger(body.value)) return;
      if (body.value !== panel.answer) {
        step.strikes++;
        step.endsAt -= 10000;
        return;
      }
      step.solved++;
      step.secret.i++;
      if (step.secret.i >= step.secret.panels.length) TYPES.wires.finish(step, ctx);
      else step.agent = step.secret.panels[step.secret.i].agent;
    },
    finish(step, ctx) {
      const pts = step.solved * step.q.each;
      ctx.award('p1', pts);
      ctx.award('p2', pts);
      step.r = { solved: step.solved, panels: step.q.panels, strikes: step.strikes, pts };
      step.stage = 'reveal';
    },
    tick(step, ctx) {
      if (step.stage !== 'play' || Date.now() < step.endsAt) return false;
      TYPES.wires.finish(step, ctx);
      return true;
    },
    view(step, role, view) {
      if (step.stage !== 'play') return;
      const panel = step.secret.panels[step.secret.i];
      view.priv = role === panel.agent ? { wires: panel.wires, n: step.secret.i } : role !== 'host' ? { rules: panel.rules, n: step.secret.i } : undefined;
    },
  });

  // ---- The fuse: say one out loud, pass it on, and don't be holding it at the end ----

  TYPES.fuse = define({
    build(step, raw, ctx) {
      step.stage = 'ready';
      step.holder = ctx.coin();
      step.secret = { burn: 20000 + ctx.randomInt(25000) };
      step.passes = 0;
    },
    canNext: (step) => step.stage === 'ready' || step.stage === 'reveal',
    next(step) {
      if (step.stage !== 'ready') return false;
      step.stage = 'play';
      step.startsAt = Date.now() + LEAD_MS;
      step.secret.boomAt = step.startsAt + step.secret.burn;
      return true;
    },
    act(p, step, body, ctx) {
      if (step.stage !== 'play' || !started(step) || body.type !== 'answer' || p !== step.holder) return;
      step.holder = ctx.other(p);
      step.passes++;
    },
    tick(step, ctx) {
      if (step.stage !== 'play' || Date.now() < step.secret.boomAt) return false;
      const loser = step.holder;
      ctx.award(loser, -step.q.pot);
      ctx.award(ctx.other(loser), step.q.pot);
      step.r = { loser, pot: step.q.pot, passes: step.passes };
      step.stage = 'reveal';
      return true;
    },
  });

  // ---- The safe: the pot climbs until someone grabs it or the alarm goes off ----

  const potAt = (step, now) => Math.max(0, Math.floor((now - step.startsAt) / 250) * 10);

  TYPES.safe = define({
    build(step, raw, ctx) {
      step.stage = 'ready';
      step.secret = { run: 6000 + ctx.randomInt(16000) };
    },
    canNext: (step) => step.stage === 'ready' || step.stage === 'reveal',
    next(step) {
      if (step.stage !== 'ready') return false;
      step.stage = 'play';
      step.startsAt = Date.now() + LEAD_MS;
      step.secret.alarmAt = step.startsAt + step.secret.run;
      return true;
    },
    act(p, step, body, ctx) {
      if (step.stage !== 'play' || !started(step) || body.type !== 'answer') return;
      if (Date.now() >= step.secret.alarmAt) return;
      const pot = potAt(step, Date.now());
      ctx.award(p, pot);
      step.r = { by: p, pot };
      step.stage = 'reveal';
    },
    tick(step) {
      if (step.stage !== 'play' || Date.now() < step.secret.alarmAt) return false;
      step.r = { boom: true, pot: potAt(step, step.secret.alarmAt) };
      step.stage = 'reveal';
      return true;
    },
  });

  // ---- The auction: sealed bids for real favors ----

  TYPES.auction = define({
    build(step) {
      step.stage = 'answer';
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || step.a[p] !== undefined) return;
      const v = body.value;
      if (!Number.isInteger(v) || v < 0 || v > ctx.G.players[p].score) return;
      step.a[p] = v;
      if (!both(step)) return;
      const bids = { p1: step.a.p1, p2: step.a.p2 };
      const winner = bids.p1 === bids.p2 ? null : bids.p1 > bids.p2 ? 'p1' : 'p2';
      if (winner) {
        ctx.award(winner, -bids[winner]);
        ctx.G.favors = [...(ctx.G.favors || []), { lot: step.q.lot, winner }];
      }
      step.r = { bids, winner };
      step.a = {};
      step.stage = 'reveal';
    },
    canNext: (step) => step.stage === 'reveal',
    view(step, role, view, ctx) {
      if (role !== 'host') view.priv = { max: ctx.G.players[role].score };
    },
  });

  // ---- Split or steal: the Informant predicts, they talk, then they decide ----

  TYPES.splitsteal = define({
    build(step) {
      step.stage = 'waiting';
    },
    enter(step, ctx) {
      step.prediction = ctx.G.live?.prediction || step.q.fallback;
      startArgue(step, step.q.argue || 45, 'answer', ctx);
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || step.a[p] !== undefined) return;
      if (body.value !== 'split' && body.value !== 'steal') return;
      step.a[p] = body.value;
      if (!both(step)) return;
      const { p1, p2 } = step.a;
      const { pot } = step.q;
      const pay = { p1: 0, p2: 0 };
      if (p1 === 'split' && p2 === 'split') { pay.p1 = Math.round(pot / 2); pay.p2 = pay.p1; }
      else if (p1 === 'steal' && p2 === 'steal') { pay.p1 = -Math.round(pot / 4); pay.p2 = pay.p1; }
      else pay[p1 === 'steal' ? 'p1' : 'p2'] = pot;
      ctx.award('p1', pay.p1);
      ctx.award('p2', pay.p2);
      step.r = { picks: { p1, p2 }, pay };
      step.a = {};
      step.stage = 'reveal';
    },
    canNext: (step) => step.stage === 'reveal',
  });

  // ---- The frisk: tap a body map, guess theirs, and rule on how close it came ----

  TYPES.frisk = define({
    build(step) {
      step.stage = 'answer';
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'answer' || step.a[p] !== undefined) return;
      if (!isPoint(body.value?.mine) || !isPoint(body.value?.guess)) return;
      step.a[p] = { mine: body.value.mine, guess: body.value.guess };
      if (!both(step)) return;
      step.r = { pins: { p1: step.a.p1, p2: step.a.p2 } };
      const { pot } = step.q;
      const [one, two] = [ctx.nameOf('p1'), ctx.nameOf('p2')];
      openCut(step, [
        { id: 'both', label: `Both close. ${pot} each`, pay: { p1: pot, p2: pot } },
        { id: 'p1', label: `Only ${one} knew. ${pot}`, pay: { p1: pot, p2: 0 } },
        { id: 'p2', label: `Only ${two} knew. ${pot}`, pay: { p1: 0, p2: pot } },
        { id: 'none', label: 'Neither. Study harder', pay: { p1: 0, p2: 0 } },
      ], 'Who knew?');
    },
  });

  // ---- Collateral: higher or lower, and losing costs loot or clothing ----

  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  TYPES.hilo = define({
    build(step, raw, ctx) {
      step.stage = 'answer';
      const card = 2 + ctx.randomInt(9);
      let after = ctx.randomInt(RANKS.length);
      if (after === card) after = (after + 1) % RANKS.length;
      step.q = { title: raw.title, card: RANKS[card], pot: raw.pot, cost: raw.cost };
      step.secret = { isHigher: after > card, after: RANKS[after] };
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.a[p] !== undefined) return;
      if (step.stage === 'answer') {
        if (body.value !== 'hi' && body.value !== 'lo') return;
        step.a[p] = body.value;
        if (!both(step)) return;
        const right = {};
        for (const x of ctx.PLAYERS) {
          right[x] = (step.a[x] === 'hi') === step.secret.isHigher;
          if (right[x]) ctx.award(x, step.q.pot);
        }
        step.r = { after: step.secret.after, right, forfeits: {} };
        step.a = {};
        step.stage = right.p1 && right.p2 ? 'reveal' : 'forfeit';
        return;
      }
      if (step.stage === 'forfeit') {
        if (step.r.right[p] || (body.value !== 'clothes' && body.value !== 'cash')) return;
        step.a[p] = body.value;
        step.r.forfeits[p] = body.value;
        if (body.value === 'cash') ctx.award(p, -step.q.cost);
        if (ctx.PLAYERS.every((x) => step.r.right[x] || step.a[x] !== undefined)) {
          step.a = {};
          step.stage = 'reveal';
        }
      }
    },
    canNext: (step) => step.stage === 'reveal',
  });

  // ---- Cold read: terrible romantic prose, performed with a straight face ----

  TYPES.coldread = define({
    build(step, raw, ctx) {
      step.stage = 'ready';
      step.reader = seat(raw.reader) || ctx.coin();
    },
    enter(step, ctx) {
      const live = ctx.G.live?.lines;
      if (live?.length) step.q = { ...step.q, line: live.shift(), live: true };
    },
    canNext: (step) => step.stage === 'ready',
    next(step) {
      if (step.stage !== 'ready') return false;
      step.stage = 'play';
      startClock(step, 20);
      return true;
    },
    act(p, step, body, ctx) {
      if (step.stage === 'play' && body.type === 'answer' && p === step.reader) TYPES.coldread.finish(step, ctx);
    },
    finish(step, ctx) {
      const { reader } = step;
      const partner = ctx.other(reader);
      const pot = step.q.pot;
      step.r = { line: step.q.line };
      openCut(step, [
        { id: 'laughed', label: `${ctx.nameOf(partner)} cracked. ${ctx.nameOf(reader)} +${pot}`, pay: { [reader]: pot, [partner]: 0 } },
        { id: 'held', label: `${ctx.nameOf(partner)} held it. ${ctx.nameOf(partner)} +${pot}`, pay: { [reader]: 0, [partner]: pot } },
        { id: 'hot', label: `Wait, that was hot. ${pot} each`, pay: { [reader]: pot, [partner]: pot } },
      ], 'Well?');
    },
    tick(step, ctx) {
      if (step.stage !== 'play' || Date.now() < step.endsAt) return false;
      TYPES.coldread.finish(step, ctx);
      return true;
    },
  });

  // ---- Dares: either person can pass, for free, and nobody learns who did ----

  TYPES.dare = define({
    build(step, raw, ctx) {
      step.stage = 'offer';
      step.target = seat(raw.target) || ctx.coin();
      const target = ctx.nameOf(step.target);
      const partner = ctx.nameOf(ctx.other(step.target));
      step.q = { ...raw, q: raw.q.replace(/\{T\}/g, target).replace(/\{O\}/g, partner) };
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.a[p] !== undefined) return;
      if (step.stage === 'offer') {
        if (body.value === 'pass') {
          step.r = { passed: true };
          step.a = {};
          step.stage = 'reveal';
          return;
        }
        if (body.value !== 'do') return;
        step.a[p] = 'do';
        if (both(step)) {
          step.a = {};
          step.stage = 'doing';
          startClock(step, step.q.seconds || 30);
        }
      } else if (step.stage === 'doing' && body.value === 'skip') {
        step.a[p] = 'skip';
        if (both(step)) TYPES.dare.finish(step, ctx);
      }
    },
    finish(step, ctx) {
      ctx.award(step.target, step.q.pot);
      step.r = { done: true, pot: step.q.pot };
      step.a = {};
      step.stage = 'reveal';
    },
    tick(step, ctx) {
      if (step.stage !== 'doing' || Date.now() < step.endsAt) return false;
      TYPES.dare.finish(step, ctx);
      return true;
    },
    canNext: (step) => step.stage === 'reveal',
  });

  // ---- Tonight's job: the Informant proposes, whoever's leading chooses ----

  TYPES.job = define({
    build(step) {
      step.stage = 'waiting';
    },
    enter(step, ctx) {
      const { p1, p2 } = ctx.G.players;
      step.chooser = p1.score === p2.score ? ctx.coin() : p1.score > p2.score ? 'p1' : 'p2';
      step.offers = ctx.G.live?.job?.length === 3 ? ctx.G.live.job : step.q.offers;
      step.liveOffers = step.offers !== step.q.offers;
      step.stage = 'answer';
    },
    act(p, step, body) {
      if (body.type !== 'answer' || step.stage !== 'answer' || p !== step.chooser) return;
      if (!Number.isInteger(body.value) || !step.offers[body.value]) return;
      step.r = { pick: step.offers[body.value] };
      step.stage = 'reveal';
    },
    canNext: (step) => step.stage === 'reveal',
  });

  // ---- The ending: a game while the verdict gets written, then the verdict ----

  TYPES.getaway = define({
    build(step) {
      step.stage = 'play';
    },
    enter(step, ctx) {
      startClock(step, 25);
      ctx.ask('verdict');
    },
    act(p, step, body, ctx) {
      if (body.type !== 'answer' || step.stage !== 'play' || step.a[p] !== undefined) return;
      if (!Number.isInteger(body.value) || body.value < 0) return;
      step.a[p] = Math.min(body.value, 120);
      if (both(step) && Date.now() >= step.endsAt) TYPES.getaway.finish(step, ctx);
    },
    finish(step, ctx) {
      const coins = { p1: step.a.p1 ?? 0, p2: step.a.p2 ?? 0 };
      ctx.award('p1', coins.p1 * 10);
      ctx.award('p2', coins.p2 * 10);
      step.r = { coins };
      step.a = {};
      step.stage = 'reveal';
    },
    tick(step, ctx) {
      if (step.stage !== 'play' || Date.now() < step.endsAt + 4000) return false;
      TYPES.getaway.finish(step, ctx);
      return true;
    },
    canNext: (step) => step.stage === 'reveal',
  });

  TYPES.debrief = define({
    build(step) {
      step.stage = 'hold';
    },
    enter(step) {
      step.heldAt = Date.now();
    },
    tick(step, ctx) {
      const verdict = ctx.G.live?.verdict;
      if (verdict && !step.r) {
        step.r = { verdict };
        step.stage = 'show';
        return true;
      }
      if (step.stage === 'hold' && Date.now() - step.heldAt > VERDICT_PATIENCE_MS) {
        step.stage = 'late';
        return true;
      }
      return false;
    },
    canNext: (step) => step.stage === 'show' || step.stage === 'late',
  });

  return TYPES;
}));
