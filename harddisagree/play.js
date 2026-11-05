// The phone: private answers. Re-renders only when something this player can
// act on has changed, so a half-typed answer survives the other phone's activity.

const app = document.getElementById('app');
const bar = document.getElementById('bar');
const offline = document.getElementById('offline');

const DEFAULT_NAMES = { p2: 'Jasmine' };
const ME = Show.role;
const THEM = ME === 'p1' ? 'p2' : 'p1';
const LETTERS = 'ABCDE';
const MAX_TEXT = 280;

document.documentElement.dataset.player = ME;

let lastKey = '';
let lastStep = null;
let firstPick = null; // Mind Games: own answer, held until the guess is made too.
let offlineTimer = null;

const them = (v) => esc(v.players[THEM].name);

const head = (s) => (s.roundTitle ? `<p class="eyebrow">${esc(s.roundTitle)} · ${s.n} of ${s.of}</p>` : '');
const prompt = (s) => `<h1 class="q">${esc(s.q.q)}</h1>`;
const nextBtn = (v, label = 'Next') => (v.canNext ? `<button class="next" data-next>${label}</button>` : '');
const watch = (v, text = 'Eyes on the big screen.', label = 'Next') => `<div class="watch"><p class="logo">${esc(text)}</p>${nextBtn(v, label)}</div>`;
const waiting = () => '<div class="watch"><div class="locked-in">Locked in</div><p id="wait-note" class="waiting"></p></div>';

function optionList(items, attr) {
  return `<div class="choices">${items.map((o, i) => `<button class="choice" ${attr}="${i}"><b>${LETTERS[i]}</b><span>${esc(o)}</span></button>`).join('')}</div>`;
}

function textForm(placeholder, submit, fifth) {
  return `<div class="write">
    <textarea id="text" maxlength="${MAX_TEXT}" rows="5" placeholder="${esc(placeholder)}"></textarea>
    <div class="count"><span id="count">0</span>/${MAX_TEXT}</div>
    <button class="next" id="send-text" disabled>${esc(submit)}</button>
    ${fifth || ''}
  </div>`;
}

function fifthBtn(v, note) {
  const left = v.players[ME].fifths;
  if (left < 1) return '<p class="fine">You\'re out of Fifths. Time to talk.</p>';
  return `<button class="fifth" id="fifth">Plead the Fifth (${left} left)</button><p class="fine">${esc(note)}</p>`;
}

// ---- One screen per show segment ----

