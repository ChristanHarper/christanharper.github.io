// The private casting form. Answers are encrypted on this device with a key from
// the link's #fragment, which browsers never send anywhere, so the database only
// ever holds ciphertext.

const SECTIONS = [
  {
    title: 'Our story',
    prompts: [
      ['met', 'How did you meet, and what was your honest first impression?'],
      ['knew', 'When did you know this was serious?'],
      ['bestDay', 'Describe the best day you\'ve had together.'],
      ['chaos', 'What\'s your best chaotic story together: a disaster, a trip, a night out?'],
      ['jokes', 'List your inside jokes, nicknames, and references only you two would get.'],
      ['remember', 'What small moment do you remember that they\'ve probably forgotten?'],
    ],
  },
  {
    title: 'Everyday life',
    prompts: [
      ['facts', 'Give five facts about you that they should absolutely know: favorites, orders, routines, pet peeves.'],
      ['stump', 'Give three true things about you they would probably get wrong.'],
      ['love', 'What habit of theirs do you secretly love?'],
      ['annoy', 'What habit of theirs drives you up the wall?'],
      ['chores', 'Who really does more around the house or for the relationship? Make your case.'],
      ['upset', 'What do they do when they\'re upset, and what do you wish they did instead?'],
    ],
  },
  {
    title: 'What you argue about',
    prompts: [
      ['repeat', 'What argument keeps coming back? Give your side, and be as unfair as you like.'],
      ['worstFight', 'What was your worst fight, and what was it really about?'],
      ['right', 'What are you still sure you were right about?'],
      ['letGo', 'What have you said you let go of, but haven\'t?'],
      ['unsaid', 'What do you hold back from saying because it would start something?'],
      ['money', 'Where do you two really differ on money?'],
      ['people', 'Which of their friends or family members is hardest for you, and why?'],
      ['jealous', 'What makes you jealous, even if it shouldn\'t?'],
    ],
  },
  {
    title: 'Attraction and sex',
    note: 'Keep it frank, not graphic. The show will ask about these themes, not read out your words. Skip this section if you\'d like.',
    prompts: [
      ['attract', 'What do you find most attractive about them that they wouldn\'t guess?'],
      ['desired', 'When have you felt most wanted by them?'],
      ['more', 'What do you want more of, physically or romantically?'],
      ['mismatch', 'Where do you two want different things in bed or in how often?'],
      ['curious', 'What are you curious about trying that you haven\'t brought up?'],
    ],
  },
  {
    title: 'The future and the scary stuff',
    prompts: [
      ['fiveYears', 'Where do you honestly see the two of you in five years?'],
      ['bigDecisions', 'Where do you stand on the big ones: marriage, kids, where to live? Where do you think they stand?'],
      ['worry', 'What worries you most about the two of you?'],
      ['leave', 'What would actually make you walk away?'],
      ['change', 'If you could change one thing about the relationship tomorrow, what would it be?'],
    ],
  },
  {
    title: 'How you\'re wired',
    prompts: [
      ['childhood', 'What from growing up explains you the most?'],
      ['stress', 'How do you act under stress, and do you think they see it accurately?'],
      ['decide', 'How do you make big decisions: gut, research, asking everyone, or panic?'],
      ['misread', 'What do they consistently misunderstand about how your brain works?'],
      ['secretSelf', 'What do you think about most that they have no idea about?'],
    ],
  },
];

const LIMITS = [
  { key: 'sex', label: 'How should the show handle sex?', options: ['Frank but not graphic', 'Flirty only', 'Leave it out'] },
  { key: 'hard', label: 'How hard should the show hit?', options: ['Go for the throat', 'Blunt', 'Playful jabs'] },
];

const app = document.getElementById('app');
const [who, token, keyText] = location.hash.slice(1).split('.');
const DRAFT_KEY = `hard-disagree-intake-${token}`;

const toBytes = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
  } catch {
    return {};
  }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collect()));
  } catch {
    // Without storage the form still works, it just can't survive a closed tab.
  }
}

function collect() {
  const answers = {};
  app.querySelectorAll('[data-field]').forEach((el) => {
    if (el.type === 'radio') {
      if (el.checked) answers[el.dataset.field] = el.value;
    } else if (el.type === 'checkbox') {
      answers[el.dataset.field] = el.checked;
    } else if (el.value.trim()) {
      answers[el.dataset.field] = el.value;
    }
  });
  return answers;
}

