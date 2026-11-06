// The big screen: everything the room can see. Secrets never reach this page
// until the reveal, so it is safe to leave on a TV.

const stage = document.getElementById('stage');
const scores = document.getElementById('scores');
const curtain = document.getElementById('curtain');
const LETTERS = 'ABCDE';

let lastKey = '';
let lastSound = '';
let shownScore = { p1: 0, p2: 0 };
let timer = null;
let muted = false;

// ---- Sound: synthesized so the show needs no audio files ----

const audio = { ctx: null };

function tone(freq, start, length, type = 'triangle', volume = 0.18) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length);
}

const SOUNDS = {
  fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.34, 'sawtooth', 0.09)),
  ding: () => { tone(880, 0, 0.5); tone(1320, 0.09, 0.7); },
  lock: () => tone(520, 0, 0.12, 'square', 0.07),
  buzzer: () => { tone(110, 0, 0.75, 'sawtooth', 0.24); tone(116, 0, 0.75, 'square', 0.1); },
  siren: () => [0, 0.3, 0.6, 0.9].forEach((t, i) => tone(i % 2 ? 460 : 620, t, 0.3, 'sawtooth', 0.11)),
  soft: () => [392, 494, 587, 740].forEach((f, i) => tone(f, i * 0.28, 1.4, 'sine', 0.09)),
  tick: () => tone(1500, 0, 0.05, 'square', 0.05),
  spin: () => { for (let i = 0; i < 34; i++) tone(1000, 4.9 * (i / 34) ** 2.1, 0.04, 'square', 0.05); },
};

function play(name) {
  if (muted || !audio.ctx) return;
  SOUNDS[name]?.();
}

curtain.addEventListener('click', () => {
  audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  audio.ctx.resume();
  curtain.classList.add('up');
  play('fanfare');
});

// ---- Small building blocks ----

const pname = (v, p) => esc(v.players[p].name);
const line = (list, seed) => list[seed % list.length];

function eyebrow(step) {
  return `<p class="eyebrow">${esc(step.roundTitle)} <span>· Question ${step.n} of ${step.of}</span></p>`;
}

function options(step) {
  return `<ol class="options">${step.q.options.map((o, i) => `<li><b>${LETTERS[i]}</b>${esc(o)}</li>`).join('')}</ol>`;
}

const stamp = (text, kind = '') => `<div class="stamp ${kind}">${esc(text)}</div>`;
const quip = (text) => `<p class="quip">${esc(text)}</p>`;
const saidText = (text) => `<p class="said ${text.length > 110 ? 'long' : ''}">${esc(text)}</p>`;
const heartsText = (n) => '♥'.repeat(n) + '<i>' + '♥'.repeat(3 - n) + '</i>';

function card(p, label, body, extra = '') {
  return `<article class="card ${p}"><h3>${label}</h3><div class="card-body">${body}</div>${extra}</article>`;
}

// ---- One render function per show segment ----