const SCREENS = {
  lobby(v) {
    const me = v.players[ME];
    if (!me.joined) {
      return `<div class="join">
        <p class="logo">Hard<br>Disagree</p>
        <p class="sub">What should Rex call you?</p>
        <input id="name" maxlength="16" autocomplete="given-name" placeholder="Your name" value="${esc(DEFAULT_NAMES[ME] || '')}">
        <button class="next" id="join">I'm ready</button>
      </div>`;
    }
    const partner = v.players[THEM];
    return `<div class="watch">
      <p class="logo">You're in, ${esc(me.name)}.</p>
      <p class="waiting">${partner.joined ? `${esc(partner.name)} is here too.` : 'Waiting for your opponent to scan in…'}</p>
      ${nextBtn(v, 'Start the show')}
    </div>`;
  },

  welcome: (v) => watch(v),
  round: (v) => `<div class="watch"><p class="eyebrow">Round ${v.round.number} of ${v.round.count}</p><p class="logo">${esc(v.round.title)}</p><p class="rule-text">${esc(v.round.rules)}</p>${nextBtn(v, "Let's go")}</div>`,

  mind(v) {
    const s = v.step;
    if (s.stage !== 'answer') return watch(v);
    if (v.mine !== undefined) return waiting(v);
    if (firstPick === null) {
      return `${head(s)}${prompt(s)}<p class="ask">Your answer</p>${optionList(s.q.options, 'data-mine')}`;
    }
    return `${head(s)}${prompt(s)}<p class="ask">What did <em>${them(v)}</em> pick?</p>${optionList(s.q.options, 'data-guess')}<button class="back" data-back>Change my answer</button>`;
  },

  finger(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      if (v.mine !== undefined) return waiting(v);
      return `${head(s)}${prompt(s)}<div class="point">
        <button class="choice tall ${ME}" data-point="${ME}">Me</button>
        <button class="choice tall ${THEM}" data-point="${THEM}">${them(v)}</button>
      </div>`;
    }
    if (s.stage === 'debate') return watch(v, 'Argue!', "We're done arguing");
    if (s.stage === 'standoff') {
      if (v.mine !== undefined) return waiting(v);
      return `<p class="eyebrow">The standoff</p>${prompt(s)}<div class="point">
        <button class="choice tall stand" data-stand="1">Stand my ground</button>
        <button class="choice tall concede" data-stand="0">Fine. You're right.</button>
      </div><p class="fine">Decide in secret. Check the big screen for what's at stake.</p>`;
    }
    return watch(v);
  },

  gap(v) {
    const s = v.step;
    if (s.stage !== 'answer') return watch(v);
    if (v.mine !== undefined) return waiting(v);
    return `${head(s)}${prompt(s)}<div class="slider">
      <output id="val">5</output>
      <input id="range" type="range" min="0" max="10" step="1" value="5">
      <div class="ends"><span>${esc(s.q.low)}</span><span>${esc(s.q.high)}</span></div>
    </div><button class="next" id="send-range">Lock it in</button>`;
  },

  receipts(v) {
    const s = v.step;
    const hot = s.subject === ME;
    if (s.stage === 'answer') {
      if (v.mine !== undefined) return waiting(v);
      if (hot) {
        return `${head(s)}${prompt(s)}<p class="ask">You're in the hot seat. Tell the truth.</p>
          ${textForm('The truth, please…', 'Lock in the truth', fifthBtn(v, `Pleading the Fifth gives ${v.players[THEM].name} 100 points.`))}`;
      }
      return `${head(s)}${prompt(s)}<p class="ask">Your best guess?</p>${textForm('Your guess…', 'Lock in my guess')}`;
    }
    if (s.stage === 'reveal') {
      if (!hot) return watch(v, 'You are being judged.');
      return `<p class="eyebrow">You're the judge</p>
        <div class="quoted"><span>${them(v)} guessed</span>${esc(s.r.guess)}</div>
        <div class="choices">
          <button class="choice" data-judge="200"><b>200</b><span>Nailed it</span></button>
          <button class="choice" data-judge="100"><b>100</b><span>Close enough</span></button>
          <button class="choice" data-judge="0"><b>0</b><span>Who even are you?</span></button>
        </div>`;
    }
    return watch(v);
  },

  soft(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      if (v.mine !== undefined) return waiting(v);
      return `${head(s)}${prompt(s)}${textForm('Say the real thing…', 'Lock it in', fifthBtn(v, 'Skips this one. No points for your answer, no questions asked.'))}`;
    }
    if (s.stage === 'reveal') {
      if (s.r.texts[THEM] === null) return watch(v, `${v.players[THEM].name} passed on this one.`);
      if (v.mine !== undefined) return waiting(v);
      return `<p class="eyebrow">From ${them(v)}</p><div class="quoted">${esc(s.r.texts[THEM])}</div>
        <p class="ask">How much did that get you?</p>
        <div class="heart-row">${[1, 2, 3].map((n) => `<button class="heart" data-heart="${n}">${'♥'.repeat(n)}</button>`).join('')}</div>`;
    }
    return watch(v);
  },

  final(v) {
    const s = v.step;
    if (s.stage === 'wager') {
      if (v.mine !== undefined) return waiting(v);
      const start = Math.min(100, v.maxWager);
      return `<p class="eyebrow">All or Nothing</p><h1 class="q">How much are you betting on the two of you?</h1>
        <div class="slider">
          <output id="val">${start}</output>
          <input id="range" type="range" min="0" max="${v.maxWager}" step="10" value="${start}">
          <div class="ends"><span>0</span><span>${v.maxWager}</span></div>
        </div>
        <p class="fine">Match and you both gain your bet. Miss and you both lose it.</p>
        <button class="next" id="send-range">Lock in my bet</button>`;
    }
    if (s.stage === 'answer') {
      if (v.mine !== undefined) return waiting(v);
      return `<p class="eyebrow">You bet ${v.myWager} · No talking</p>${prompt(s)}${optionList(s.q.options, 'data-final')}`;
    }
    return watch(v);
  },

  winner(v) {
    const text = !v.leader ? 'A tie. Somehow.' : v.leader === ME ? 'You won!' : `${v.players[v.leader].name} won.`;
    return watch(v, text);
  },

  wheel(v) {
    const s = v.step;
    if (s.stage === 'spin') {
      if (!v.leader || v.leader === ME) return `<div class="watch"><p class="logo">Your wheel.</p><button class="next spin" data-spin>Spin it!</button></div>`;
      return watch(v, 'Your fate is in their hands.');
    }
    return watch(v);
  },

  closing(v) {
    const s = v.step;
    if (s.stage === 'answer') {
      if (v.mine !== undefined) return waiting(v);
      return `<p class="eyebrow">Closing statement</p><h1 class="q">In one sentence: why would you do all this again with ${them(v)}?</h1>${textForm('Nothing is on the line now…', 'Rest my case')}`;
    }
    return watch(v, 'Look up. Then look at them.');
  },

  credits: () => '<div class="watch"><p class="logo">That\'s the show.</p><p class="waiting">Put the phone down. You have someone to talk to.</p></div>',
};

