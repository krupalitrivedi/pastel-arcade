// Pixel Party: find nearby players over Offline Protocol and play together.
import { Mesh } from './net.js';
import { MemoryDuel } from './games/memory-duel.js';
import { PaddleDuel } from './games/paddle-duel.js';

const GAMES = {
  memory: { Game: MemoryDuel, icon: '🃏', label: 'memory' },
  paddle: { Game: PaddleDuel, icon: '🏓', label: 'paddle' },
};
const COLORS = ['#ffb3d1', '#a9d1fb', '#95dfb7', '#cdb6ef', '#ffe27a', '#ffb894'];

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const profile = params.get('profile') || 'player';
const store = {
  get(k, d) { try { const v = localStorage.getItem(`pixelParty.${profile}.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`pixelParty.${profile}.${k}`, JSON.stringify(v)); } catch { /* ignore */ } },
};
const rid = () => Math.random().toString(36).slice(2, 10);
const short = (a) => (a ? `${a.slice(0, 9)}…${a.slice(-4)}` : '');

const me = { name: store.get('name', ''), color: store.get('color', COLORS[Math.floor(Math.random() * COLORS.length)]) };
const mesh = new Mesh({ appId: 'pixel-party', profile });

// ---------------- Works offline (service worker) ----------------
// After one visit with internet, sw.js keeps the whole site on this device.
// A new version waits until the person taps "update" (never mid-game).
let nodeStarted = false;
function showNet() { $('nonet-pill').hidden = navigator.onLine; }
addEventListener('online', showNet);
addEventListener('offline', showNet);
showNet();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    // a new build took over: stop this tab's node cleanly, then load the new build
    if (nodeStarted) await mesh.node?.stop().catch(() => {});
    location.reload();
  }, { once: true });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const offer = () => { $('update-btn').hidden = !(reg.waiting && navigator.serviceWorker.controller); };
    const watch = () => reg.installing?.addEventListener('statechange', () => { offer(); markReady(); });
    offer();
    watch();
    reg.addEventListener('updatefound', watch);
    $('update-btn').onclick = () => {
      if (current && !confirm('Updating ends the game you are in. Update now?')) return;
      $('update-btn').disabled = true;
      reg.waiting?.postMessage('activate');
    };
    const markReady = () => { if (reg.active) $('offline-pill').hidden = false; };
    markReady();
    navigator.serviceWorker.ready.then(markReady);
  }).catch(() => { /* not available: the site still works online */ });
}

// ---------------- Setup ----------------
$('name').value = me.name;
function renderSwatches() {
  $('swatches').replaceChildren(...COLORS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (c === me.color ? ' on' : '');
    b.style.background = c;
    b.setAttribute('aria-label', `color ${c}`);
    b.onclick = () => { me.color = c; renderSwatches(); };
    return b;
  }));
}
renderSwatches();

$('go').onclick = async () => {
  me.name = $('name').value.trim().slice(0, 14) || `player ${Math.floor(Math.random() * 90 + 10)}`;
  store.set('name', me.name);
  store.set('color', me.color);
  $('go').disabled = true;
  $('boot-status').textContent = 'starting your offline node…';
  try {
    if (!window.isSecureContext) throw new Error('this page must be opened over https:// or localhost');
    await mesh.start(me);
    nodeStarted = true;
    enterLobby();
  } catch (err) {
    $('go').disabled = false;
    const msg = String(err?.message || err);
    $('boot-status').textContent = /lock|refused|already|in use/i.test(msg)
      ? 'this player is already open in another tab. use "open a 2nd player tab" there, or close that tab.'
      : `could not start: ${msg}`;
  }
};
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('go').click(); });

// ---------------- Lobby ----------------
function enterLobby() {
  $('setup').hidden = true;
  $('lobby').hidden = false;
  $('me-name').textContent = me.name;
  $('me-blob').style.background = me.color;
  $('me-addr').textContent = short(mesh.address);
  mesh.rtc.addEventListener('connection', ({ detail: { state } }) => {
    if (state === 'connected') $('link-status').textContent = 'connected! ♥ the other player appears in your list';
    else if (state === 'disconnected') $('link-status').textContent = 'connection is unstable… waiting for it to recover';
  });
  renderPeers();
  if (JOIN_ROOM) joinParty(JOIN_ROOM);
  else if (IS_HOST_MACHINE || !location.port) startHosting(); // localhost host, or a hosted site like Vercel
  else hostHint('✦ joining from a phone? scan the QR code shown on the host computer\'s Pixel Party lobby.');
}

// ---------------- One-scan joining (party host: `python tools/serve.py --https`) ----------------
// The computer running serve.py shows one QR code. A phone scans it with its camera app,
// opens Pixel Party from that computer, and the two pages swap their WebRTC codes through
// the server's tiny /signal/ relay, so the computer never has to scan anything back.
const ID_OK = /^[A-Za-z0-9_-]{8,40}$/;
const JOIN_ROOM = ID_OK.test(params.get('join') || '') ? params.get('join') : null;
const IS_HOST_MACHINE = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (JOIN_ROOM) $('join-banner').hidden = false;

async function relayInfo() {
  try {
    const r = await fetch('signal/info', { cache: 'no-store' });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function hostHint(html) {
  $('host-hint').innerHTML = html;
  $('host-hint').hidden = false;
}

let hostRoom = null;
async function startHosting() {
  const info = await relayInfo();
  if (!info) {
    // e.g. the Vercel site: no relay there, so explain where the one-scan QR lives
    hostHint('✦ <b>one-scan joining for phones:</b> on a computer, run <code>python tools/serve.py --https</code> in the Pixel Party folder, then open <b>http://localhost:5180</b> there. A QR code appears here for phones to scan.');
    return;
  }
  if (!info.https) {
    hostHint('✦ <b>want a one-scan QR for phones?</b> stop this server and start it again with <code>python tools/serve.py --https</code>, then reload this page.');
    return;
  }
  if (!info.ips?.length) {
    hostHint('✦ this computer isn\'t on a Wi-Fi network right now, so phones can\'t reach it. connect to Wi-Fi (or turn on its hotspot) and reload.');
    return;
  }
  hostRoom = store.get('hostRoom', null);
  if (!ID_OK.test(hostRoom || '')) { hostRoom = rid() + rid(); store.set('hostRoom', hostRoom); }
  await fetch(`signal/${hostRoom}/open`, { method: 'POST' }).catch(() => {});
  const urls = info.ips.map((ip) => `https://${ip}:${info.httpsPort}/?join=${hostRoom}`);
  showQR($('host-qr'), urls[0]);
  $('host-url').textContent = urls.join('  ·  ');
  $('host-status').textContent = 'waiting for phones… ✦';
  $('host-panel').hidden = false;
  answerLoop();
}

async function answerLoop() {
  const answered = new Set();
  let joined = 0;
  for (;;) {
    await sleep(1000);
    let list = [];
    try {
      const r = await fetch(`signal/${hostRoom}/pending`, { cache: 'no-store' });
      if (r.status === 404) { await fetch(`signal/${hostRoom}/open`, { method: 'POST' }); continue; } // server restarted
      if (!r.ok) continue;
      list = await r.json();
    } catch { continue; } // server briefly unreachable
    for (const { ticket, offer } of list) {
      if (answered.has(ticket)) continue;
      answered.add(ticket);
      try {
        const ans = await mesh.rtc.answer(offer);
        await fetch(`signal/${hostRoom}/${ticket}/answer`, { method: 'POST', body: ans.code });
        joined++;
        $('host-status').textContent = `✦ ${joined} device${joined === 1 ? '' : 's'} joined · more can scan anytime`;
      } catch (e) {
        $('host-status').textContent = `a phone couldn't join: ${e.message || e}`;
      }
    }
  }
}

async function joinParty(room) {
  const say = (t) => { $('join-status').hidden = false; $('join-status').textContent = t; };
  // the code in the address is a key to this party: take it out of the address bar
  history.replaceState(null, '', location.pathname + (profile !== 'player' ? `?profile=${encodeURIComponent(profile)}` : ''));
  say('joining the party… ✦');
  try {
    const offer = await mesh.rtc.offer();
    const r = await fetch(`signal/${room}/join`, { method: 'POST', body: offer.code });
    if (r.status === 404) throw new Error('that party is closed. ask the host to open Pixel Party and show the QR code again.');
    if (!r.ok) throw new Error(`the host said no (${r.status}).`);
    const { ticket } = await r.json();
    for (let i = 0; i < 120; i++) {
      await sleep(1000);
      const a = await fetch(`signal/${room}/${ticket}/answer`, { cache: 'no-store' });
      if (a.status === 200) {
        await offer.accept(await a.text());
        say('connecting to the host… ♥');
        mesh.rtc.addEventListener('connection', ({ detail: { state } }) => {
          if (state === 'connected') say('you\'re in the party! ♥ pick someone below to play');
        });
        return;
      }
      if (a.status === 404) throw new Error('that join timed out. scan the QR code again.');
    }
    throw new Error('the host didn\'t answer. is Pixel Party open on their computer?');
  } catch (e) {
    say(`couldn't join: ${e.message || e}`);
  }
}

function renderPeers() {
  const list = [...mesh.peers.values()].filter((p) => p.linked || p.ready);
  const ul = $('peers');
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'looking for players nearby… ✦';
    ul.replaceChildren(li);
  } else {
    ul.replaceChildren(...list.map((p) => {
      const li = document.createElement('li');
      li.className = 'peer' + (p.linked ? '' : ' away');
      const blob = document.createElement('span');
      blob.className = 'blob';
      blob.style.background = p.color || '#eee';
      const info = document.createElement('div');
      info.className = 'peer-info';
      const nm = document.createElement('div');
      nm.className = 'peer-name';
      nm.textContent = p.name || 'saying hi…';
      const st = document.createElement('div');
      st.className = 'addr';
      st.textContent = !p.linked ? 'out of range' : current?.peer === p.addr ? 'playing with you' : p.ready ? `ready · ${short(p.addr)}` : 'connecting…';
      info.append(nm, st);
      const btns = document.createElement('div');
      btns.className = 'peer-btns';
      for (const [key, g] of Object.entries(GAMES)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = `${g.icon} ${g.label}`;
        b.disabled = !p.ready || !p.linked || !!current || !!outgoing;
        b.onclick = () => challenge(p, key);
        btns.append(b);
      }
      li.append(blob, info, btns);
      return li;
    }));
  }
  const n = list.filter((p) => p.linked && p.ready).length;
  $('lobby-status').textContent = n ? `♥ ${n} player${n === 1 ? '' : 's'} nearby` : '♥ looking for players…';
}
mesh.addEventListener('peers', renderPeers);
mesh.addEventListener('fatal', ({ detail }) => modal('oh no!', `the offline node stopped (${detail.reason}). reload the page to start again.`, [{ label: 'reload', on: () => location.reload() }]));

// 2nd tab for testing on one computer: a different profile = a different player
$('second-tab').onclick = () => {
  const u = new URL(location.href);
  u.searchParams.set('profile', `p${Math.floor(Math.random() * 9000 + 1000)}`);
  window.open(u.toString(), '_blank');
};

// ---------------- Connect another device (WebRTC codes) ----------------
let offer = null;
$('make-offer').onclick = async () => {
  $('answer-panel').hidden = true;
  $('offer-panel').hidden = false;
  $('offer-code').value = 'making a code…';
  $('answer-in').value = '';
  try {
    $('offer-qr').textContent = 'making a code…';
    offer = await mesh.rtc.offer();
    $('offer-code').value = offer.code;
    showQR($('offer-qr'), offer.code);
  } catch (e) { $('link-status').textContent = e.message; }
};
$('accept').onclick = async () => {
  if (!offer) return;
  try { await offer.accept($('answer-in').value.trim()); $('link-status').textContent = 'connecting…'; }
  catch (e) { $('link-status').textContent = e.message; }
};
$('have-code').onclick = () => {
  $('offer-panel').hidden = true;
  $('answer-panel').hidden = false;
  $('answer-out').hidden = true;
  $('offer-in').value = '';
};
$('make-answer').onclick = async () => {
  try {
    const ans = await mesh.rtc.answer($('offer-in').value.trim());
    $('answer-code').value = ans.code;
    showQR($('answer-qr'), ans.code);
    $('answer-out').hidden = false;
    $('link-status').textContent = 'send your answer back. you will appear in each other\'s list once connected.';
  } catch (e) { $('link-status').textContent = e.message; }
};
$('copy-offer').onclick = () => navigator.clipboard?.writeText($('offer-code').value);
$('copy-answer').onclick = () => navigator.clipboard?.writeText($('answer-code').value);

// ---------------- QR codes (offline: libraries are bundled in vendor/qr) ----------------
function showQR(el, textStr) {
  el.replaceChildren();
  try {
    const qr = window.qrcode(0, 'L');
    qr.addData(textStr);
    qr.make();
    const n = qr.getModuleCount(), scale = Math.max(3, Math.floor(360 / (n + 8)));
    const c = document.createElement('canvas');
    c.width = c.height = (n + 8) * scale;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#5b3f6b';
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (qr.isDark(r, q)) x.fillRect((q + 4) * scale, (r + 4) * scale, scale, scale);
    c.setAttribute('aria-label', 'connection QR code');
    el.append(c);
  } catch (e) {
    el.textContent = 'this code is too long for a QR code. use copy & paste below.';
  }
}

// Camera scanner: uses the browser's built-in BarcodeDetector when it has one, else jsQR.
let scanning = null;
async function scanQR() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('this browser cannot use the camera here. use copy & paste.');
  const video = $('scan-video');
  $('scan-status').textContent = 'point the camera at the QR code ✦';
  $('scanner').hidden = false;
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  await video.play();
  const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  return new Promise((resolve, reject) => {
    const stop = () => { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; $('scanner').hidden = true; scanning = null; };
    scanning = { cancel: () => { stop(); reject(new Error('scan cancelled')); } };
    const tick = async () => {
      if (!scanning) return;
      try {
        let found = null;
        if (video.videoWidth) {
          if (detector) {
            const codes = await detector.detect(video);
            found = codes[0]?.rawValue || null;
          } else {
            cv.width = video.videoWidth; cv.height = video.videoHeight;
            cx.drawImage(video, 0, 0);
            found = window.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' })?.data || null;
          }
        }
        if (found && found.startsWith('op1.')) { stop(); resolve(found); return; }
        if (found) $('scan-status').textContent = "that QR isn't a Pixel Party code. try again ✦";
      } catch { /* keep trying */ }
      setTimeout(tick, 150);
    };
    tick();
  });
}
$('scan-cancel').onclick = () => scanning?.cancel();

// Joining side: scan their code -> make an answer -> show it as QR
$('scan-offer').onclick = async () => {
  try {
    $('offer-in').value = await scanQR();
    await $('make-answer').onclick();
  } catch (e) { if (e.message !== 'scan cancelled') $('link-status').textContent = e.message; }
};
// Hosting side: scan their answer -> connect
$('scan-answer').onclick = async () => {
  try {
    $('answer-in').value = await scanQR();
    await $('accept').onclick();
  } catch (e) { if (e.message !== 'scan cancelled') $('link-status').textContent = e.message; }
};

// ---------------- Dialogs ----------------
let modalOwner = null;
function modal(title, textStr, buttons, owner = null) {
  $('modal-title').textContent = title;
  $('modal-text').textContent = textStr;
  $('modal-buttons').replaceChildren(...buttons.map(({ label, on, quiet }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = quiet ? 'ok-btn quiet' : 'ok-btn';
    b.textContent = label;
    b.onclick = () => { closeModal(); on?.(); };
    return b;
  }));
  modalOwner = owner;
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; modalOwner = null; }

// ---------------- Challenges ----------------
let outgoing = null; // { id, peer, game }
let incoming = null; // { id, peer, game } after we said yes, waiting for start
let current = null;  // running game session

function nameOf(addr) { return mesh.peers.get(addr)?.name || 'someone'; }
function profileOf(addr) { const p = mesh.peers.get(addr); return { name: p?.name || 'player', color: p?.color || '#cdb6ef' }; }

function challenge(peer, game) {
  const id = rid();
  outgoing = { id, peer: peer.addr, game };
  mesh.send(peer.addr, { t: 'invite', id, game }).catch(() => {});
  modal('waiting…', `asking ${peer.name} to play ${GAMES[game].label}…`, [{
    label: 'cancel', quiet: true,
    on: () => { mesh.send(peer.addr, { t: 'cancel', id }).catch(() => {}); outgoing = null; renderPeers(); },
  }], `out:${id}`);
  renderPeers();
}

mesh.addEventListener('msg', ({ detail: { from, msg } }) => {
  switch (msg.t) {
    case 'invite': {
      if (!GAMES[msg.game]) return;
      if (current || outgoing || incoming || !$('modal').hidden) {
        mesh.send(from, { t: 'reply', id: msg.id, ok: false, busy: true }).catch(() => {});
        return;
      }
      modal('can we play together?', `${nameOf(from)} wants to play ${GAMES[msg.game].label} with you ♥`, [
        { label: 'no', quiet: true, on: () => mesh.send(from, { t: 'reply', id: msg.id, ok: false }).catch(() => {}) },
        {
          label: 'yes!', on: () => {
            incoming = { id: msg.id, peer: from, game: msg.game };
            mesh.send(from, { t: 'reply', id: msg.id, ok: true }).catch(() => {});
            modal('starting…', `getting the game ready with ${nameOf(from)}…`, [{ label: 'cancel', quiet: true, on: () => { incoming = null; } }], `in:${msg.id}`);
          },
        },
      ], `in:${msg.id}`);
      break;
    }
    case 'cancel':
      if (modalOwner === `in:${msg.id}`) { closeModal(); incoming = null; modal('oh!', `${nameOf(from)} cancelled the invite.`, [{ label: 'ok' }]); }
      break;
    case 'reply': {
      if (!outgoing || outgoing.id !== msg.id) return;
      const o = outgoing;
      outgoing = null;
      closeModal();
      if (msg.ok) {
        const seed = Math.floor(Math.random() * 2 ** 31);
        mesh.send(from, { t: 'start', id: o.id, game: o.game, seed }).catch(() => {});
        launch({ id: o.id, game: o.game, peer: from, host: true, seed });
      } else {
        modal('maybe later', msg.busy ? `${nameOf(from)} is busy right now.` : `${nameOf(from)} said no this time.`, [{ label: 'ok' }]);
        renderPeers();
      }
      break;
    }
    case 'start':
      if (incoming && incoming.id === msg.id && from === incoming.peer) {
        closeModal();
        incoming = null;
        launch({ id: msg.id, game: msg.game, peer: from, host: false, seed: msg.seed });
      }
      break;
    case 'g':
      if (current && current.id === msg.id && from === current.peer) current.game.onMessage(msg);
      break;
    case 'leave':
      if (current && current.id === msg.id) {
        const who = nameOf(from);
        backToLobby();
        modal('game ended', `${who} left the game.`, [{ label: 'ok' }]);
      }
      break;
    default:
  }
});

mesh.addEventListener('lost', ({ detail }) => {
  if (current && current.peer === detail.addr) current.game.setLinked?.(false);
});
mesh.addEventListener('peers', () => {
  if (current) current.game.setLinked?.(!!mesh.peers.get(current.peer)?.linked);
});

// ---------------- Playing ----------------
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const keys = new Set();
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'a' };