const SCREENS = {
  lobby(v) {
    const seat = (p, fallback) => {
      const pl = v.players[p];
      if (pl.joined) return `<div class="seat ${p} joined"><div class="check">✓</div><h2>${esc(pl.name)}</h2><p>is in the building</p></div>`;
      const copy = v.links ? ` or <button class="copy-link" data-copy="${p}">copy the link</button>` : '';
      return `<div class="seat ${p}"><img src="${esc(v.qr[p])}" alt="QR code for ${fallback}"><h2>${fallback}</h2><p>${pl.online ? 'Typing a name…' : `Scan with your phone camera${copy}`}</p></div>`;
    };
    const ready = v.canNext;
    return `<div class="lobby">
      <div class="logo">${v.title ? esc(v.title) : 'Hard<br>Disagree'}</div>
      <p class="tagline">${v.title ? 'Scan in. Rex is waiting.' : 'The show that finally settles who was right.'}</p>
      <div class="seats">${seat('p1', 'Chris')}${seat('p2', 'Jasmine')}</div>
      ${ready ? '<button class="big-next" data-next>Start the show</button>' : `<p class="wifi">${esc(v.note)}</p>`}
    </div>`;
  },

  welcome(v) {
    if (v.welcome) return `<div class="center"><p class="eyebrow">Live from your living room</p><h1 class="monologue">${esc(v.welcome)}</h1></div>`;
    return `<div class="center">
      <p class="eyebrow">Live from your living room</p>
      <h1 class="monologue">Good evening. I'm your host, Rex Valentine.<br>Tonight, ${pname(v, 'p1')} and ${pname(v, 'p2')} find out how well they know each other, and who's been wrong this whole time.</h1>
      <p class="sub">Six rounds. No outside help. Anything you say can and will be brought up later.</p>
    </div>`;
  },

  round(v) {
    const r = v.round;
    return `<div class="center round-card">
      <p class="eyebrow">Round ${r.number} of ${r.count}</p>
      <h1 class="logo round-title">${esc(r.title)}</h1>
      <p class="rules">${esc(r.rules)}</p>
    </div>`;
  },

  mind(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      return `${eyebrow(s)}<h1 class="question">${esc(s.q.q)}</h1>${options(s)}${quip('Answer for yourself, then guess for them.')}`;
    }
    const opt = (i) => esc(s.q.options[i]);
    const panel = (p, o) => card(p, pname(v, p), `<p class="big">${opt(s.r.answers[p])}</p>
      <p class="guess ${s.r.right[o] ? 'right' : 'wrong'}">${pname(v, o)} guessed: ${opt(s.r.guesses[o])} <b>${s.r.right[o] ? `✓ +100` : '✗'}</b></p>`);
    const both = s.r.right.p1 && s.r.right.p2;
    const neither = !s.r.right.p1 && !s.r.right.p2;
    return `${eyebrow(s)}<h1 class="question small">${esc(s.q.q)}</h1>
      <div class="duel">${panel('p1', 'p2')}${panel('p2', 'p1')}</div>
      ${both ? stamp('Telepathic', 'good') : neither ? stamp('Do you two know each other?', 'bad') : ''}`;
  },

  finger(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      return `${eyebrow(s)}<h1 class="question huge">${esc(s.q.q)}</h1>${quip('Point in secret. No looking at each other.')}`;
    }
    if (s.stage === 'reveal') {
      const panel = (p) => card(p, `${pname(v, p)} points at`, `<p class="huge-name ${s.r.picks[p]}">${s.r.picks[p] === p ? 'Myself' : pname(v, s.r.picks[p])}</p>`);
      return `${eyebrow(s)}<h1 class="question small">${esc(s.q.q)}</h1>
        <div class="duel">${panel('p1')}${panel('p2')}</div>
        ${s.r.agree ? `${stamp('Agreed. +50 each', 'good')}` : stamp('Hard Disagree', 'bad')}`;
    }
    if (s.stage === 'debate') {
      return `<div class="center debate">
        <p class="eyebrow">The floor is open</p>
        <h1 class="question small">${esc(s.q.q)}</h1>
        <div class="clock" id="clock">60</div>
        <p class="rules"><b>${pname(v, s.r.first)}</b> goes first. ${esc(s.r.opener)}</p>
      </div>`;
    }
    if (s.stage === 'standoff') {
      return `<div class="center">
        <p class="eyebrow">The standoff</p>
        <h1 class="question">Stand your ground, or concede?</h1>
        <table class="payoff">
          <tr><th>You concede, they stand</th><td>You +50 · They +200</td></tr>
          <tr><th>You both concede</th><td>+100 each</td></tr>
          <tr><th>You both stand firm</th><td>Nobody gets anything</td></tr>
        </table>
      </div>`;
    }
    const { stand, pts } = s.r;
    let title;
    let note;
    if (stand.p1 && stand.p2) {
      title = 'Deadlock';
      note = 'Neither of you moved an inch. Zero points. The court is disappointed, but not surprised.';
    } else if (!stand.p1 && !stand.p2) {
      title = 'Disgustingly healthy';
      note = 'You both conceded. It\'s a hundred each, and frankly it\'s hard to watch.';
    } else {
      const holdout = stand.p1 ? 'p1' : 'p2';
      const giver = holdout === 'p1' ? 'p2' : 'p1';
      title = `${v.players[holdout].name} wins it`;
      note = `${v.players[giver].name} took the high road and left with ${pts[giver]}. ${v.players[holdout].name} took ${pts[holdout]} and will mention this again.`;
    }
    return `<div class="center">${stamp(title, stand.p1 && stand.p2 ? 'bad' : 'good')}<p class="rules">${esc(note)}</p></div>`;
  },

  gap(v) {
    const s = v.step;
    const ends = `<div class="ends"><span>0 · ${esc(s.q.low)}</span><span>${esc(s.q.high)} · 10</span></div>`;
    if (s.stage === 'answer') {
      return `${eyebrow(s)}<h1 class="question">${esc(s.q.q)}</h1><div class="scale"><div class="rail"></div>${ends}</div>${quip('Zero to ten. Be honest. They will see it.')}`;
    }
    const { values, gap, pts, first } = s.r;
    const pin = (p) => `<div class="pin ${p}" style="left:${values[p] * 10}%"><span>${pname(v, p)}</span><b>${values[p]}</b></div>`;
    let result;
    if (gap === 0) result = stamp(`Exactly the same. +${pts} each`, 'good');
    else if (pts) result = stamp(`${gap} apart. +${pts} each`, 'good');
    else result = `${stamp(`Hard Disagree: ${gap} apart`, 'bad')}<p class="rules"><b>${pname(v, first)}</b> rated it higher, so ${pname(v, first)} explains first.</p>`;
    return `${eyebrow(s)}<h1 class="question small">${esc(s.q.q)}</h1>
      <div class="scale revealed"><div class="rail"></div>${pin('p1')}${pin('p2')}${ends}</div>${result}`;
  },

  receipts(v) {
    const s = v.step;
    const subject = s.subject;
    const guesser = subject === 'p1' ? 'p2' : 'p1';
    if (s.stage === 'answer') {
      return `${eyebrow(s)}<h1 class="question">${esc(s.q.q)}</h1>
        ${quip(`${v.players[subject].name} writes the truth. ${v.players[guesser].name} takes a guess.`)}`;
    }
    if (s.r.fifth) {
      return `${eyebrow(s)}<h1 class="question small">${esc(s.q.q)}</h1>
        ${stamp(`${v.players[subject].name} pleads the Fifth`, 'bad')}
        <p class="rules">No comment. ${pname(v, guesser)} collects 100 points for the trouble, and the rest of us will just assume the worst.</p>`;
    }
    const duel = `<div class="duel">
      ${card(subject, `The truth, from ${pname(v, subject)}`, saidText(s.r.truth))}
      ${card(guesser, `The guess, from ${pname(v, guesser)}`, saidText(s.r.guess))}
    </div>`;
    if (s.stage === 'reveal') {
      return `${eyebrow(s)}<h1 class="question small">${esc(s.q.q)}</h1>${duel}${quip(`${v.players[subject].name} is judging. Choose wisely, you have to go home with this person.`)}`;
    }
    const verdicts = { 200: 'Nailed it. +200', 100: 'Close enough. +100', 0: 'Who even are you?' };
    return `${eyebrow(s)}<h1 class="question small">${esc(s.q.q)}</h1>${duel}${stamp(verdicts[s.r.pts], s.r.pts ? 'good' : 'bad')}`;
  },

  soft(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      return `${eyebrow(s)}<h1 class="question">${esc(s.q.q)}</h1>${quip('Take your time. Rex will wait. Rex has nowhere to be.')}`;
    }
    const said = (p) => (s.r.texts[p] === null ? '<p class="said muted">Pleaded the Fifth.</p>' : saidText(s.r.texts[p]));
    const giver = (p) => (p === 'p1' ? 'p2' : 'p1');
    const panel = (p) => card(p, pname(v, p), said(p), s.stage === 'verdict' && s.r.texts[p] !== null ? `<p class="hearts">${heartsText(s.r.hearts[giver(p)])}</p>` : '');
    return `${eyebrow(s)}<h1 class="question small">${esc(s.q.q)}</h1>
      <div class="duel tall">${panel('p1')}${panel('p2')}</div>
      ${s.stage === 'reveal' ? quip('Read it. Then give it hearts on your phone.') : ''}`;
  },

  final(v) {
    const s = v.step;
    if (s.stage === 'wager') {
      return `<div class="center">
        <p class="eyebrow">All or Nothing</p>
        <h1 class="question">Place your wagers.</h1>
        <p class="rules">Match, and you each gain what you bet. Miss, and you each lose it. Your partner can't see your number.</p>
      </div>`;
    }
    if (s.stage === 'answer') {
      return `<p class="eyebrow">All or Nothing · No talking</p><h1 class="question">${esc(s.q.q)}</h1>${options(s)}`;
    }
    const { picks, wagers, match } = s.r;
    const panel = (p) => card(p, pname(v, p), `<p class="big">${esc(s.q.options[picks[p]])}</p>
      <p class="guess">Bet ${wagers[p]} · <b>${match ? '+' : '−'}${wagers[p]}</b></p>`);
    return `<p class="eyebrow">All or Nothing</p><h1 class="question small">${esc(s.q.q)}</h1>
      <div class="duel">${panel('p1')}${panel('p2')}</div>
      ${stamp(match ? 'Perfect match' : 'So close. So far.', match ? 'good' : 'bad')}`;
  },

  winner(v) {
    const lead = v.leader;
    const scoreLine = `${v.players.p1.score} to ${v.players.p2.score}`;
    return `<div class="center">
      <p class="eyebrow">Tonight's champion</p>
      <h1 class="logo champ ${lead || ''}">${lead ? pname(v, lead) : 'It\'s a tie'}</h1>
      <p class="rules">${lead ? `By a score of ${scoreLine}. Please be insufferable about it for no more than 48 hours.` : `${scoreLine}. Dead even, and neither of you will accept that. You can both spin.`}</p>
    </div>`;
  },

  wheel(v) {
    const s = v.step;
    const n = s.prizes.length;
    const slice = 360 / n;
    const point = (deg) => {
      const rad = (deg - 90) * (Math.PI / 180);
      return `${50 + 50 * Math.cos(rad)} ${50 + 50 * Math.sin(rad)}`;
    };
    const wedges = s.prizes.map((_, i) => `<path d="M50 50 L${point(i * slice)} A50 50 0 0 1 ${point((i + 1) * slice)} Z" class="w${i % 4}"/>`).join('');
    const labels = s.prizes.map((_, i) => {
      const rad = ((i + 0.5) * slice - 90) * (Math.PI / 180);
      return `<text x="${50 + 34 * Math.cos(rad)}" y="${50 + 34 * Math.sin(rad)}">${i + 1}</text>`;
    }).join('');
    const who = v.leader ? pname(v, v.leader) : 'Either of you';
    return `<div class="wheel-wrap">
      <div class="wheel"><div class="pointer"></div><svg id="wheel" viewBox="0 0 100 100">${wedges}${labels}</svg></div>
      <div class="wheel-side">
        <p class="eyebrow">The Wheel of Consequences</p>
        <ol class="prizes" id="prizes">${s.prizes.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
        <p class="rules" id="wheel-note">${s.stage === 'spin' ? `${who} can spin it from your phone.` : 'Round and round…'}</p>
      </div>
    </div>`;
  },

  blot(v) {
    const s = v.step;
    const art = s.q.seed ? blotSvg(s.q.seed) : `<div class="word-card">${esc(s.q.word)}</div>`;
    if (s.stage === 'answer') {
      return `${eyebrow(s)}<div class="blot-stage">${art}<div><h1 class="question small">${esc(s.q.q)}</h1>${quip('Write what you get first, then guess what they got.')}</div></div>`;
    }
    const panel = (p, o) => {
      const verdict = s.stage === 'verdict' ? (s.r.close[o] ? ' <b>✓ +100</b>' : ' <b>✗</b>') : '';
      return card(p, pname(v, p), `${saidText(s.r.saw[p])}<p class="guess ${s.stage === 'verdict' && s.r.close[o] ? 'right' : 'wrong'}">${pname(v, o)} guessed: ${esc(s.r.guesses[o])}${verdict}</p>`);
    };
    return `${eyebrow(s)}<div class="blot-row">${art}<div class="duel">${panel('p1', 'p2')}${panel('p2', 'p1')}</div></div>${s.stage === 'reveal' ? quip('On your phone: did they get close to what you saw?') : ''}`;
  },

  brain(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      return `${eyebrow(s)}<h1 class="question">${esc(s.q.title)}</h1><p class="rules">${esc(s.q.q)}</p>${quip('Eyes on your phones. Rex will wait.')}`;
    }
    const panel = (p) => card(p, pname(v, p), `<p class="big">${esc(s.r.labels[p])}</p>`);
    return `${eyebrow(s)}<h1 class="question small">${esc(s.q.title)}</h1>
      <div class="duel">${panel('p1')}${panel('p2')}</div>
      ${stamp(s.r.winner ? `${v.players[s.r.winner].name} wins. +150` : 'Dead even. +100 each', 'good')}`;
  },

  card(v) {
    const s = v.step;
    return `<div class="center"><p class="eyebrow">${esc(s.q.title)}</p><h1 class="question">${esc(s.q.q)}</h1></div>`;
  },

  closing(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      return `<div class="center">
        <p class="eyebrow">Closing statements</p>
        <h1 class="question">${s.q ? esc(s.q.q) : 'The game is over and nothing is on the line.<br>In one sentence: why would you do all this again with them?'}</h1>
      </div>`;
    }
    return `<p class="eyebrow">Closing statements</p>
      <div class="duel tall">
        ${card('p1', pname(v, 'p1'), saidText(s.r.texts.p1))}
        ${card('p2', pname(v, 'p2'), saidText(s.r.texts.p2))}
      </div>
      ${quip('The defense rests. Rex needs a minute.')}`;
  },

  credits(v) {
    const r = v.report;
    const champ = (obj, ifTie) => {
      if (obj.p1 === obj.p2) return ifTie;
      return v.players[obj.p1 > obj.p2 ? 'p1' : 'p2'].name;
    };
    const rows = [
      ['Most stubborn', champ(r.stands, 'A dead heat')],
      ['Most gracious', champ(r.concedes, 'Equally so')],
      ['Best mind reader', champ(r.hits, 'Evenly matched')],
      ...(r.brain.p1 || r.brain.p2 ? [['Won more brain tests', champ(r.brain, 'Dead even')]] : []),
      ['Most hearts earned', champ(r.hearts, 'Shared')],
      ['Agreed / argued', `${r.agrees} / ${r.fights}`],
      ['Widest gap', r.biggestGap ? `${r.biggestGap.gap} points apart: "${r.biggestGap.q}"` : 'None'],
    ];
    return `<div class="report">
      <div class="sync"><p class="eyebrow">Official sync score</p><div class="logo">${r.sync}%</div><p>Not that anyone's counting. You're both counting.</p></div>
      <dl>${rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
      <div class="report-end">
        <p class="logo small-logo">Goodnight!</p>
        ${v.menu ? `<a class="big-next" href="${esc(v.menu)}">Back to the menu</a>` : '<button class="big-next" id="again">Run it back</button>'}
      </div>
    </div>`;
  },
};

