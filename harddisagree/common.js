// Online version of the shared connection layer, for static hosting.
// The big-screen tab runs the game. Firestore carries each phone's private view
// and its actions, so phones can join from any network.
//
//   hd_rooms/{room}                owned by the big screen's anonymous user
//   hd_rooms/{room}/views/{token}  one player's view, readable only with their token
//   hd_rooms/{room}/actions/{id}   phone-to-screen inbox, deleted once handled

const PARAMS = new URLSearchParams(location.search);
const SAVE_KEY = 'hard-disagree-show';
const SAVE_HOURS = 12;
const HELLO_MS = 25000;
const ONLINE_MS = 70000;
const PRESENCE_CHECK_MS = 10000;
const FIRST_VIEW_MS = 8000;
const CLEANUP_MS = 60000;
const EXPIRE_MS = 2 * 24 * 3600000;

// A named app keeps this anonymous sign-in separate from the site's own login,
// which shares this origin's browser storage.
const firebaseApp = firebase.initializeApp({
  apiKey: 'AIzaSyDXJKlER0Ii-VKkVMEjLKPjx4Tv1-46DXE',
  authDomain: 'my-website-529cc.firebaseapp.com',
  projectId: 'my-website-529cc',
  storageBucket: 'my-website-529cc.firebasestorage.app',
  messagingSenderId: '698883805148',
  appId: '1:698883805148:web:3519bc8f1775a381830919',
}, 'hard-disagree');
const auth = firebaseApp.auth();
const db = firebaseApp.firestore();

const Show = {
  role: PARAMS.get('p') || 'host',
  key: PARAMS.get('k') || '',
  view: null,
  deliver: () => {},

  connect(onView, onStatus) {
    if (Show.role === 'host') startBigScreen(onView);
    else startPhone(onView, onStatus);
  },

  send(type, extra = {}) {
    const { i, step } = Show.view || {};
    Show.deliver({ role: Show.role, type, i, stage: step?.stage, ...extra });
  },
};

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signIn() {
  if (!auth.currentUser) await auth.signInAnonymously();
  return auth.currentUser.uid;
}

const roomRef = (room) => db.collection('hd_rooms').doc(room);

// ---- The big screen: holds the game and hands each phone only its own view ----

function loadSession() {
  try {
    if (PARAMS.has('new')) return null;
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    return saved && Date.now() - saved.savedAt < SAVE_HOURS * 3600000 ? saved : null;
  } catch {
    return null;
  }
}

function saveSession(session, game) {
  try {
    // Once the show is over there is nothing to resume, so drop the answers.
    const finished = game.state().steps[game.state().i].t === 'credits';
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...session, state: finished ? null : game.state(), savedAt: Date.now() }));
  } catch {
    // Private windows can refuse storage. The show still runs, it just can't survive a refresh.
  }
}

function qrImage(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return `data:image/svg+xml,${encodeURIComponent(qr.createSvgTag({ cellSize: 8, margin: 8, scalable: true }))}`;
}

function setupProblem(err) {
  if (err.code === 'auth/admin-restricted-operation' || err.code === 'auth/operation-not-allowed') return 'Setup needed: turn on anonymous sign-in in Firebase.';
  if (err.code === 'permission-denied') return 'Setup needed: add the Hard Disagree rules in Firebase.';
  return 'Can\'t reach Firebase. Check this computer\'s connection, then refresh.';
}

