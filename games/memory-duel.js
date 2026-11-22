// Memory Match, two players taking turns on one shared board.
// Both sides build the same deck from a shared seed and apply the same
// numbered moves in order, so the boards always agree. Moves are sent
// reliably (queued and retried), since a lost flip would break the game.
import { P, seeded, text, rr, blob, beep } from './common.js';

const W = 480, H = 560, CS = 100, GAP = 12, OX = 22, OY = 110;
const COLS = ['#f590b9', '#7fb8f0', '#f5c94a', '#6fd3a0', '#ffa47a', '#b79be3', '#6ccfd0', '#ff8fb0'];

function sym(ctx, i, x, y, s) {
  ctx.fillStyle = COLS[i];
  ctx.strokeStyle = COLS[i];
  ctx.beginPath();
  switch (i) {
    case 0: ctx.arc(x, y, s * 0.45, 0, Math.PI * 2); ctx.fill(); break;
    case 1: ctx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8); break;
    case 2: ctx.moveTo(x, y - s * 0.48); ctx.lineTo(x + s * 0.52, y + s * 0.42); ctx.lineTo(x - s * 0.52, y + s * 0.42); ctx.closePath(); ctx.fill(); break;
    case 3: ctx.moveTo(x, y - s * 0.52); ctx.lineTo(x + s * 0.4, y); ctx.lineTo(x, y + s * 0.52); ctx.lineTo(x - s * 0.4, y); ctx.closePath(); ctx.fill(); break;
    case 4:
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? s * 0.22 : s * 0.52, a = -Math.PI / 2 + (k * Math.PI) / 5;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); break;
    case 5: ctx.lineWidth = s * 0.18; ctx.arc(x, y, s * 0.36, 0, Math.PI * 2); ctx.stroke(); break;
    case 6: ctx.fillRect(x - s * 0.13, y - s * 0.48, s * 0.26, s * 0.96); ctx.fillRect(x - s * 0.48, y - s * 0.13, s * 0.96, s * 0.26); break;
    default:
      ctx.moveTo(x, y + s * 0.45);
      ctx.bezierCurveTo(x - s * 0.75, y - s * 0.05, x - s * 0.35, y - s * 0.65, x, y - s * 0.2);
      ctx.bezierCurveTo(x + s * 0.35, y - s * 0.65, x + s * 0.75, y - s * 0.05, x, y + s * 0.45);
      ctx.fill();
  }
}

export class MemoryDuel {
  static title = 'memory match';
  static w = W;
  static h = H;
  static help = 'take turns flipping two cards · a match scores and you go again';

  constructor({ host, me, them, seed, send, finish }) {
    this.role = host ? 'host' : 'guest';
    this.names = host ? { host: me, guest: them } : { host: them, guest: me };
    this.send = send;
    this.finish = finish;
    const rnd = seeded(seed);
    const deck = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    this.cards = deck.map((s, i) => ({ s, state: 'down', f: 0, owner: null, x: OX + (i % 4) * (CS + GAP), y: OY + Math.floor(i / 4) * (CS + GAP) }));
    this.turn = 'host';
    this.scores = { host: 0, guest: 0 };
    this.open = [];
    this.lock = 0;
    this.applied = 0;       // number of moves applied so far (shared counter)
    this.queue = new Map(); // remote moves waiting for their turn number
    this.over = false;
    this.t = 0;
    this.linked = true;
  }

  get myTurn() { return !this.over && this.turn === this.role; }

  onMessage(m) {
    if (m.a === 'flip' && Number.isInteger(m.n) && Number.isInteger(m.i)) this.queue.set(m.n, m.i);
  }

  setLinked(v) { this.linked = v; }

  pointerDown(x, y) {
    for (let i = 0; i < 16; i++) {
      const c = this.cards[i];
      if (x >= c.x && x <= c.x + CS && y >= c.y && y <= c.y + CS) { this.tryFlip(i); return; }
    }
  }

  tryFlip(i) {
    if (!this.myTurn || this.lock > 0 || this.queue.size) return;
    if (this.cards[i].state !== 'down' || this.open.length >= 2) return;
    const n = this.applied;
    this.send({ a: 'flip', i, n }).catch(() => {});
    this.apply(i);
  }

