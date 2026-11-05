// Online version of the shared connection layer, for static hosting.
// The big-screen tab runs the game and each phone connects to it directly over
// WebRTC. PeerJS's public service only introduces them; game data skips it.

const PARAMS = new URLSearchParams(location.search);
const SAVE_KEY = 'hard-disagree-show';
const SAVE_HOURS = 12;
const RETRY_MS = 3000;
const KEEPALIVE_MS = 5000;
const SILENCE_MS = 15000;

const peerId = (room) => `hard-disagree-${room}`;

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

function startBigScreen(onView) {
  const session = loadSession() || { room: randomHex(8), tokens: { p1: randomHex(6), p2: randomHex(6) }, state: null };
  const game = createShow(QUESTIONS, session.state);
  const phones = { p1: null, p2: null };
  const isOnline = (p) => !!phones[p];
  let note = 'Opening the studio…';

  const link = (p) => {
    const url = new URL('play.html', location.href);
    url.search = new URLSearchParams({ p, room: session.room, k: session.tokens[p] });
    return url.href;
  };
  const links = { p1: link('p1'), p2: link('p2') };
  const qr = { p1: qrImage(links.p1), p2: qrImage(links.p2) };

  const sendPhones = () => {
    for (const p of ['p1', 'p2']) {
      if (phones[p]?.open) phones[p].send({ view: game.viewFor(p, isOnline) });
    }
  };
  const publish = () => {
    saveSession(session, game);
    Show.view = { ...game.viewFor('host', isOnline), qr, links, note };
    onView(Show.view);
    sendPhones();
  };

  Show.deliver = (body) => {
    game.handle(body);
    publish();
  };

  const welcome = (conn) => {
    conn.on('data', (msg) => {
      if (msg.hello) {
        const { role, k } = msg.hello;
        if (!['p1', 'p2'].includes(role) || k !== session.tokens[role]) {
          conn.send({ denied: true });
          return;
        }
        conn.playerRole = role;
        phones[role] = conn;
        publish();
      } else if (msg.action && conn.playerRole && phones[conn.playerRole] === conn) {
        // The role comes from the verified connection, never from the message.
        game.handle({ ...msg.action, role: conn.playerRole });
        publish();
      }
    });
    conn.on('close', () => {
      if (phones[conn.playerRole] === conn) {
        phones[conn.playerRole] = null;
        publish();
      }
    });
  };

  const open = () => {
    const peer = new Peer(peerId(session.room));
    peer.on('open', () => {
      note = 'Works from anywhere with internet. Keep this tab open: it is running the show.';
      publish();
    });
    peer.on('connection', welcome);
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      // After a refresh the service can hold the old ID for a moment, so keep trying.
      if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        note = 'Reaching the connection service… retrying.';
        publish();
        peer.destroy();
        setTimeout(open, RETRY_MS);
      }
    });
  };

  publish();
  open();
  setInterval(sendPhones, KEEPALIVE_MS);
}

// ---- A phone: connects to the big screen and reconnects whenever it drops ----

function startPhone(onView, onStatus) {
  const room = PARAMS.get('room');
  const outbox = [];
  let peer = null;
  let conn = null;
  let heard = Date.now();
  let denied = false;
  let retry = null;

  const flush = () => {
    while (conn?.open && outbox.length) conn.send({ action: outbox.shift() });
  };

  Show.deliver = (body) => {
    outbox.push(body);
    flush();
  };

  const reopen = () => {
    if (denied) return;
    onStatus?.(false);
    clearTimeout(retry);
    retry = setTimeout(open, RETRY_MS);
  };

  function open() {
    clearTimeout(retry);
    if (peer) peer.destroy();
    heard = Date.now();
    peer = new Peer();
    peer.on('open', () => {
      conn = peer.connect(peerId(room), { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        conn.send({ hello: { role: Show.role, k: Show.key } });
        flush();
      });
      conn.on('data', (msg) => {
        heard = Date.now();
        if (msg.denied) {
          denied = true;
          onStatus?.(false);
        }
        if (msg.view) {
          Show.view = msg.view;
          onStatus?.(true);
          onView(msg.view);
        }
      });
      conn.on('close', reopen);
      conn.on('error', reopen);
    });
    peer.on('error', reopen);
  }

  open();

  // A locked phone can lose the connection without noticing, so watch for silence.
  setInterval(() => {
    if (Date.now() - heard > SILENCE_MS) open();
  }, RETRY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - heard > KEEPALIVE_MS * 1.5) open();
  });
}