function render() {
  const draft = loadDraft();
  const fallbackName = who === 'jasmine' ? 'Jasmine' : '';
  const limits = LIMITS.map((l) => `<fieldset class="limit"><legend>${esc(l.label)}</legend>${l.options.map((o) => `
    <label><input type="radio" name="${l.key}" data-field="${l.key}" value="${esc(o)}" ${draft[l.key] === o ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</fieldset>`).join('');
  const sections = SECTIONS.map((s) => `<section>
    <h2>${esc(s.title)}</h2>
    ${s.note ? `<p class="fine left">${esc(s.note)}</p>` : ''}
    ${s.prompts.map(([key, text]) => `<label class="prompt"><span>${esc(text)}</span><textarea data-field="${key}" rows="3" maxlength="1500">${esc(draft[key] || '')}</textarea></label>`).join('')}
  </section>`).join('');

  app.innerHTML = `<div class="pane">
    <p class="logo intake-logo">Casting</p>
    <p class="rule-text">This is how the next show gets written about the two of you. Answer alone, and skip anything you like: short and honest beats long and polished.</p>
    <ul class="promises">
      <li>Your partner won't be shown this form, but what you write here will shape questions you'll both see, so details could surface during the game.</li>
      <li>Claude, the AI writing the show, reads your answers to write it. They're encrypted on this phone before being stored, and deleted from the database once collected.</li>
      <li>This form is then kept on the computer used to make the show. Your answers during each show are kept there too, and backed up to a private GitHub repo. Claude uses them to write future shows. Whoever owns that computer and repo could open these files, so this part runs on trust.</li>
      <li>Leave out anything it wouldn't be safe or okay to have come up in front of them.</li>
    </ul>
    <label class="prompt"><span>Your name</span><input class="field" data-field="name" maxlength="30" value="${esc(draft.name || fallbackName)}"></label>
    <section>
      <h2>Your limits</h2>
      <p class="fine left">The show follows whichever of you chose the gentler setting.</p>
      ${limits}
      <label class="prompt"><span>Anything completely off limits?</span><textarea data-field="offLimits" rows="2" maxlength="1000">${esc(draft.offLimits || '')}</textarea></label>
    </section>
    ${sections}
    <label class="adult"><input type="checkbox" data-field="adult" ${draft.adult ? 'checked' : ''}> I'm 18 or older and I'm choosing to take part.</label>
    <p id="problem" class="problem" hidden></p>
    <button class="next" id="send">Send my answers</button>
  </div>`;

  app.addEventListener('input', saveDraft);
  document.getElementById('send').addEventListener('click', send);
}

async function encrypt(answers) {
  const key = await crypto.subtle.importKey('raw', toBytes(keyText), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(answers)));
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

async function send() {
  const button = document.getElementById('send');
  const problem = document.getElementById('problem');
  const answers = collect();
  const missing = [];
  if (!answers.name) missing.push('your name');
  if (!answers.sex || !answers.hard) missing.push('both limits');
  if (!answers.adult) missing.push('the 18+ box');
  problem.hidden = !missing.length;
  if (missing.length) {
    problem.textContent = `Still needed: ${missing.join(', ')}.`;
    return;
  }

  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    await signIn();
    await db.collection('hd_intake').doc(token).set(await encrypt(answers));
    localStorage.removeItem(DRAFT_KEY);
    app.removeEventListener('input', saveDraft);
    app.innerHTML = '<div class="pane"><div class="watch"><p class="logo">You\'re cast.</p><p class="waiting">Your answers are locked away. Don\'t tell them what you wrote.</p></div></div>';
  } catch (err) {
    console.error(err);
    problem.hidden = false;
    problem.textContent = 'That didn\'t send, but your answers are still here. Check your connection and try again.';
    button.disabled = false;
    button.textContent = 'Send my answers';
  }
}

if (token && keyText) render();
else app.innerHTML = '<div class="pane"><div class="watch"><p class="logo">Wrong link.</p><p class="waiting">Open the full link you were sent.</p></div></div>';
