// Partners in Crime: everything on the big screen, including the two runners
// carrying loot around the edge and the live lines from the wire.

window.CrimeHost = (() => {
  const nameOf = (v, p) => esc(v.players[p].name);
  const other = (p) => (p === 'p1' ? 'p2' : 'p1');
  const head = (s, label) => `<p class="eyebrow">${esc(label || s.roundTitle || '')}${s.of > 1 ? ` <span>· ${s.n} of ${s.of}</span>` : ''}</p>`;
  const paper = (p, label, body) => `<article class="card ${p}"><h3>${label}</h3><div class="card-body">${body}</div></article>`;
  const money = (n) => `$${Number(n).toLocaleString('en-US')}`;

  // ---- What every step shows once it gets to the vote or the argument ----

  function cutBlock(v) {
    const { cut } = v.step;
    const chips = cut.options.map((o) => `<li>${esc(o.label)}</li>`).join('');
    return `<div class="cut">
      <p class="cut-prompt">${esc(cut.prompt)}${cut.pot ? ` <b>${money(cut.pot)} on the table</b>` : ''}</p>
      <ul class="cut-options">${chips}</ul>
      <p class="quip">${cut.round > 1 ? 'Last chance. Vote the same or it deadlocks.' : 'You two are the judges. Vote on your phones.'}</p>
    </div>`;
  }

  function argueBlock(v) {
    const { arg, cut } = v.step;
    const label = (p) => {
      const id = cut?.split?.[p];
      return id ? cut.options.find((o) => o.id === id)?.label : null;
    };
    const split = cut?.split && v.step.stage === 'argue'
      ? `<p class="split-votes"><b class="p1">${nameOf(v, 'p1')}:</b> ${esc(label('p1'))} &nbsp;·&nbsp; <b class="p2">${nameOf(v, 'p2')}:</b> ${esc(label('p2'))}</p>` : '';
    return `<div class="argue">
      <div class="t-clock" data-starts="${arg.startsAt}" data-ends="${arg.endsAt}" data-loud="1"></div>
      <div class="argue-side">
        <p class="eyebrow">${split ? 'Split decision' : 'Make your case'}</p>
        ${split}
        <p class="rules"><b>${nameOf(v, arg.first)}</b> goes first. Both tap skip if there's nothing to fight about.</p>
      </div>
    </div>`;
  }

  function paidBlock(v) {
    const { paid } = v.step.r;
    const parts = ['p1', 'p2'].filter((p) => paid.pay[p]).map((p) => `${nameOf(v, p)} ${paid.pay[p] > 0 ? '+' : '−'}${money(Math.abs(paid.pay[p]))}`);
    return `${stamp(paid.hung ? 'Deadlock. A quarter each' : paid.label, paid.hung ? 'bad' : 'good')}
      ${parts.length ? `<p class="rules">${parts.join(' &nbsp;·&nbsp; ')}</p>` : ''}`;
  }

  // Wraps a step's own content with whichever shared stage it has reached.
  function frame(v, content) {
    const s = v.step;
    if (s.stage === 'argue') return `${content(v, true)}${argueBlock(v)}`;
    if (s.stage === 'cut') return `${content(v, true)}${cutBlock(v)}`;
    if (s.stage === 'paid') return `${content(v, true)}${paidBlock(v)}`;
    return content(v, false);
  }

  const waiting = (text = 'Eyes on your phones.') => `<div class="phones-up"><span></span><span></span></div>${quip(text)}`;
  const clock = (s, cls = '') => `<div class="t-clock ${cls}" data-starts="${s.startsAt}" data-ends="${s.endsAt || ''}"></div>`;

  // ---- One function per kind of step ----

  const screens = {
    deck(v) {
      const s = v.step;
      if (s.stage === 'answer') {
        return `${head(s)}<h1 class="question">${esc(s.q.title)}</h1><p class="rules">${s.q.cards.length} cards on your phones. Swipe fast.</p>${waiting(s.q.mode === 'menu' ? 'Only what you both want ever shows up here.' : 'No looking at each other.')}`;
      }
      if (s.q.mode === 'menu') {
        const { mutual, each, total } = s.r;
        return `${head(s)}<h1 class="question small">${mutual.length ? `You both said yes to ${mutual.length} of ${total}.` : 'Nothing overlapped. Interesting.'}</h1>
          <ul class="menu-list">${mutual.map((m, i) => `<li style="animation-delay:${i * 0.45}s">${esc(m)}</li>`).join('')}</ul>
          <p class="quip">Everything else stays between each of you and your phone. ${each ? `+${money(each)} each.` : ''}</p>`;
      }
      if (s.q.mode === 'who') {
        const mark = (row, p) => `<i class="${row[p] === row.by ? 'hit' : 'miss'}">${row[p] === row.by ? '✓' : '✗'}</i>`;
        return `${head(s)}<h1 class="question small">${nameOf(v, 'p1')} got ${s.r.score.p1}. ${nameOf(v, 'p2')} got ${s.r.score.p2}.</h1>
          <ul class="tape-list">${s.r.rows.map((row) => `<li><q>${esc(row.text)}</q><b class="${row.by}">${nameOf(v, row.by)}</b><span>${mark(row, 'p1')}${mark(row, 'p2')}</span></li>`).join('')}</ul>`;
      }
      return frame(v, () => `${head(s)}
        <h1 class="question small">You agreed on ${s.r.matches} of ${s.r.rows.length}. ${money(s.r.pot)} in the bag.</h1>
        ${s.r.contested.length ? `<ul class="contested">${s.r.contested.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`);
    },

    sketch(v) {
      const s = v.step;
      if (s.stage === 'answer') {
        return `${head(s)}<h1 class="question">${esc(s.q.q)}</h1>${clock(s)}${quip('Draw on your phone. It replays here.')}`;
      }
      return frame(v, () => `${head(s)}<h1 class="question small">${esc(s.q.q)}</h1>
        <div class="duel sketches">${paper('p1', nameOf(v, 'p1'), CrimeArt.sketch(s.r.d.p1, 'p1'))}${paper('p2', nameOf(v, 'p2'), CrimeArt.sketch(s.r.d.p2, 'p2'))}</div>`);
    },

    alibi(v) {
      const s = v.step;
      if (s.stage === 'answer') return `${head(s)}<h1 class="question">${esc(s.q.q)}</h1>${quip('A few words. You\'re being questioned in separate rooms.')}`;
      return frame(v, () => `${head(s)}<h1 class="question small">${esc(s.q.q)}</h1>
        <div class="duel">${paper('p1', nameOf(v, 'p1'), `<p class="said">${esc(s.r.texts.p1)}</p>`)}${paper('p2', nameOf(v, 'p2'), `<p class="said">${esc(s.r.texts.p2)}</p>`)}</div>`);
    },

    claim(v) {
      const s = v.step;
      if (s.stage === 'answer') return `${head(s)}<h1 class="question">${esc(s.q.q)}</h1>${waiting('File your complaint on your phone.')}`;
      return frame(v, () => `${head(s)}
        <div class="duel">${paper('p1', `${nameOf(v, 'p1')} is suing over`, `<p class="big">${esc(s.r.picks.p1)}</p>`)}${paper('p2', `${nameOf(v, 'p2')} is suing over`, `<p class="big">${esc(s.r.picks.p2)}</p>`)}</div>`);
    },

    accuse(v) {
      const s = v.step;
      if (!s.r) return waiting('');
      return frame(v, () => `${head(s, 'The Informant')}
        <h1 class="question">${esc(s.r.text)}</h1>
        <p class="rules accused">The accused: <b class="${s.r.accused}">${nameOf(v, s.r.accused)}</b></p>`);
    },

    dial(v) {
      const s = v.step;
      const ends = `<div class="ends"><span>${esc(s.q.low)}</span><span>${esc(s.q.high)}</span></div>`;
      if (s.stage === 'answer') {
        return `${head(s)}<h1 class="question small">${nameOf(v, s.giver)} sees a secret spot between these two. One thing out loud. No numbers.</h1>
          <div class="scale"><div class="rail"></div>${ends}</div>${quip(`${v.players[other(s.giver)].name} slides on their phone.`)}`;
      }
      const pin = (cls, label, value) => `<div class="pin ${cls}" style="left:${value}%"><span>${label}</span><b>${value}</b></div>`;
      return `${head(s)}<div class="scale revealed"><div class="rail"></div>${pin(s.giver, 'Target', s.r.target)}${pin(other(s.giver), 'Guess', s.r.guess)}${ends}</div>
        ${stamp(s.r.pts ? `${s.r.diff} off. ${money(s.r.pts)} each` : `${s.r.diff} off. Nothing`, s.r.pts ? 'good' : 'bad')}`;
    },

    charades(v) {
      const s = v.step;
      if (s.stage === 'ready') return `${head(s)}<h1 class="question">${nameOf(v, s.actor)} acts. No talking.</h1><p class="rules">${v.players[other(s.actor)].name} guesses out loud. ${money(s.q.each)} each per word. The clock starts when you're both ready.</p>`;
      if (s.stage === 'play') return `${head(s)}${clock(s, 'huge')}<p class="rules got-count"><b>${s.got}</b> so far</p>`;
      return `${head(s)}<h1 class="question small">${s.r.got.length} right. ${money(s.r.pts)} each.</h1>
        <ul class="word-list">${s.r.got.map((w) => `<li class="hit">${esc(w)}</li>`).join('')}${s.r.missed.map((w) => `<li class="miss">${esc(w)}</li>`).join('')}</ul>`;
    },

    wires(v) {
      const s = v.step;
      if (s.stage === 'ready') return `${head(s)}<h1 class="question">One phone has the wires. The other has the manual.</h1><p class="rules">Say what you see. Neither of you can do this alone, and every wrong cut costs 10 seconds. Swap roles each panel.</p>`;
      if (s.stage === 'play') return `${head(s)}${clock(s, 'huge')}<p class="rules got-count">Panel <b>${s.solved + 1}</b> of ${s.q.panels}. ${nameOf(v, s.agent)} has the cutters.${s.strikes ? ` ${s.strikes} wrong.` : ''}</p>`;
      return `${head(s)}${stamp(s.r.solved === s.r.panels ? 'Door\'s open' : `${s.r.solved} of ${s.r.panels} panels`, s.r.solved ? 'good' : 'bad')}<p class="rules">${money(s.r.pts)} each.</p>`;
    },

    fuse(v) {
      const s = v.step;
      if (s.stage === 'ready') return `${head(s)}<h1 class="question">${esc(s.q.q)}</h1><p class="rules">Say one out loud, then pass. Whoever's holding it when it blows pays ${money(s.q.pot)}.</p>`;
      if (s.stage === 'play') {
        return `${head(s)}<h1 class="question small">${esc(s.q.q)}</h1>
          <div class="fuse ${s.holder}" data-starts="${s.startsAt}"><span class="bomb"></span><p><b>${nameOf(v, s.holder)}</b> has it</p></div>`;
      }
      return `${head(s)}<div class="boom">BOOM</div>${stamp(`${v.players[s.r.loser].name} pays ${money(s.r.pot)}`, 'bad')}<p class="rules">${s.r.passes} passes.</p>`;
    },

    safe(v) {
      const s = v.step;
      if (s.stage === 'ready') return `${head(s)}<h1 class="question">The pot climbs until someone grabs it or the alarm goes off.</h1><p class="rules">If the alarm wins, nobody gets anything.</p>`;
      if (s.stage === 'play') return `${head(s)}<div class="safe-pot" data-starts="${s.startsAt}">$0</div>${quip('Grab it on your phone.')}`;
      if (s.r.boom) return `${head(s)}<div class="boom">ALARM</div>${stamp(`${money(s.r.pot)} gone`, 'bad')}`;
      return `${head(s)}<div class="safe-pot done">${money(s.r.pot)}</div>${stamp(`${v.players[s.r.by].name} grabbed it`, 'good')}`;
    },

    auction(v) {
      const s = v.step;
      if (s.stage === 'answer') return `${head(s)}<p class="eyebrow">Tonight's lot</p><h1 class="question">${esc(s.q.lot)}</h1>${quip('Sealed bids. You pay with your loot, and the winner owns it.')}`;
      const { bids, winner } = s.r;
      return `${head(s)}<h1 class="question small">${esc(s.q.lot)}</h1>
        <div class="duel">${paper('p1', nameOf(v, 'p1'), `<p class="big">${money(bids.p1)}</p>`)}${paper('p2', nameOf(v, 'p2'), `<p class="big">${money(bids.p2)}</p>`)}</div>
        ${stamp(winner ? `Sold to ${v.players[winner].name}` : 'No sale', winner ? 'good' : 'bad')}`;
    },

    splitsteal(v) {
      const s = v.step;
      const pred = s.prediction ? `<p class="prediction"><b>The Informant says:</b> ${esc(s.prediction.line)}</p>` : '';
      if (s.stage === 'argue') {
        return `${head(s)}<h1 class="question small">${money(s.q.pot)}. Both split, half each. One steals, they take it all. Both steal, you both lose.</h1>${pred}${argueBlock(v)}`;
      }
      if (s.stage === 'answer') return `${head(s)}<h1 class="question">Split, or steal?</h1>${pred}${waiting('Decide on your phones.')}`;
      const { picks, pay } = s.r;
      const panel = (p) => paper(p, nameOf(v, p), `<p class="huge-word ${picks[p]}">${picks[p] === 'split' ? 'Split' : 'Steal'}</p><p class="guess">${pay[p] >= 0 ? '+' : '−'}${money(Math.abs(pay[p]))}</p>`);
      const both = picks.p1 === picks.p2;
      return `${head(s)}<div class="duel">${panel('p1')}${panel('p2')}</div>${stamp(both && picks.p1 === 'split' ? 'Honor among thieves' : both ? 'Everybody loses' : 'Betrayed', both && picks.p1 === 'split' ? 'good' : 'bad')}`;
    },

    frisk(v) {
      const s = v.step;
      if (s.stage === 'answer') return `${head(s)}<h1 class="question">${esc(s.q.q)}</h1>${waiting('Tap the map on your phone.')}`;
      return frame(v, () => {
        const { pins } = s.r;
        const map = (p) => CrimeArt.body(`${CrimeArt.pin(pins[p].mine, p, '')}${CrimeArt.pin(pins[other(p)].guess, `${other(p)} guess`, '?')}`);
        return `${head(s)}<h1 class="question small">${esc(s.q.q)}</h1>
          <div class="duel maps">${paper('p1', `${nameOf(v, 'p1')} chose`, map('p1'))}${paper('p2', `${nameOf(v, 'p2')} chose`, map('p2'))}</div>
          ${s.q.note && s.stage === 'paid' ? `<p class="note">${esc(s.q.note)}</p>` : ''}`;
      });
    },

    hilo(v) {
      const s = v.step;
      const playing = (rank, cls = '') => `<div class="play-card ${cls}">${esc(rank)}</div>`;
      if (s.stage === 'answer') return `${head(s)}${playing(s.q.card)}<h1 class="question small">Is the next card higher or lower?</h1>${quip(`Win ${money(s.q.pot)}. Lose, and it's ${money(s.q.cost)} or one item of clothing. Loser's choice.`)}`;
      const line = (p) => {
        if (s.r.right[p]) return `${nameOf(v, p)} +${money(s.q.pot)}`;
        const f = s.r.forfeits[p];
        if (!f) return `${nameOf(v, p)} is deciding`;
        return f === 'cash' ? `${nameOf(v, p)} −${money(s.q.cost)}` : `${nameOf(v, p)} is losing an item of clothing`;
      };
      return `${head(s)}<div class="cards-row">${playing(s.q.card)}<span class="arrow">→</span>${playing(s.r.after, 'turned')}</div><p class="rules">${line('p1')} &nbsp;·&nbsp; ${line('p2')}</p>`;
    },

    coldread(v) {
      const s = v.step;
      if (s.stage === 'ready') return `${head(s)}<h1 class="question">${nameOf(v, s.reader)} reads a line out loud, in the sexiest voice available.</h1><p class="rules">${v.players[other(s.reader)].name} can't laugh. Maintain eye contact.</p>`;
      if (s.stage === 'play') return `${head(s)}${clock(s, 'huge')}<p class="rules">${nameOf(v, s.reader)} is performing.</p>`;
      return frame(v, () => `${head(s)}<h1 class="question small">"${esc(s.r.line)}"</h1>`);
    },

    dare(v) {
      const s = v.step;
      const tag = `<p class="heat">Heat ${'♥'.repeat(s.q.heat || 1)}</p>`;
      if (s.stage === 'offer') return `${head(s)}${tag}<h1 class="question">${esc(s.q.q)}</h1>${quip('Both tap in to do it. Either of you can pass, free, and nobody finds out who.')}`;
      if (s.stage === 'doing') return `${head(s)}<h1 class="question small">${esc(s.q.q)}</h1>${clock(s, 'huge')}`;
      if (s.r.passed) return `${head(s)}${stamp('Rex changes the subject', 'good')}<p class="rules">Moving on. No questions asked.</p>`;
      return `${head(s)}<h1 class="question small">${esc(s.q.q)}</h1>${stamp(`${v.players[s.target].name} +${money(s.r.pot)}`, 'good')}`;
    },

    job(v) {
      const s = v.step;
      if (!s.offers) return waiting('');
      if (s.stage === 'answer') {
        return `${head(s, 'Tonight\'s job')}<h1 class="question small">${nameOf(v, s.chooser)} is leading, so ${nameOf(v, s.chooser)} picks.</h1>
          <ol class="offers">${s.offers.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>`;
      }
      return `${head(s, 'Tonight\'s job')}<h1 class="question">${esc(s.r.pick)}</h1>${stamp('Accepted', 'good')}`;
    },

    getaway(v) {
      const s = v.step;
      if (s.stage === 'play') {
        return `<p class="eyebrow">The getaway</p><h1 class="question small">Flick the loot into the van. Every coin is ${money(10)}.</h1>
          <div class="van"><span></span></div>
          <p class="van-tally" id="van-tally"><b class="p1">${nameOf(v, 'p1')}: 0</b><b class="p2">${nameOf(v, 'p2')}: 0</b></p>${clock(s)}`;
      }
      return `<p class="eyebrow">The getaway</p><div class="duel">${paper('p1', nameOf(v, 'p1'), `<p class="big">${s.r.coins.p1} coins</p>`)}${paper('p2', nameOf(v, 'p2'), `<p class="big">${s.r.coins.p2} coins</p>`)}</div>${stamp('Clean getaway', 'good')}`;
    },

    debrief(v) {
      const s = v.step;
      if (s.stage === 'show') return `<div class="verdict-screen">${verdictHtml(s.r.verdict)}</div>`;
      if (s.stage === 'late') return `<div class="center"><p class="eyebrow">The debrief</p><h1 class="question">The Informant's report is stuck in traffic.</h1><p class="rules">It'll be on the menu when it arrives.</p></div>`;
      return `<div class="center"><p class="eyebrow">Back at the hideout</p><h1 class="question">Counting the money…</h1><div class="counting"><i></i><i></i><i></i></div></div>`;
    },
  };

  function credits(v) {
    const lead = v.leader;
    const favors = v.favors.map((f) => `<li>${esc(f.lot)} <b class="${f.winner}">${nameOf(v, f.winner)} owns this</b></li>`).join('');
    return `<div class="center">
      <p class="logo small-logo">${lead ? `${nameOf(v, lead)} got away with it` : 'You split it dead even'}</p>
      <p class="rules">${money(v.players.p1.score)} to ${money(v.players.p2.score)}.</p>
      ${favors ? `<div class="contracts"><p class="eyebrow">Contracts in force</p><ul>${favors}</ul></div>` : ''}
      <a class="big-next" href="${esc(v.menu)}">Back to the menu</a>
    </div>`;
  }

  // ---- Clocks: count in with beeps, count down, and buzz by themselves ----

  let clockTimer = null;
  const say = new Set();

  function runClocks() {
    clearInterval(clockTimer);
    say.clear();
    const update = () => {
      const now = Date.now();
      document.querySelectorAll('.t-clock').forEach((el) => {
        const starts = Number(el.dataset.starts);
        const ends = Number(el.dataset.ends);
        const key = `${starts}`;
        const beep = (mark, sound) => {
          const id = `${key}:${mark}`;
          if (!say.has(id)) {
            say.add(id);
            play(sound);
          }
        };
        if (now < starts) {
          const n = Math.ceil((starts - now) / 1000);
          el.textContent = n;
          el.classList.add('count-in');
          beep(`in${n}`, 'tick');
          return;
        }
        el.classList.remove('count-in');
        if (el.dataset.loud) beep('go', 'siren'); else beep('go', 'ding');
        const left = Math.max(0, Math.ceil((ends - now) / 1000));
        el.textContent = left || 'Time!';
        el.classList.toggle('urgent', left <= 10);
        if (left > 0 && left <= 10) beep(`left${left}`, 'tick');
        if (left === 0) beep('end', 'buzzer');
      });
      document.querySelectorAll('.safe-pot[data-starts]').forEach((el) => {
        const elapsed = now - Number(el.dataset.starts);
        if (elapsed < 0) { el.textContent = Math.ceil(-elapsed / 1000); return; }
        const pot = Math.floor(elapsed / 250) * 10;
        el.textContent = money(pot);
        el.style.setProperty('--heat', Math.min(1, elapsed / 18000));
        const beat = Math.floor(elapsed / Math.max(180, 700 - elapsed / 40));
        const id = `safe${el.dataset.starts}:${beat}`;
        if (!say.has(id)) { say.add(id); play('tick'); }
      });
      document.querySelectorAll('.fuse[data-starts]').forEach((el) => {
        const elapsed = now - Number(el.dataset.starts);
        if (elapsed < 0) return;
        const beat = Math.floor(elapsed / 650);
        const id = `fuse${el.dataset.starts}:${beat}`;
        if (!say.has(id)) { say.add(id); play('tick'); }
      });
    };
    update();
    clockTimer = setInterval(update, 100);
  }

  // ---- The wire: lines written live, sliding in while the show keeps going ----

  const CHYRON_SHOW_MS = 9000;
  const CHYRON_GAP_MS = 14000;
  let chyronShown = 0;
  let rulingsShown = new Set();
  let chyronBusyUntil = 0;
  const chyronQueue = [];

  function pumpChyron() {
    const el = document.getElementById('chyron');
    const now = Date.now();
    if (now < chyronBusyUntil || !chyronQueue.length) return;
    const [label, text] = chyronQueue.shift();
    el.innerHTML = `<b>${esc(label)}</b><span>${esc(text)}</span>`;
    el.hidden = false;
    el.classList.remove('leave');
    chyronBusyUntil = now + CHYRON_SHOW_MS + CHYRON_GAP_MS;
    setTimeout(() => el.classList.add('leave'), CHYRON_SHOW_MS - 500);
    setTimeout(() => { el.hidden = true; }, CHYRON_SHOW_MS);
  }

  function feedChyron(v) {
    const live = v.live || {};
    const heckles = live.heckles || [];
    for (; chyronShown < heckles.length; chyronShown++) chyronQueue.push(['On the wire', heckles[chyronShown]]);
    for (const [key, text] of Object.entries(live.rulings || {})) {
      if (!rulingsShown.has(key)) {
        rulingsShown.add(key);
        // A ruling answers a call they just made, so it jumps the line. If they've
        // already moved on from that dispute, it isn't worth interrupting for.
        if (Number(key) === v.i) {
          chyronQueue.unshift(['The Informant', text]);
          chyronBusyUntil = 0;
        }
      }
    }
    if (v.step.t === 'debrief' || v.step.t === 'credits' || v.step.t === 'lobby') {
      chyronQueue.length = 0;
      return;
    }
    pumpChyron();
  }

  // ---- The runners: run the screen's edge, carrying what they've earned ----

  const LOOT_PER_ITEM = 150;
  const MAX_LOOT = 34;
  const COLORS = { p1: '#ff5a36', p2: '#25c6b5' };
  const HUG_MIN_SECONDS = 1;
  const SPRINT_SECONDS = 1.6;

  const Runners = {
    canvas: null,
    players: null,
    coins: [],
    fx: [],
    dropped: [],
    last: 0,
    haul: { p1: 0, p2: 0 },
    vanOpen: false,
    scores: { p1: null, p2: null },
    locks: { p1: false, p2: false },
    hug: null,
    hugArmed: true,

    start() {
      this.canvas = document.getElementById('runners');
      this.canvas.hidden = false;
      this.ctx = this.canvas.getContext('2d');
      this.players = {
        p1: { s: 0.05, dir: 1, speed: 1, boost: 0, jump: 0, jv: 0, stun: 0, phase: 0, name: 'Chris', spin: 0 },
        p2: { s: 0.55, dir: 1, speed: 1, boost: 0, jump: 0, jv: 0, stun: 0, phase: 2, name: 'Jasmine', spin: 0 },
      };
      window.addEventListener('resize', () => this.resize());
      this.resize();
      requestAnimationFrame((t) => this.frame(t));
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      this.inset = 2.3 * this.rem;
      this.corner = 4.5 * this.rem;
      const [w, h, c] = [this.w - this.inset * 2, this.h - this.inset * 2, this.corner];
      this.track = { w, h, c, edgeX: w - 2 * c, edgeY: h - 2 * c, arc: (Math.PI * c) / 2 };
      this.track.length = 2 * this.track.edgeX + 2 * this.track.edgeY + 4 * this.track.arc;
    },

    // Position on the rounded rectangle: returns a point and the way "up" is, pointing inward.
    at(s) {
      const { edgeX, edgeY, arc, length, c, w, h } = this.track;
      let d = ((s % 1) + 1) % 1 * length;
      const inset = this.inset;
      if (d < edgeX) return { x: inset + c + d, y: inset + h, angle: 0 }; // bottom edge, left to right
      d -= edgeX;
      if (d < arc) { const a = Math.PI / 2 - (d / arc) * (Math.PI / 2); return { x: inset + w - c + Math.cos(a) * c, y: inset + h - c + Math.sin(a) * c, angle: -(d / arc) * (Math.PI / 2) }; }
      d -= arc;
      if (d < edgeY) return { x: inset + w, y: inset + h - c - d, angle: -Math.PI / 2 };
      d -= edgeY;
      if (d < arc) { const a = -(d / arc) * (Math.PI / 2); return { x: inset + w - c + Math.cos(a) * c, y: inset + c + Math.sin(a) * c, angle: -Math.PI / 2 - (d / arc) * (Math.PI / 2) }; }
      d -= arc;
      if (d < edgeX) return { x: inset + w - c - d, y: inset, angle: -Math.PI };
      d -= edgeX;
      if (d < arc) { const a = -Math.PI / 2 - (d / arc) * (Math.PI / 2); return { x: inset + c + Math.cos(a) * c, y: inset + c + Math.sin(a) * c, angle: -Math.PI - (d / arc) * (Math.PI / 2) }; }
      d -= arc;
      if (d < edgeY) return { x: inset, y: inset + c + d, angle: Math.PI / 2 };
      d -= edgeY;
      const a = Math.PI - (d / arc) * (Math.PI / 2);
      return { x: inset + c + Math.cos(a) * c, y: inset + h - c + Math.sin(a) * c, angle: Math.PI / 2 - (d / arc) * (Math.PI / 2) };
    },

    gesture(p, g) {
      const r = this.players?.[p];
      if (!r) return;
      // Sprinting is the only way out of a hug. Coins can still be thrown from inside one.
      if (this.hug) {
        if (g === 'sprint' && this.hug.age >= HUG_MIN_SECONDS) this.letGo(p);
        if (g !== 'throw') return;
      }
      if (g === 'jump' && r.jump === 0) r.jv = 1;
      if (g === 'flip') r.dir *= -1;
      if (g === 'sprint') r.boost = SPRINT_SECONDS;
      if (g === 'throw') {
        if (this.vanOpen) {
          this.coins.push({ from: p, van: true, t: 0, dur: 0.6 });
          r.boost = 1.2;
          this.haul[p]++;
          const tally = document.querySelector(`#van-tally .${p}`);
          if (tally) tally.textContent = `${this.names[p]}: ${this.haul[p]}`;
        } else {
          this.throwCoin(p);
        }
      }
    },

    startHug(delta) {
      const back = delta >= 0 ? 'p1' : 'p2';
      const front = other(back);
      const { p1, p2 } = this.players;
      this.hug = { s: this.players[back].s + Math.abs(delta) / 2, back, age: 0, heartIn: 0, dirs: { p1: p1.dir, p2: p2.dir } };
      this.hugArmed = false;
      for (const r of [p1, p2]) Object.assign(r, { jump: 0, jv: 0, spin: 0, stun: 0, boost: 0 });
      this.players[back].dir = 1;
      this.players[front].dir = -1;
      for (let i = 0; i < 14; i++) this.floatHeart();
    },

    holdHug(dt) {
      const hug = this.hug;
      hug.age += dt;
      const offset = (this.rem * 1.7 * 0.5) / this.track.length;
      const front = other(hug.back);
      const settle = (r, target) => { r.s = (r.s + (((target - r.s + 1.5) % 1) - 0.5) * Math.min(1, dt * 10) + 1) % 1; };
      settle(this.players[hug.back], hug.s - offset);
      settle(this.players[front], hug.s + offset);
      hug.heartIn -= dt;
      if (hug.heartIn <= 0) {
        this.floatHeart();
        hug.heartIn = 0.16 + Math.random() * 0.14;
      }
    },

    // Whoever sprints runs directly away. The one left behind stumbles, then carries on as before.
    letGo(p) {
      const { back, dirs } = this.hug;
      const q = other(p);
      const at = this.at(this.players[p].s);
      this.players[p].dir = p === back ? -1 : 1;
      this.players[p].boost = SPRINT_SECONDS;
      this.players[q].dir = dirs[q];
      this.players[q].stun = 0.5;
      this.hug = null;
      for (let i = 0; i < 5; i++) this.fx.push({ x: at.x, y: at.y - this.rem * 2, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 140, life: 0.6, kind: 'heart' });
    },

    // Hearts drift inward from the hug, whichever edge of the screen it's on.
    floatHeart() {
      const { rem } = this;
      const at = this.at(this.hug.s);
      const ux = Math.sin(at.angle);
      const uy = -Math.cos(at.angle);
      const rise = rem * (4 + Math.random() * 1.5);
      const speed = rem * (2 + Math.random() * 3);
      const drift = (Math.random() - 0.5) * rem * 3.5;
      this.fx.push({
        x: at.x + ux * rise,
        y: at.y + uy * rise,
        vx: ux * speed + uy * drift,
        vy: uy * speed - ux * drift,
        life: 1 + Math.random() * 0.9,
        kind: 'heart',
        float: true,
        size: rem * (0.8 + Math.random() * 0.9),
      });
    },

    throwCoin(p) {
      const q = other(p);
      this.coins.push({ from: p, to: q, t: 0, dur: 0.7, hit: true });
    },

    onScores(v) {
      for (const p of ['p1', 'p2']) {
        const score = v.players[p].score;
        const before = this.scores[p];
        this.scores[p] = score;
        this.locks[p] = v.locked[p] || v.ready[p];
        if (before === null || !this.players) continue;
        const delta = score - before;
        if (delta > 0) {
          const n = Math.min(14, 2 + Math.round(delta / 60));
          for (let i = 0; i < n; i++) this.coins.push({ center: true, to: p, t: -i * 0.06, dur: 0.8 + Math.random() * 0.25, jitter: Math.random() });
        } else if (delta < 0) {
          const spot = this.players[p].s;
          const n = Math.min(10, 2 + Math.round(-delta / 80));
          for (let i = 0; i < n; i++) this.dropped.push({ s: spot + (i - n / 2) * 0.004, age: 0, life: 7 + Math.random() * 3, owner: p });
          this.players[p].stun = 0.5;
        }
      }
    },

    frame(t) {
      const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
      this.last = t;
      this.update(dt);
      this.draw(t / 1000);
      requestAnimationFrame((n) => this.frame(n));
    },

    update(dt) {
      const speedPerSecond = 0.018;
      for (const [p, r] of Object.entries(this.players)) {
        r.stun = Math.max(0, r.stun - dt);
        r.boost = Math.max(0, r.boost - dt);
        if (!this.hug) {
          const pace = (r.stun ? 0.25 : 1) * (r.boost ? 2.6 : 1);
          r.s = (r.s + r.dir * pace * speedPerSecond * dt + 1) % 1;
          r.phase += dt * (9 + pace * 5);
          if (r.jv || r.jump > 0) {
            r.jump += r.jv * dt * 4;
            r.jv -= dt * 4.2;
            if (r.jump <= 0) { r.jump = 0; r.jv = 0; }
          }
        }
        r.spin = Math.max(0, r.spin - dt * 3);
        // Runners sweep up each other's spilled loot as they pass.
        this.dropped = this.dropped.filter((d) => Math.abs(((d.s - r.s + 1.5) % 1) - 0.5) > 0.006 || d.owner === p);
      }
      const { p1, p2 } = this.players;
      const delta = ((p2.s - p1.s + 1.5) % 1) - 0.5;
      if (this.hug) {
        this.holdHug(dt);
      } else {
        // After letting go, they have to get clear before they can hug again.
        if (Math.abs(delta) > 0.03) this.hugArmed = true;
        if (Math.abs(delta) < 0.008 && this.hugArmed) this.startHug(delta);
      }
      for (const d of this.dropped) d.age += dt;
      this.dropped = this.dropped.filter((d) => d.age < d.life);
      for (const c of this.coins) c.t += dt;
      const landed = this.coins.filter((c) => c.t >= c.dur);
      for (const c of landed) {
        if (c.hit && !this.hug) {
          const r = this.players[c.to];
          r.stun = 0.35;
          r.spin = 1;
        }
      }
      this.coins = this.coins.filter((c) => c.t < c.dur);
      for (const f of this.fx) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (!f.float) f.vy += 480 * dt;
        f.life -= dt;
      }
      this.fx = this.fx.filter((f) => f.life > 0);
    },

    draw(time) {
      const g = this.ctx;
      const { rem } = this;
      g.clearRect(0, 0, this.w, this.h);
      // The lane they run along.
      g.save();
      g.strokeStyle = 'rgba(255, 241, 214, 0.13)';
      g.lineWidth = 0.14 * rem;
      g.setLineDash([0.9 * rem, 0.9 * rem]);
      g.lineDashOffset = -time * 8;
      g.beginPath();
      g.roundRect(this.inset, this.inset, this.track.w, this.track.h, this.corner);
      g.stroke();
      g.restore();

      for (const d of this.dropped) {
        const at = this.at(d.s);
        this.coinShape(at.x, at.y, 0.34 * rem, 1 - d.age / d.life);
      }
      for (const p of ['p1', 'p2']) this.runner(p, time);
      for (const c of this.coins) {
        if (c.t < 0) continue;
        const k = c.t / c.dur;
        const end = c.van ? { x: this.w / 2, y: this.h * 0.38 } : this.at(this.players[c.to].s);
        const start = c.center ? { x: this.w / 2 + (c.jitter - 0.5) * 18 * rem, y: this.h * 0.42 } : this.at(this.players[c.from].s);
        const x = start.x + (end.x - start.x) * k;
        const y = start.y + (end.y - start.y) * k - Math.sin(k * Math.PI) * 7 * rem;
        this.coinShape(x, y, 0.42 * rem, 1);
      }
      for (const f of this.fx) {
        if (f.kind === 'heart') {
          g.fillStyle = `rgba(255, 90, 54, ${Math.min(1, f.life * 2)})`;
          g.font = `${f.size || rem}px sans-serif`;
          g.fillText('♥', f.x, f.y);
        } else {
          this.coinShape(f.x, f.y, 0.24 * rem, Math.min(1, f.life * 2));
        }
      }
    },

    coinShape(x, y, r, alpha) {
      const g = this.ctx;
      g.globalAlpha = alpha;
      g.fillStyle = '#ffc23d';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#b9811a';
      g.lineWidth = r * 0.3;
      g.stroke();
      g.globalAlpha = 1;
    },

    runner(p, time) {
      const g = this.ctx;
      const r = this.players[p];
      const at = this.at(r.s);
      const { rem } = this;
      const size = rem * 1.7;
      const score = this.scores[p] || 0;
      const items = Math.min(MAX_LOOT, Math.floor(score / LOOT_PER_ITEM));
      g.save();
      g.translate(at.x, at.y);
      g.rotate(at.angle);
      // The inside of the lane is up, so they run around the frame like it's the floor.
      g.translate(0, -r.jump * 3.4 * rem);
      g.scale(r.dir, 1);
      g.rotate(r.spin * Math.PI * 2);
      const hugging = !!this.hug;
      // Leaning in, and rocking a little together.
      if (hugging) g.rotate(0.05 + Math.sin(time * 2.4) * (r.dir > 0 ? 0.035 : -0.035));
      const stride = hugging ? 0 : Math.sin(r.phase);
      const bob = hugging ? 0 : Math.abs(Math.cos(r.phase)) * size * 0.1;

      // Shadow.
      g.fillStyle = 'rgba(0, 0, 0, 0.28)';
      g.beginPath();
      g.ellipse(0, size * 0.04 + r.jump * 3.4 * rem, size * 0.6, size * 0.12, 0, 0, Math.PI * 2);
      g.fill();

      g.lineCap = 'round';
      g.lineJoin = 'round';
      // Legs.
      g.strokeStyle = '#fff1d6';
      g.lineWidth = size * 0.2;
      g.beginPath();
      g.moveTo(-size * 0.08, -size * 0.75 - bob);
      g.lineTo(-size * 0.08 + stride * size * 0.42, 0 - Math.max(0, stride) * size * 0.2);
      g.moveTo(size * 0.08, -size * 0.75 - bob);
      g.lineTo(size * 0.08 - stride * size * 0.42, 0 - Math.max(0, -stride) * size * 0.2);
      g.stroke();

      // Loot on the back: a sack, then a teetering stack as the score climbs.
      const sack = size * (0.32 + Math.min(items, 10) * 0.045);
      const sackX = -size * 0.58 - sack * 0.3;
      const sackY = -size * 1.25 - bob;
      g.fillStyle = '#c99a53';
      g.beginPath();
      g.ellipse(sackX, sackY, sack, sack * 1.05, 0.12 * stride, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#7b5a26';
      g.lineWidth = size * 0.06;
      g.stroke();
      g.fillStyle = '#7b5a26';
      g.font = `800 ${sack}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('$', sackX, sackY + sack * 0.06);
      const stack = Math.max(0, items - 4);
      for (let i = 0; i < stack; i++) {
        const sway = Math.sin(r.phase * 0.5 + i * 0.3) * i * size * 0.022;
        const y = sackY - sack - size * 0.13 - i * size * 0.14;
        const type = i % 5 === 4 ? '#25c6b5' : '#ffc23d';
        g.fillStyle = type;
        g.strokeStyle = '#7b5a26';
        g.lineWidth = size * 0.035;
        g.beginPath();
        g.ellipse(sackX + sway, y, size * 0.3 - (i % 3) * size * 0.03, size * 0.085, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }

      // Body.
      g.fillStyle = p === 'p1' ? '#3fd0e6' : COLORS.p2;
      g.beginPath();
      g.roundRect(-size * 0.34, -size * 1.65 - bob, size * 0.68, size * 0.95, size * 0.26);
      g.fill();
      if (p === 'p1') {
        // Tied at the waist.
        g.fillStyle = '#2a3a5c';
        g.beginPath();
        g.roundRect(-size * 0.36, -size * 0.95 - bob, size * 0.72, size * 0.22, size * 0.08);
        g.fill();
        g.beginPath();
        g.moveTo(-size * 0.3, -size * 0.75 - bob);
        g.lineTo(-size * 0.42 - stride * size * 0.1, -size * 0.36 - bob);
        g.lineTo(-size * 0.05, -size * 0.74 - bob);
        g.fill();
      }
      // Arms.
      g.strokeStyle = '#ffd7b0';
      g.lineWidth = size * 0.17;
      g.beginPath();
      g.moveTo(size * 0.22, -size * 1.42 - bob);
      if (hugging) {
        g.lineTo(size * 0.98, -size * 1.34);
        g.moveTo(size * 0.2, -size * 1.16);
        g.lineTo(size * 0.94, -size * 1.06);
      } else {
        g.lineTo(size * 0.48 + stride * size * 0.2, -size * 1.0 - bob);
      }
      g.stroke();
      // Head.
      g.fillStyle = '#ffd7b0';
      g.beginPath();
      g.arc(0, -size * 2.0 - bob, size * 0.42, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a1820';
      if (p === 'p2') {
        // Long hair and red shoes.
        g.beginPath();
        g.arc(-size * 0.04, -size * 2.1 - bob, size * 0.43, Math.PI * 0.95, Math.PI * 2.05);
        g.quadraticCurveTo(-size * 0.2, -size * 1.95 - bob, -size * 0.85 - stride * size * 0.12, -size * 1.5 - bob);
        g.quadraticCurveTo(-size * 0.55, -size * 1.95 - bob, -size * 0.45, -size * 2.1 - bob);
        g.fill();
        g.fillStyle = '#d43a18';
        g.fillRect(-size * 0.08 + stride * size * 0.42 - size * 0.14, -size * 0.14 - Math.max(0, stride) * size * 0.2, size * 0.3, size * 0.15);
        g.fillRect(size * 0.08 - stride * size * 0.42 - size * 0.14, -size * 0.14 - Math.max(0, -stride) * size * 0.2, size * 0.3, size * 0.15);
      } else {
        g.beginPath();
        g.arc(-size * 0.02, -size * 2.12 - bob, size * 0.39, Math.PI, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#2a1820';
      g.beginPath();
      if (hugging) {
        // Eyes shut, happy.
        g.strokeStyle = '#2a1820';
        g.lineWidth = size * 0.05;
        g.arc(size * 0.2, -size * 2.0, size * 0.08, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else {
        g.arc(size * 0.2, -size * 2.03 - bob, size * 0.05, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();

      // The name stays upright in the gutter behind their feet, so it can always be read.
      g.font = `800 ${rem * 1.15}px 'Bricolage Grotesque', sans-serif`;
      const label = `${this.names?.[p] || r.name}${this.locks[p] ? ' ✓' : ''}`;
      const half = g.measureText(label).width / 2 + rem * 0.3;
      // When the two are close, their names slide apart along the lane so they don't print over each other.
      const apart = ((r.s - this.players[other(p)].s + 1.5) % 1) - 0.5;
      const side = Math.sign(apart) * Math.max(0, Math.min(1, (0.03 - Math.abs(apart)) / 0.02));
      const along = Math.abs(Math.cos(at.angle)) * half + Math.abs(Math.sin(at.angle)) * rem * 0.7;
      const tagX = Math.max(half, Math.min(this.w - half, at.x - Math.sin(at.angle) * rem * 1.2 + Math.cos(at.angle) * side * along));
      const tagY = Math.max(rem * 0.7, Math.min(this.h - rem * 0.7, at.y + Math.cos(at.angle) * rem * 1.2 + Math.sin(at.angle) * side * along));
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = COLORS[p];
      g.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      g.lineWidth = rem * 0.22;
      g.lineJoin = 'round';
      g.strokeText(label, tagX, tagY);
      g.fillText(label, tagX, tagY);
    },
  };

  // ---- Hooks the main big-screen script calls ----

  let started = false;

  return {
    screens,
    credits,
    onView(v) {
      if (!started) {
        started = true;
        document.body.classList.add('crime');
        Runners.start();
        setInterval(pumpChyron, 1000);
        Show.onFidget = (role, gestures) => (gestures || []).slice(0, 6).forEach((g) => Runners.gesture(role, g));
      }
      document.body.dataset.stage = v.step.stage;
      Runners.names = { p1: v.players.p1.name, p2: v.players.p2.name };
      Runners.vanOpen = v.step.t === 'getaway' && v.step.stage === 'play';
      Runners.onScores(v);
      feedChyron(v);
    },
    afterRender() {
      runClocks();
    },
    soundFor(v) {
      const s = v.step;
      if (s.stage === 'paid') return s.r.paid.hung ? 'buzzer' : 'ding';
      if (s.stage === 'argue') return null;
      if (s.t === 'deck' && s.stage === 'reveal') return 'ding';
      if (s.t === 'fuse' && s.stage === 'reveal') return 'buzzer';
      if (s.t === 'safe' && s.stage === 'reveal') return s.r.boom ? 'siren' : 'fanfare';
      if (s.t === 'dial' && s.stage === 'reveal') return s.r.pts ? 'ding' : 'buzzer';
      if (['charades', 'wires', 'auction', 'dare', 'job', 'getaway'].includes(s.t) && s.stage === 'reveal') return 'ding';
      if (s.t === 'splitsteal' && s.stage === 'reveal') return 'fanfare';
      if (s.t === 'hilo' && (s.stage === 'forfeit' || s.stage === 'reveal')) return 'ding';
      if (s.t === 'debrief' && s.stage === 'show') return 'fanfare';
      return null;
    },
  };
})();
