// Shared bits for the two-player games.
export const P = {
  cream: '#fff8f3', pink: '#ffd1e3', rose: '#ffb3d1', rose2: '#f590b9',
  lav: '#e3d3f7', lilac: '#cdb6ef', lilac2: '#b79be3',
  blue: '#cfe6ff', sky: '#a9d1fb', sky2: '#7fb8f0',
  mint: '#c8f1dc', mint2: '#95dfb7', butter: '#fff1b3', butter2: '#ffe27a',
  peach: '#ffd9c4', peach2: '#ffb894', ink: '#8a6597', inkSoft: '#b495c4',
};

// Small seeded random generator so both players build the same board.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function text(ctx, str, x, y, size = 14, color = P.ink, align = 'left') {
  ctx.font = `700 ${size}px "Pixelify Sans", "Silkscreen", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(str, x, y);
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function blob(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - r * 0.45, y - r * 0.3, r * 0.3, r * 0.35);
  ctx.fillRect(x + r * 0.15, y - r * 0.3, r * 0.3, r * 0.35);
}

let actx = null;
export function beep(freq = 440, dur = 0.08, type = 'square', vol = 0.04, slide = 0) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* no sound */ }
}
