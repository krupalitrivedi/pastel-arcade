// Thin wrapper around an Offline Protocol browser node for Pixel Party.
// Finds nearby players, swaps a small "hello" (name + colour) with each,
// and sends/receives small JSON game messages, end-to-end encrypted.
import { OfflineNode, WebRtcCarrier } from './vendor/offline-protocol/src/index.js';

const TAG = 'pp1'; // marks our messages so stray traffic is ignored
const HEX = /^#[0-9a-f]{6}$/i;

export class Mesh extends EventTarget {
  constructor({ appId, profile }) {
    super();
    this.appId = appId;
    this.profile = profile;
    this.peers = new Map(); // address -> { addr, linked, ready, name, color }
    this.me = null;
    this.node = null;
    this.rtc = null;
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  changed() { this.emit('peers'); }

  peer(addr) {
    if (!this.peers.has(addr)) this.peers.set(addr, { addr, linked: false, ready: false, name: null, color: null });
    return this.peers.get(addr);
  }

  async start(me) {
    this.me = me;
    const node = await OfflineNode.start({ appId: this.appId, profile: this.profile });
    this.node = node;
    this.address = node.address;
    this.rtc = new WebRtcCarrier(node);
    addEventListener('pagehide', () => this.rtc.close());

    node.addEventListener('neighbor_discovered', ({ detail }) => {
      const p = this.peer(detail.peer_id);
      p.linked = true;
      // Ask for a secure session; messages sent before it is ready wait in the engine's queue.
      node.establishSecureSession(p.addr).catch(() => {});
      this.sendHello(p.addr, true);
      this.changed();
    });
    node.addEventListener('neighbor_lost', ({ detail }) => {
      const p = this.peer(detail.peer_id);
      p.linked = false;
      this.changed();
      this.emit('lost', { addr: p.addr });
    });
    node.addEventListener('secure_session_established', ({ detail }) => {
      const p = this.peer(detail.peer_id);
      if (!p.ready) this.sendHello(p.addr, true);
    });
    node.addEventListener('message_received', ({ detail }) => this.onMessage(detail));
    node.addEventListener('fatal', ({ detail }) => this.emit('fatal', { reason: String(detail) }));
    return node.address;
  }

  sendHello(addr, ask) {
    this.send(addr, { t: 'hello', name: this.me.name, color: this.me.color, ask }).catch(() => {});
  }

  onMessage(detail) {
    let msg;
    try { msg = JSON.parse(detail.content); } catch { return; }
    if (!msg || msg.app !== TAG || !detail.sender) return;
    const p = this.peer(detail.sender);
    if (msg.t === 'hello') {
      p.name = String(msg.name || 'player').slice(0, 16);
      p.color = HEX.test(msg.color) ? msg.color : '#cdb6ef';
      p.ready = true;
      p.linked = true;
      if (msg.ask) this.sendHello(p.addr, false);
      this.changed();
      return;
    }
    this.emit('msg', { from: p.addr, msg });
  }

  /** Reliable by default (queued + retried); { ephemeral: true } for fast, droppable game state. */
  send(addr, obj, opts = {}) {
    if (!this.node) return Promise.reject(new Error('not online'));
    return this.node.sendMessage(addr, JSON.stringify({ app: TAG, ...obj }), opts);
  }
}