function startBigScreen(onView) {
  const session = loadSession() || { room: randomHex(8), tokens: { p1: randomHex(6), p2: randomHex(6) }, state: null };
  const { room, tokens } = session;
  const game = createShow(QUESTIONS, session.state);
  const seen = { p1: 0, p2: 0 };
  const isOnline = (p) => Date.now() - seen[p] < ONLINE_MS;
  const written = {};
  let wasOnline = '';
  let note = 'Opening the studio…';
  let ready = false;
  let cleanup = null;

  const link = (p) => {
    const url = new URL('play.html', location.href);
    url.search = new URLSearchParams({ p, room, k: tokens[p] });
    return url.href;
  };
  const links = { p1: link('p1'), p2: link('p2') };
  const qr = { p1: qrImage(links.p1), p2: qrImage(links.p2) };
  const expireAt = () => firebase.firestore.Timestamp.fromMillis(Date.now() + EXPIRE_MS);
  const fail = (err) => {
    console.error(err);
    note = setupProblem(err);
    publish();
  };

  function writeViews() {
    if (!ready) return;
    for (const p of ['p1', 'p2']) {
      const { now, ...view } = game.viewFor(p, isOnline);
      const json = JSON.stringify(view);
      if (written[p] === json) continue;
      written[p] = json;
      roomRef(room).collection('views').doc(tokens[p]).set({ json: JSON.stringify({ ...view, now }), expireAt: expireAt() }).catch(fail);
    }
  }

  // Each view only holds the current screen, so once the credits have had time to
  // reach the phones, the show's data can leave the database.
  function scheduleCleanup() {
    const finished = game.state().steps[game.state().i].t === 'credits';
    if (!finished) {
      clearTimeout(cleanup);
      cleanup = null;
    } else if (!cleanup) {
      cleanup = setTimeout(() => {
        for (const p of ['p1', 'p2']) {
          delete written[p];
          roomRef(room).collection('views').doc(tokens[p]).delete().catch(console.error);
        }
      }, CLEANUP_MS);
    }
  }

  function publish() {
    saveSession(session, game);
    Show.view = { ...game.viewFor('host', isOnline), qr, links, note };
    onView(Show.view);
    writeViews();
    scheduleCleanup();
  }

  Show.deliver = (body) => {
    game.handle(body);
    publish();
  };

  function onActions(snapshot) {
    let changed = false;
    snapshot.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      const { k, body } = change.doc.data();
      change.doc.ref.delete().catch(console.error);
      const role = ['p1', 'p2'].find((p) => tokens[p] === k);
      if (!role) return;
      seen[role] = Date.now();
      changed = true;
      try {
        const action = JSON.parse(body);
        // The role comes from the verified token, never from the message.
        if (action.type !== 'hello') game.handle({ ...action, role });
      } catch (err) {
        console.error(err);
      }
    });
    if (changed) publish();
  }

  publish();
  signIn()
    .then((uid) => roomRef(room).set({ host: uid, expireAt: expireAt() }))
    .then(() => {
      ready = true;
      note = 'Works from anywhere with internet. Keep this tab open: it is running the show.';
      publish();
      roomRef(room).collection('actions').onSnapshot(onActions, fail);
    })
    .catch(fail);

  setInterval(() => {
    const online = JSON.stringify([isOnline('p1'), isOnline('p2')]);
    if (online !== wasOnline) {
      wasOnline = online;
      publish();
    }
  }, PRESENCE_CHECK_MS);
}

// ---- A phone: watches its own view and posts its actions to the big screen ----

function startPhone(onView, onStatus) {
  const room = roomRef(PARAMS.get('room'));
  let hasView = false;

  Show.deliver = (body) => {
    signIn()
      .then(() => room.collection('actions').add({ k: Show.key, body: JSON.stringify(body) }))
      .catch(console.error);
  };
  const hello = () => Show.deliver({ type: 'hello' });

  signIn().then(() => {
    hello();
    room.collection('views').doc(Show.key).onSnapshot({ includeMetadataChanges: true }, (doc) => {
      if (!doc.exists) return;
      hasView = true;
      Show.view = JSON.parse(doc.data().json);
      onStatus?.(!doc.metadata.fromCache);
      onView(Show.view);
    }, (err) => {
      console.error(err);
      onStatus?.(false);
    });
  }).catch((err) => {
    console.error(err);
    onStatus?.(false);
  });

  setTimeout(() => {
    if (!hasView) onStatus?.(false);
  }, FIRST_VIEW_MS);
  setInterval(hello, HELLO_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') hello();
  });
}