// ---- Wiring the current screen ----

function bindInputs() {
  const text = document.getElementById('text');
  if (text) {
    const send = document.getElementById('send-text');
    const count = document.getElementById('count');
    text.addEventListener('input', () => {
      count.textContent = text.value.length;
      send.disabled = !text.value.trim();
    });
    send.addEventListener('click', () => {
      send.disabled = true;
      Show.send('answer', { value: { text: text.value } });
    });
  }
  const range = document.getElementById('range');
  if (range) {
    const val = document.getElementById('val');
    range.addEventListener('input', () => { val.textContent = range.value; });
    document.getElementById('send-range').addEventListener('click', () => Show.send('answer', { value: Number(range.value) }));
  }
  document.getElementById('fifth')?.addEventListener('click', () => Show.send('answer', { value: { fifth: true } }));
  const join = document.getElementById('join');
  if (join) {
    const name = document.getElementById('name');
    const go = () => { if (name.value.trim()) Show.send('join', { name: name.value }); };
    join.addEventListener('click', go);
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }
}

app.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if ('next' in d) Show.send('next');
  if ('spin' in d) Show.send('spin');
  if ('back' in d) { firstPick = null; lastKey = ''; onView(Show.view); }
  if (d.mine !== undefined) { firstPick = Number(d.mine); lastKey = ''; onView(Show.view); }
  if (d.guess !== undefined) Show.send('answer', { value: { mine: firstPick, guess: Number(d.guess) } });
  if (d.point !== undefined) Show.send('answer', { value: d.point });
  if (d.stand !== undefined) Show.send('answer', { value: d.stand === '1' });
  if (d.judge !== undefined) Show.send('judge', { value: Number(d.judge) });
  if (d.heart !== undefined) Show.send('heart', { value: Number(d.heart) });
  if (d.final !== undefined) Show.send('answer', { value: Number(d.final) });
  if (b.dataset.next === undefined) b.classList.add('pressed');
});

function renderBar(v) {
  const me = v.players[ME];
  if (!me.joined) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<span class="me">${esc(me.name)}</span><span class="pts">${me.score}</span>`;
  const note = document.getElementById('wait-note');
  if (note) note.textContent = v.locked[THEM] ? 'Revealing…' : `Waiting on ${v.players[THEM].name}. Don't look at their phone.`;
}

function onView(v) {
  const s = v.step;
  if (v.i !== lastStep) firstPick = null;
  lastStep = v.i;
  // The partner joining only matters once this player is in; until then it would wipe a half-typed name.
  const partnerJoined = v.players[ME].joined && v.players[THEM].joined;
  const key = JSON.stringify([v.i, s.stage, v.mine, s.r, v.canNext, firstPick, v.players[ME].joined, partnerJoined]);
  if (key !== lastKey) {
    lastKey = key;
    app.innerHTML = `<div class="pane">${SCREENS[s.t](v)}</div>`;
    window.scrollTo(0, 0);
    bindInputs();
  }
  renderBar(v);
}

Show.connect(onView, (ok) => {
  clearTimeout(offlineTimer);
  if (ok) offline.hidden = true;
  else offlineTimer = setTimeout(() => { offline.hidden = false; }, 4000);
});