function launch({ id, game, peer, host, seed }) {
  const { Game } = GAMES[game];
  canvas.width = Game.w;
  canvas.height = Game.h;
  const send = (obj, opts) => mesh.send(peer, { ...obj, t: 'g', id }, opts);
  const g = new Game({
    host, seed, send,
    me: { ...me }, them: profileOf(peer),
    finish: (title, detail) => {
      if (!current || current.id !== id) return;
      modal(title, detail, [
        { label: 'lobby', quiet: true, on: backToLobby },
        { label: 'play again', on: () => { const p = mesh.peers.get(peer); backToLobby(); if (p?.ready && p.linked) challenge(p, game); } },
      ]);
    },
  });
  current = { id, peer, game: g, kind: game };
  $('lobby').hidden = true;
  $('play').hidden = false;
  document.body.classList.add('playing');
  window.scrollTo(0, 0);
  $('game-title').textContent = Game.title;
  $('vs').textContent = `vs ${nameOf(peer)}`;
  $('game-help').textContent = Game.help;
  keys.clear();
  fit();
  renderPeers();
}

function backToLobby() {
  current = null;
  document.body.classList.remove('playing');
  $('play').hidden = true;
  $('lobby').hidden = false;
  renderPeers();
}

$('leave').onclick = () => {
  if (current) mesh.send(current.peer, { t: 'leave', id: current.id }).catch(() => {});
  closeModal();
  backToLobby();
};