  apply(i) {
    const c = this.cards[i];
    this.applied++;
    if (c.state !== 'down') return;
    c.state = 'up';
    this.open.push(i);
    beep(660, 0.05, 'triangle', 0.05);
    if (this.open.length < 2) return;
    const [a, b] = this.open.map((j) => this.cards[j]);
    if (a.s === b.s) {
      a.state = b.state = 'done';
      a.owner = b.owner = this.turn;
      this.scores[this.turn]++;
      this.open = [];
      beep(this.turn === this.role ? 988 : 523, 0.12, 'square', 0.05);
      if (this.scores.host + this.scores.guest === 8) this.end();
    } else {
      this.lock = 0.9;
    }
  }

  end() {
    this.over = true;
    const { host, guest } = this.scores;
    const mine = this.scores[this.role], theirs = this.scores[this.role === 'host' ? 'guest' : 'host'];
    const title = mine > theirs ? 'you win!' : mine < theirs ? `${this.names[this.role === 'host' ? 'guest' : 'host'].name} wins!` : "it's a tie!";
    setTimeout(() => this.finish(title, `pairs ${host} – ${guest}`), 700);
  }

  update(dt) {
    this.t += dt;
    for (const c of this.cards) {
      const tg = c.state === 'down' ? 0 : 1;
      c.f += Math.max(-dt * 6, Math.min(dt * 6, tg - c.f));
    }
    if (this.lock > 0) {
      this.lock -= dt;
      if (this.lock <= 0) {
        for (const j of this.open) this.cards[j].state = 'down';
        this.open = [];
        this.turn = this.turn === 'host' ? 'guest' : 'host';
      }
      return;
    }
    while (this.queue.has(this.applied) && this.lock <= 0 && !this.over) {
      const i = this.queue.get(this.applied);
      this.queue.delete(this.applied);
      this.apply(i);
    }
  }

  draw(ctx) {
    for (let y = 0; y < H; y += 56) for (let x = 0; x < W; x += 60) {
      ctx.fillStyle = ((x / 60 + y / 56) % 2) ? P.pink : '#ffe3ee';
      ctx.fillRect(x, y, 60, 56);
    }
    // scoreboard
    ctx.fillStyle = 'rgba(255,248,243,.92)';
    rr(ctx, 14, 12, W - 28, 84, 14); ctx.fill();
    for (const [role, x, align] of [['host', 40, 'left'], ['guest', W - 40, 'right']]) {
      const pl = this.names[role];
      const active = this.turn === role && !this.over;
      const bx = align === 'left' ? x + 12 : x - 12;
      blob(ctx, bx, 40, active ? 13 + Math.sin(this.t * 8) : 12, pl.color);
      const nx = align === 'left' ? x + 34 : x - 34;
      text(ctx, (role === this.role ? 'you' : pl.name).slice(0, 12), nx, 28, 16, P.ink, align);
      text(ctx, String(this.scores[role]), bx, 60, 22, active ? P.rose2 : P.inkSoft, 'center');
    }
    const msg = this.over ? 'game over' : !this.linked ? 'waiting for connection…' : this.myTurn ? 'your turn ♥' : `${this.names[this.turn].name}'s turn`;
    text(ctx, msg, W / 2, 46, 16, this.myTurn ? P.rose2 : P.ink, 'center');

    for (const c of this.cards) {
      const cx = c.x + CS / 2;
      const w = Math.max(2, CS * Math.abs(Math.cos(c.f * Math.PI)));
      const face = c.f > 0.5;
      ctx.fillStyle = P.ink;
      rr(ctx, cx - w / 2 + 3, c.y + 4, w, CS, 12); ctx.fill();
      ctx.fillStyle = face ? (c.owner ? (c.owner === 'host' ? this.names.host.color : this.names.guest.color) : '#fff') : P.rose;
      rr(ctx, cx - w / 2, c.y, w, CS, 12); ctx.fill();
      if (face && c.owner) { ctx.fillStyle = 'rgba(255,255,255,.55)'; rr(ctx, cx - w / 2 + 6, c.y + 6, Math.max(1, w - 12), CS - 12, 9); ctx.fill(); }
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      rr(ctx, cx - w / 2 + 5, c.y + 5, Math.max(1, w - 10), CS - 10, 9); ctx.stroke();
      if (w > 30) {
        ctx.save();
        ctx.translate(cx, c.y + CS / 2);
        ctx.scale(w / CS, 1);
        if (face) sym(ctx, c.s, 0, 0, 56);
        else { ctx.fillStyle = '#fff'; ctx.font = '34px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♥', 0, 2); }
        ctx.restore();
      }
    }
  }
}
