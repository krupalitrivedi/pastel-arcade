// Paddle Duel, player vs player in real time.
// The host runs the ball and sends the whole state ~20 times a second as
// "ephemeral" messages (sent once, never retried: a newer one replaces it).
// The guest only sends its paddle position. The guest smooths what it gets.
import { P, text, beep } from './common.js?v=5';

const W = 600, H = 400, R = 7, PH = 72, RATE = 1 / 20, WIN = 7;

export class PaddleDuel {
  static title = 'paddle duel';
  static w = W;
  static h = H;
  static help = 'up/down or W/S, or drag on the screen · first to 7 wins';

  constructor({ host, me, them, send, finish }) {
    this.host = host;
    this.names = host ? { left: me, right: them } : { left: them, right: me };
    this.send = send;
    this.finish = finish;
    this.mine = H / 2 - PH / 2;   // my paddle (top y)
    this.theirs = H / 2 - PH / 2; // their paddle, as last heard
    this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.shown = { x: W / 2, y: H / 2 }; // guest: smoothed ball
    this.score = [0, 0]; // [left/host, right/guest]
    this.wait = 1.2;
    this.dir = 1;
    this.tick = 0;
    this.linked = true;
    this.over = false;
    this.py = null;
    this.lastHeard = 0;
  }

  setLinked(v) { this.linked = v; }

  onMessage(m) {
    if (this.host) {
      if (m.a === 'p' && typeof m.y === 'number') this.theirs = Math.max(0, Math.min(H - PH, m.y));
    } else if (m.a === 's') {
      this.ball.x = m.bx; this.ball.y = m.by;
      this.theirs = m.l;
      if (m.sc[0] !== this.score[0] || m.sc[1] !== this.score[1]) beep(m.sc[1] > this.score[1] ? 880 : 200, 0.15, 'square', 0.04);
      this.score = m.sc;
      this.waiting = m.w;
      this.lastHeard = performance.now();
    } else if (m.a === 'end' && !this.over) {
      this.score = m.sc;
      this.done();
    } else if (m.a === 'hit') {
      beep(520, 0.05, 'square', 0.04);
    }
  }

  pointerDown(x, y) { this.py = y; }
  pointerMove(x, y) { this.py = y; }

  update(dt, keys) {
    const mv = ((keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0));
    if (mv) { this.py = null; this.mine += mv * 420 * dt; }
    else if (this.py !== null) this.mine += Math.max(-700 * dt, Math.min(700 * dt, this.py - PH / 2 - this.mine));
    this.mine = Math.max(0, Math.min(H - PH, this.mine));
    if (this.over) return;

    this.tick += dt;
    const sendNow = this.tick >= RATE;
    if (sendNow) this.tick = 0;

    if (!this.host) {
      if (sendNow) this.send({ a: 'p', y: Math.round(this.mine) }, { ephemeral: true }).catch(() => {});
      this.shown.x += (this.ball.x - this.shown.x) * Math.min(1, dt * 18);
      this.shown.y += (this.ball.y - this.shown.y) * Math.min(1, dt * 18);
      return;
    }

    // host: simulate only while the other player is connected
    if (this.linked) this.simulate(dt);
    this.shown.x = this.ball.x; this.shown.y = this.ball.y;
    if (sendNow) {
      const b = this.ball;
      this.send({ a: 's', bx: Math.round(b.x), by: Math.round(b.y), l: Math.round(this.mine), sc: this.score, w: this.wait > 0 }, { ephemeral: true }).catch(() => {});
    }
  }

  simulate(dt) {
    const b = this.ball;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        const a = (Math.random() - 0.5) * 0.9;
        b.vx = Math.cos(a) * 330 * this.dir;
        b.vy = Math.sin(a) * 330;
      }
      return;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
    if (b.y > H - R) { b.y = H - R; b.vy = -Math.abs(b.vy); }
    const left = this.mine, right = this.theirs;
    if (b.vx < 0 && b.x - R <= 32 && b.x - R >= 10 && b.y >= left - R && b.y <= left + PH + R) { this.bounce(b, left, 1); b.x = 32 + R; }
    if (b.vx > 0 && b.x + R >= W - 32 && b.x + R <= W - 10 && b.y >= right - R && b.y <= right + PH + R) { this.bounce(b, right, -1); b.x = W - 32 - R; }
    if (b.x < -20 || b.x > W + 20) {
      const rightScored = b.x < -20;
      this.score = rightScored ? [this.score[0], this.score[1] + 1] : [this.score[0] + 1, this.score[1]];
      beep(rightScored ? 200 : 880, 0.15, 'square', 0.04);
      Object.assign(b, { x: W / 2, y: H / 2, vx: 0, vy: 0 });
      this.dir = rightScored ? -1 : 1;
      this.wait = 1;
      if (this.score[0] >= WIN || this.score[1] >= WIN) {
        this.send({ a: 'end', sc: this.score }).catch(() => {});
        this.done();
      }
    }
  }

  bounce(b, py, dir) {
    const off = Math.max(-1, Math.min(1, (b.y - (py + PH / 2)) / (PH / 2)));
    const sp = Math.min(Math.hypot(b.vx, b.vy) * 1.05, 720);
    b.vx = Math.cos(off) * sp * dir;
    b.vy = Math.sin(off) * sp;
    beep(520, 0.05, 'square', 0.04);
    this.send({ a: 'hit' }, { ephemeral: true }).catch(() => {});
  }

  done() {
    this.over = true;
    const [l, r] = this.score;
    const mine = this.host ? l : r, theirs = this.host ? r : l;
    const them = this.host ? this.names.right : this.names.left;
    setTimeout(() => this.finish(mine > theirs ? 'you win!' : `${them.name} wins!`, `${l} – ${r}`), 400);
  }

  draw(ctx) {
    ctx.fillStyle = P.blue;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let x = 0; x < W; x += 60) ctx.fillRect(x, 0, 30, H);
    ctx.fillStyle = '#fff';
    for (let y = 8; y < H; y += 28) ctx.fillRect(W / 2 - 3, y, 6, 14);

    const L = this.names.left, Rr = this.names.right;
    text(ctx, String(this.score[0]), W / 2 - 60, 18, 44, L.color === '#ffffff' ? P.rose2 : P.ink, 'center');
    text(ctx, String(this.score[1]), W / 2 + 60, 18, 44, P.ink, 'center');
    text(ctx, this.host ? 'you' : L.name.slice(0, 10), W / 2 - 60, 68, 14, P.ink, 'center');
    text(ctx, this.host ? Rr.name.slice(0, 10) : 'you', W / 2 + 60, 68, 14, P.ink, 'center');

    const leftY = this.host ? this.mine : this.theirs;
    const rightY = this.host ? this.theirs : this.mine;
    const pad = (x, y, col) => {
      ctx.fillStyle = P.ink; ctx.fillRect(x - 2, y - 2, 16, PH + 4);
      ctx.fillStyle = col; ctx.fillRect(x, y, 12, PH);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x + 2, y + 3, 3, PH - 6);
    };
    pad(20, leftY, L.color);
    pad(W - 32, rightY, Rr.color);

    const b = this.shown;
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(b.x, b.y, R + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.butter2; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();

    if (!this.linked) text(ctx, 'waiting for connection…', W / 2, H - 40, 16, P.rose2, 'center');
    else if (!this.host && performance.now() - this.lastHeard > 1500) text(ctx, 'waiting for the host…', W / 2, H - 40, 16, P.rose2, 'center');
  }
}