function fit() {
  const s = Math.min((window.innerWidth - 70) / canvas.width, (window.innerHeight - 190) / canvas.height, 1.4);
  canvas.style.width = `${Math.floor(canvas.width * Math.max(0.4, s))}px`;
  canvas.style.height = `${Math.floor(canvas.height * Math.max(0.4, s))}px`;
}
addEventListener('resize', () => current && fit());

addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k || !current || !$('modal').hidden) return;
  e.preventDefault();
  keys.add(k);
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
addEventListener('blur', () => keys.clear());

const toCanvas = (e) => {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
};
canvas.addEventListener('pointerdown', (e) => { if (!current) return; e.preventDefault(); const [x, y] = toCanvas(e); current.game.pointerDown?.(x, y); });
canvas.addEventListener('pointermove', (e) => { if (!current) return; const [x, y] = toCanvas(e); current.game.pointerMove?.(x, y); });

// Game logic runs on animation frames, but browsers pause those in hidden tabs,
// so a backup timer keeps the logic going (moves applied, turns passed) while hidden.
let last = performance.now();
function step(t, render) {
  let dt = Math.max(0, (t - last) / 1000);
  last = t;
  if (!current) return;
  try {
    while (dt > 0) { const d = Math.min(0.05, dt); current.game.update(d, keys); dt -= d; }
    if (render) { ctx.save(); current.game.draw(ctx); ctx.restore(); }
  } catch (err) { console.error(err); }
}
function frame(t) {
  requestAnimationFrame(frame);
  step(performance.now(), true);
}
requestAnimationFrame(frame);
setInterval(() => { const now = performance.now(); if (now - last > 180) step(now, false); }, 200);

// for debugging in the console
window.pixelParty = { version: 5, mesh, get current() { return current; } };
