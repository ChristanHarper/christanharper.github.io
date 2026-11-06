// The main menu: unlock with the passcode, then choose a show and an episode.

const stageEl = document.getElementById('stage');
const BUILD = new URL(document.currentScript.src).searchParams.get('v') || '';

function renderGate(problem) {
  stageEl.innerHTML = `<div class="screen"><div class="gate">
    <div class="logo menu-logo">Game Night</div>
    <p class="tagline">Enter the passcode.</p>
    <input id="pass" type="password" autocomplete="off" aria-label="Passcode">
    ${problem ? `<p class="problem">${esc(problem)}</p>` : ''}
    <button class="big-next" id="unlock">Open the studio</button>
  </div></div>`;
  const input = document.getElementById('pass');
  const go = () => unlock(input.value);
  document.getElementById('unlock').addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  input.focus();
}

async function unlock(passcode) {
  if (!passcode.trim()) return;
  try {
    const vault = await Vault.open(passcode);
    Vault.remember(passcode.trim());
    await renderMenu(vault);
  } catch (err) {
    console.error(err);
    Vault.forget();
    renderGate('That passcode didn\'t open it.');
  }
}

async function playedEpisodes(vault) {
  await signIn();
  const doc = await db.collection('hd_progress').doc(await vault.progressId()).get();
  return doc.exists ? doc.data().played : [];
}

function savedEpisode() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    return saved?.state && Date.now() - saved.savedAt < SAVE_HOURS * 3600000 ? saved.ep : null;
  } catch {
    return null;
  }
}

async function renderMenu(vault) {
  stageEl.innerHTML = '<div class="screen"><p class="rules">Checking the schedule…</p></div>';
  let played = [];
  let problem = '';
  try {
    played = await playedEpisodes(vault);
  } catch (err) {
    console.error(err);
    problem = 'Couldn\'t check which episodes you\'ve played, so some may not show as played.';
  }
  const resume = savedEpisode();
  const episode = (e) => {
    if (played.includes(e.id)) return `<div class="episode played"><b>${esc(e.title)}</b><span>Played</span></div>`;
    const isResume = e.id === resume;
    return `<a class="episode ${isResume ? 'resume' : ''}" href="show.html?ep=${encodeURIComponent(e.id)}&v=${BUILD}"><b>${esc(e.title)}</b><span>${isResume ? 'In progress. Pick up where you left off.' : esc(e.blurb)}</span></a>`;
  };
  const show = (s) => `<section class="menu-show"><h2>${esc(s.title)}</h2><p>${esc(s.tagline)}</p>${s.episodes.map(episode).join('')}</section>`;
  const allPlayed = vault.shows.flatMap((s) => s.episodes).every((e) => played.includes(e.id));
  stageEl.innerHTML = `<div class="screen"><div class="menu">
    <div class="logo">Game Night</div>
    <div class="menu-shows">${vault.shows.map(show).join('')}</div>
    ${problem ? `<p class="wifi">${esc(problem)}</p>` : ''}
    ${allPlayed ? '<p class="note">You\'ve played everything. Time to ask Claude for a new batch.</p>' : ''}
  </div></div>`;
}

const remembered = Vault.passcode();
if (remembered) unlock(remembered);
else renderGate();