// ---- Score plates ----

function renderScores(v) {
  const visible = v.step.t !== 'lobby';
  scores.hidden = !visible;
  if (!visible) { scores.innerHTML = ''; return; }
  if (!scores.children.length) {
    scores.innerHTML = ['p1', 'p2'].map((p) => `<div class="plate ${p}" data-p="${p}"><span class="lamp"></span><span class="pl-name"></span><span class="pl-score"></span></div>`).join('');
  }
  for (const p of ['p1', 'p2']) {
    const plate = scores.querySelector(`[data-p="${p}"]`);
    const player = v.players[p];
    plate.querySelector('.pl-name').textContent = player.name;
    plate.classList.toggle('locked', v.locked[p]);
    plate.classList.toggle('away', !player.online);
    rollScore(plate.querySelector('.pl-score'), p, player.score);
  }
}

function rollScore(el, p, target) {
  const from = shownScore[p];
  shownScore[p] = target;
  if (from === target) { el.textContent = target; return; }
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min((now - start) / 900, 1);
    el.textContent = Math.round(from + (target - from) * k);
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---- Things that happen once per screen ----

function afterRender(v) {
  clearInterval(timer);
  const s = v.step;
  if (s.t === 'finger' && s.stage === 'debate') startClock(v);
  if (s.t === 'wheel' && s.stage === 'result') spinWheel(s);
  if (s.t === 'winner') confetti();
}

function startClock(v) {
  const clock = document.getElementById('clock');
  const offset = Date.now() - v.now;
  let last = null;
  const update = () => {
    const left = Math.max(0, Math.ceil((v.step.r.endsAt - (Date.now() - offset)) / 1000));
    if (left === last) return;
    last = left;
    clock.textContent = left || 'Time!';
    clock.classList.toggle('urgent', left <= 10);
    if (left > 0 && left <= 10) play('tick');
    if (left === 0) { play('buzzer'); clearInterval(timer); }
  };
  update();
  timer = setInterval(update, 200);
}

function spinWheel(s) {
  const wheel = document.getElementById('wheel');
  const slice = 360 / s.prizes.length;
  const end = 360 * 7 - (s.result + 0.5) * slice;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    wheel.style.transform = `rotate(${end}deg)`;
  }));
  setTimeout(() => {
    document.querySelectorAll('#prizes li')[s.result]?.classList.add('won');
    const note = document.getElementById('wheel-note');
    if (note) note.textContent = `It is written. No appeals.`;
    play('ding');
    confetti();
  }, 5200);
}

