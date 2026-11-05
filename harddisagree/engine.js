// Hard Disagree: the rules of the show. Runs inside server.js for the Wi-Fi
// version and inside the big-screen browser tab for the online version.
// Answers stay private here: viewFor() never exposes them before the reveal.

(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.createShow = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const PLAYERS = ['p1', 'p2'];
  const other = (p) => (p === 'p1' ? 'p2' : 'p1');

  const DEBATE_SECONDS = 60;
  const MAX_TEXT = 280;
  const FIFTHS = 2;

  const ROUNDS = [
    { key: 'mind', title: 'Mind Games', count: 4, rules: 'Answer for yourself, then guess what your partner picked. 100 points for every correct guess.' },
    { key: 'finger', title: 'Point the Finger', count: 4, rules: 'Secretly point at who it is. Agree and you each get 50. Disagree and you argue it out for 60 seconds, then choose: stand your ground or concede. Concede alone and they get 200, you get 50. Both concede, 100 each. Both stand firm? Nobody gets anything.' },
    { key: 'gap', title: 'Mind the Gap', count: 4, rules: 'Rate it from 0 to 10 in secret. Land on the same number for 150 points each, within 1 for 100, within 2 for 50. Further apart than that and you owe each other an explanation.' },
    { key: 'receipts', title: 'Receipts', count: 4, rules: 'One of you tells the truth, the other guesses, and the truth-teller judges: up to 200 points. You each get two chances to Plead the Fifth, but it hands your partner 100 points.' },
    { key: 'soft', title: 'Soft Spot', count: 3, rules: 'Real answers now. Write yours, read theirs, then give their answer one to three hearts. Each heart is worth 50 points.' },
    { key: 'final', title: 'All or Nothing', count: 1, rules: 'Secretly wager your points, then try to pick the same answer without saying a word. Match and you both gain your wager. Miss and you both lose it.' },
  ];

  const randomInt = (n) => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % n;

  return function createShow(BANK, saved) {
    let G = saved;

    function newGame(keepPlayers) {
      const seat = (p) => ({
        name: keepPlayers ? G.players[p].name : '',
        joined: keepPlayers ? G.players[p].joined : false,
        score: 0,
        fifths: FIFTHS,
      });
      G = {
        players: { p1: seat('p1'), p2: seat('p2') },
        steps: [{ t: 'lobby', stage: 'wait' }],
        i: 0,
        stats: {
          hits: { p1: 0, p2: 0 }, guesses: 0,
          agrees: 0, fingers: 0,
          stands: { p1: 0, p2: 0 }, concedes: { p1: 0, p2: 0 },
          closeGaps: 0, gaps: 0, biggestGap: null,
          hearts: { p1: 0, p2: 0 }, fifths: { p1: 0, p2: 0 }, match: false,
        },
      };
    }

    const pick = (list, n) => {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, n);
    };
    const coin = () => (randomInt(2) ? 'p1' : 'p2');
    const fill = (text, map) => text.replace(/\{(\w)\}/g, (_, k) => map[k] ?? '');
    const nameOf = (p) => G.players[p].name;

    function buildSteps() {
      const steps = [{ t: 'welcome', stage: 'show' }];
      let hotSeat = coin();
      ROUNDS.forEach((round, r) => {
        steps.push({ t: 'round', stage: 'show', round: r });
        pick(BANK[round.key], round.count).forEach((raw, n) => {
          const step = { t: round.key, stage: 'answer', a: {}, n: n + 1, of: round.count, roundTitle: round.title };
          if (round.key === 'mind') step.q = raw;
          if (round.key === 'finger') step.q = { q: raw };
          if (round.key === 'gap') {
            const first = coin();
            step.q = { ...raw, q: fill(raw.q, { A: nameOf(first), B: nameOf(other(first)) }) };
          }
          if (round.key === 'receipts') {
            step.subject = hotSeat;
            step.q = { q: fill(raw, { S: nameOf(hotSeat), O: nameOf(other(hotSeat)) }) };
            hotSeat = other(hotSeat);
          }
          if (round.key === 'soft') step.q = { q: raw };
          if (round.key === 'final') {
            step.q = raw;
            step.stage = 'wager';
          }
          steps.push(step);
        });
      });
      steps.push(
        { t: 'winner', stage: 'show' },
        { t: 'wheel', stage: 'spin', prizes: pick(BANK.prizes, BANK.prizes.length) },
        { t: 'closing', stage: 'answer', a: {} },
        { t: 'credits', stage: 'show' },
      );
      return steps;
    }

    const current = () => G.steps[G.i];
    const award = (p, n) => { G.players[p].score = Math.max(0, G.players[p].score + n); };
    const bothIn = (step) => step.a.p1 !== undefined && step.a.p2 !== undefined;

    function leader() {
      const { p1, p2 } = G.players;
      if (p1.score === p2.score) return null;
      return p1.score > p2.score ? 'p1' : 'p2';
    }

    function maxWager(p) {
      return Math.max(G.players[p].score, 200);
    }

    // ---- Resolving a stage once both players have answered ----

    const RESOLVE = {
      mind(step) {
        step.r = { answers: {}, guesses: {}, right: {} };
        G.stats.guesses += 2;
        for (const p of PLAYERS) {
          step.r.answers[p] = step.a[p].mine;
          step.r.guesses[p] = step.a[p].guess;
          step.r.right[p] = step.a[p].guess === step.a[other(p)].mine;
          if (step.r.right[p]) { award(p, 100); G.stats.hits[p]++; }
        }
        step.stage = 'reveal';
      },
      finger(step) {
        if (step.stage === 'answer') {
          const agree = step.a.p1 === step.a.p2;
          step.r = { picks: { p1: step.a.p1, p2: step.a.p2 }, agree };
          G.stats.fingers++;
          if (agree) { G.stats.agrees++; award('p1', 50); award('p2', 50); }
          step.stage = 'reveal';
          return;
        }
        const stand = { p1: step.a.p1, p2: step.a.p2 };
        const pts = { p1: 0, p2: 0 };
        for (const p of PLAYERS) G.stats[stand[p] ? 'stands' : 'concedes'][p]++;
        if (!stand.p1 && !stand.p2) { pts.p1 = 100; pts.p2 = 100; }
        if (stand.p1 !== stand.p2) {
          const holdout = stand.p1 ? 'p1' : 'p2';
          pts[holdout] = 200;
          pts[other(holdout)] = 50;
        }
        award('p1', pts.p1);
        award('p2', pts.p2);
        step.r = { ...step.r, stand, pts };
        step.stage = 'verdict';
      },
      gap(step) {
        const gap = Math.abs(step.a.p1 - step.a.p2);
        const pts = [150, 100, 50][gap] ?? 0;
        award('p1', pts);
        award('p2', pts);
        G.stats.gaps++;
        if (gap <= 1) G.stats.closeGaps++;
        if (!G.stats.biggestGap || gap > G.stats.biggestGap.gap) {
          G.stats.biggestGap = { gap, q: step.q.q };
        }
        const first = step.a.p1 === step.a.p2 ? null : step.a.p1 > step.a.p2 ? 'p1' : 'p2';
        step.r = { values: { p1: step.a.p1, p2: step.a.p2 }, gap, pts, first };
        step.stage = 'reveal';
      },
      receipts(step) {
        const guesser = other(step.subject);
        step.r = { truth: step.a[step.subject].text, guess: step.a[guesser]?.text ?? null, fifth: !!step.a[step.subject].fifth };
        if (step.r.fifth) {
          step.r.pts = 100;
          award(guesser, 100);
          step.stage = 'verdict';
        } else {
          step.stage = 'reveal';
        }
      },
      soft(step) {
        step.r = { texts: { p1: step.a.p1.text ?? null, p2: step.a.p2.text ?? null } };
        step.a = {};
        step.stage = 'reveal';
        if (step.r.texts.p1 === null && step.r.texts.p2 === null) {
          step.r.hearts = { p1: 0, p2: 0 };
          step.stage = 'verdict';
        }
      },
      final(step) {
        if (step.stage === 'wager') {
          step.wagers = { p1: step.a.p1, p2: step.a.p2 };
          step.a = {};
          step.stage = 'answer';
          return;
        }
        const match = step.a.p1 === step.a.p2;
        const sign = match ? 1 : -1;
        award('p1', sign * step.wagers.p1);
        award('p2', sign * step.wagers.p2);
        G.stats.match = match;
        step.r = { picks: { p1: step.a.p1, p2: step.a.p2 }, wagers: step.wagers, match };
        step.stage = 'reveal';
      },
      closing(step) {
        step.r = { texts: { p1: step.a.p1, p2: step.a.p2 } };
        step.stage = 'reveal';
      },
    };

    function resolveIfReady(step) {
      if (!bothIn(step)) return;
      RESOLVE[step.t](step);
      if (step.stage === 'answer' || step.stage === 'wager') return;
      if (step.t !== 'soft') step.a = {};
    }

    // ---- Player actions ----

    const cleanText = (v) => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : '');
    const isIndex = (v, list) => Number.isInteger(v) && v >= 0 && v < list.length;

    function submit(p, step, body) {
      if (step.a?.[p] !== undefined) return;
      const v = body.value;

      if (step.t === 'mind' && step.stage === 'answer') {
        if (!isIndex(v?.mine, step.q.options) || !isIndex(v?.guess, step.q.options)) return;
        step.a[p] = { mine: v.mine, guess: v.guess };
      } else if (step.t === 'finger' && step.stage === 'answer') {
        if (!PLAYERS.includes(v)) return;
        step.a[p] = v;
      } else if (step.t === 'finger' && step.stage === 'standoff') {
        if (typeof v !== 'boolean') return;
        step.a[p] = v;
      } else if (step.t === 'gap' && step.stage === 'answer') {
        if (!Number.isInteger(v) || v < 0 || v > 10) return;
        step.a[p] = v;
      } else if (step.t === 'receipts' && step.stage === 'answer') {
        if (v?.fifth) {
          if (p !== step.subject || G.players[p].fifths < 1) return;
          G.players[p].fifths--;
          G.stats.fifths[p]++;
          step.a[p] = { fifth: true };
          RESOLVE.receipts(step);
          step.a = {};
          return;
        }
        const text = cleanText(v?.text);
        if (!text) return;
        step.a[p] = { text };
      } else if (step.t === 'soft' && step.stage === 'answer') {
        if (v?.fifth) {
          if (G.players[p].fifths < 1) return;
          G.players[p].fifths--;
          G.stats.fifths[p]++;
          step.a[p] = { fifth: true };
        } else {
          const text = cleanText(v?.text);
          if (!text) return;
          step.a[p] = { text };
        }
      } else if (step.t === 'final' && step.stage === 'wager') {
        if (!Number.isInteger(v) || v < 0 || v > maxWager(p)) return;
        step.a[p] = v;
      } else if (step.t === 'final' && step.stage === 'answer') {
        if (!isIndex(v, step.q.options)) return;
        step.a[p] = v;
      } else if (step.t === 'closing' && step.stage === 'answer') {
        const text = cleanText(v?.text);
        if (!text) return;
        step.a[p] = text;
      } else {
        return;
      }
      resolveIfReady(step);
    }

    function judge(p, step, body) {
      if (step.t !== 'receipts' || step.stage !== 'reveal' || p !== step.subject) return;
      if (![0, 100, 200].includes(body.value)) return;
      step.r.pts = body.value;
      award(other(p), body.value);
      step.stage = 'verdict';
    }

    function heart(p, step, body) {
      if (step.t !== 'soft' || step.stage !== 'reveal') return;
      if (step.a[p] !== undefined || step.r.texts[other(p)] === null) return;
      if (![1, 2, 3].includes(body.value)) return;
      step.a[p] = body.value;
      const needed = PLAYERS.filter((x) => step.r.texts[other(x)] !== null);
      if (needed.every((x) => step.a[x] !== undefined)) {
        step.r.hearts = { p1: step.a.p1 ?? 0, p2: step.a.p2 ?? 0 };
        // Hearts are earned by the person whose answer received them.
        award('p2', 50 * step.r.hearts.p1);
        award('p1', 50 * step.r.hearts.p2);
        G.stats.hearts.p2 += step.r.hearts.p1;
        G.stats.hearts.p1 += step.r.hearts.p2;
        step.a = {};
        step.stage = 'verdict';
      }
    }

    function spin(p, step) {
      if (step.t !== 'wheel' || step.stage !== 'spin') return;
      const lead = leader();
      if (lead && lead !== p) return;
      step.result = randomInt(step.prizes.length);
      step.stage = 'result';
    }

    function canNext(step) {
      if (step.t === 'lobby') return G.players.p1.joined && G.players.p2.joined;
      if (['welcome', 'round', 'winner'].includes(step.t)) return true;
      if (['mind', 'gap', 'final', 'closing'].includes(step.t)) return step.stage === 'reveal';
      if (step.t === 'finger') return ['reveal', 'debate', 'verdict'].includes(step.stage);
      if (['receipts', 'soft'].includes(step.t)) return step.stage === 'verdict';
      if (step.t === 'wheel') return step.stage === 'result';
      return false;
    }

    function next(step) {
      if (!canNext(step)) return;
      if (step.t === 'lobby') {
        G.steps = buildSteps();
        G.i = 0;
        return;
      }
      if (step.t === 'finger' && step.stage === 'reveal' && !step.r.agree) {
        step.stage = 'debate';
        step.r.endsAt = Date.now() + DEBATE_SECONDS * 1000;
        step.r.first = coin();
        step.r.opener = pick(BANK.debateOpeners, 1)[0];
        return;
      }
      if (step.t === 'finger' && step.stage === 'debate') {
        step.stage = 'standoff';
        step.a = {};
        return;
      }
      G.i = Math.min(G.i + 1, G.steps.length - 1);
    }

    function report() {
      const s = G.stats;
      const earned = s.hits.p1 + s.hits.p2 + s.agrees + s.closeGaps + (s.match ? 1 : 0);
      const possible = s.guesses + s.fingers + s.gaps + 1;
      return {
        sync: Math.round((earned / possible) * 100),
        agrees: s.agrees,
        fights: s.fingers - s.agrees,
        stands: s.stands,
        concedes: s.concedes,
        biggestGap: s.biggestGap,
        hearts: s.hearts,
        fifths: s.fifths,
        hits: s.hits,
      };
    }

    // ---- What each screen is allowed to see ----

    function viewFor(role, isOnline) {
      const step = current();
      const { a, wagers, ...shown } = step;
      const view = {
        role,
        now: Date.now(),
        i: G.i,
        total: G.steps.length,
        players: {
          p1: { ...G.players.p1, online: isOnline('p1') },
          p2: { ...G.players.p2, online: isOnline('p2') },
        },
        step: shown,
        locked: { p1: a?.p1 !== undefined, p2: a?.p2 !== undefined },
        canNext: canNext(step),
        leader: leader(),
      };
      if (step.t === 'round') view.round = { ...ROUNDS[step.round], number: step.round + 1, count: ROUNDS.length };
      if (step.t === 'credits') view.report = report();
      if (role !== 'host') {
        view.mine = a?.[role];
        view.maxWager = maxWager(role);
        if (wagers) view.myWager = wagers[role];
      }
      return view;
    }

    function handle(body) {
      const { role: p, type } = body;
      if (type === 'restart') {
        if (p === 'host') newGame(true);
        return;
      }
      // Every action names the screen it was pressed on, so a double-tap or both
      // phones pressing at once can't skip past something nobody has seen yet.
      const step = current();
      if (type !== 'join' && (body.i !== G.i || body.stage !== step.stage)) return;

      if (type === 'next') { next(step); return; }
      if (p === 'host') return;
      if (type === 'join') {
        const name = cleanText(body.name).slice(0, 16);
        if (name && step.t === 'lobby') { G.players[p].name = name; G.players[p].joined = true; }
        return;
      }
      if (type === 'answer') submit(p, step, body);
      if (type === 'judge') judge(p, step, body);
      if (type === 'heart') heart(p, step, body);
      if (type === 'spin') spin(p, step);
    }

    if (!G) newGame(false);

    return { viewFor, handle, state: () => G };
  };
}));