function confetti() {
  const box = document.getElementById('confetti');
  const colors = ['#ff5a36', '#25c6b5', '#ffc23d', '#fff1d6'];
  box.innerHTML = Array.from({ length: 90 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 1.4;
    const dur = 2.4 + Math.random() * 2;
    return `<i style="left:${left}%;background:${colors[i % 4]};animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
  }).join('');
  setTimeout(() => { box.innerHTML = ''; }, 6000);
}

function soundFor(v) {
  const s = v.step;
  const r = s.r || {};
  if (s.t === 'round') return s.soft ? 'soft' : 'fanfare';
  if (s.t === 'blot' && s.stage === 'verdict') return r.close.p1 || r.close.p2 ? 'ding' : 'buzzer';
  if (s.t === 'brain' && s.stage === 'reveal') return 'ding';
  if (s.t === 'winner') return 'fanfare';
  if (s.t === 'soft' && s.stage === 'answer') return 'soft';
  if (s.t === 'mind' && s.stage === 'reveal') return r.right.p1 || r.right.p2 ? 'ding' : 'buzzer';
  if (s.t === 'finger' && s.stage === 'reveal') return r.agree ? 'ding' : 'siren';
  if (s.t === 'finger' && s.stage === 'verdict') return r.stand.p1 && r.stand.p2 ? 'buzzer' : 'ding';
  if (s.t === 'gap' && s.stage === 'reveal') return r.pts ? 'ding' : 'siren';
  if (s.t === 'receipts' && s.stage === 'verdict') return r.pts ? 'ding' : 'buzzer';
  if (s.t === 'final' && s.stage === 'reveal') return r.match ? 'fanfare' : 'buzzer';
  if (s.t === 'wheel' && s.stage === 'result') return 'spin';
  if (s.t === 'closing' && s.stage === 'reveal') return 'soft';
  return null;
}

// ---- Main loop ----

let lastLocked = { p1: false, p2: false };

function onView(v) {
  renderScores(v);
  const s = v.step;
  const lobbyKey = s.t === 'lobby' ? JSON.stringify([v.players, v.note]) : '';
  const key = JSON.stringify([v.i, s.stage, s.r, lobbyKey]);

  if (v.locked.p1 && !lastLocked.p1 || v.locked.p2 && !lastLocked.p2) play('lock');
  lastLocked = v.locked;

  if (key === lastKey) return;
  lastKey = key;
  document.body.dataset.segment = s.t;
  const note = s.q?.note && ['reveal', 'verdict'].includes(s.stage) ? `<p class="note">${esc(s.q.note)}</p>` : '';
  stage.innerHTML = `<div class="screen">${SCREENS[s.t](v)}${note}</div>`;
  afterRender(v);

  const soundKey = `${v.i}:${s.stage}`;
  if (soundKey !== lastSound) {
    lastSound = soundKey;
    const sound = soundFor(v);
    if (sound) play(sound);
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-next]')) Show.send('next');
  if (e.target.closest('#again')) Show.send('restart');
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    navigator.clipboard.writeText(Show.view.links[copy.dataset.copy]);
    copy.textContent = 'link copied';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowRight') {
    e.preventDefault();
    if (Show.view?.canNext) Show.send('next');
  }
  if (e.key === 'm' || e.key === 'M') muted = !muted;
});

Show.connect(onView);
