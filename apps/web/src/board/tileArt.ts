/**
 * Процедурная геометрия плиток: коридоры с неровными краями. Края коридоров
 * на границе плитки всегда в одних и тех же точках, поэтому соседние плитки
 * стыкуются без зазоров (docs/spec/05-assets.md §2).
 */

const LO = 34;
const HI = 66;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

/** Контур коридоров для маски выходов в повороте 0 (бит 0 — север, 1 — восток, 2 — юг, 3 — запад). */
function outline(exits: number): Pt[] {
  const n = (exits & 1) !== 0;
  const e = (exits & 2) !== 0;
  const s = (exits & 4) !== 0;
  const w = (exits & 8) !== 0;
  const pts: Pt[] = [[LO, LO]];
  if (n) pts.push([LO, 0], [HI, 0]);
  pts.push([HI, LO]);
  if (e) pts.push([100, LO], [100, HI]);
  pts.push([HI, HI]);
  if (s) pts.push([HI, 100], [LO, 100]);
  pts.push([LO, HI]);
  if (w) pts.push([0, HI], [0, LO]);
  return pts;
}

function onBorder([x, y]: Pt): boolean {
  return x <= 0 || x >= 100 || y <= 0 || y >= 100;
}

/** Разбить рёбра и сдвинуть внутренние точки, чтобы края выглядели вырубленными в камне. */
function roughen(pts: Pt[], rng: () => number, amp: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] as Pt;
    const b = pts[(i + 1) % pts.length] as Pt;
    out.push(a);
    // Ребро вдоль границы плитки не трогаем: это шов с соседом.
    if (onBorder(a) && onBorder(b) && (a[0] === b[0] || a[1] === b[1])) continue;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.round(len / 6));
    const nx = -dy / len;
    const ny = dx / len;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      // У границы плитки затухаем, чтобы шов совпадал.
      const fade = Math.min(1, Math.min(t, 1 - t) * steps * 0.6);
      const nearEdge = onBorder(a) || onBorder(b) ? fade : 1;
      const j = (rng() * 2 - 1) * amp * nearEdge;
      out.push([a[0] + dx * t + nx * j, a[1] + dy * t + ny * j]);
    }
  }
  return out;
}

function toPath(pts: Pt[]): string {
  return `${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}Z`;
}

/** Трещины разрушающейся плитки: ломаные линии поперёк коридоров. */
function cracks(exits: number, rng: () => number): string {
  const segs: string[] = [];
  const arms: [number, number, number, number][] = [];
  if (exits & 1) arms.push([50, 50, 50, 4]);
  if (exits & 2) arms.push([50, 50, 96, 50]);
  if (exits & 4) arms.push([50, 50, 50, 96]);
  if (exits & 8) arms.push([50, 50, 4, 50]);
  for (const [x1, y1, x2, y2] of arms) {
    let x = x1;
    let y = y1;
    const n = 6;
    let d = `M${x} ${y}`;
    for (let i = 1; i <= n; i++) {
      x = x1 + ((x2 - x1) * i) / n + (rng() * 2 - 1) * 5;
      y = y1 + ((y2 - y1) * i) / n + (rng() * 2 - 1) * 5;
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    segs.push(d);
    // Мелкие боковые трещины.
    for (let i = 0; i < 3; i++) {
      const t = 0.2 + rng() * 0.6;
      const bx = x1 + (x2 - x1) * t;
      const by = y1 + (y2 - y1) * t;
      const ang = rng() * Math.PI * 2;
      const len = 6 + rng() * 10;
      segs.push(
        `M${bx.toFixed(1)} ${by.toFixed(1)}L${(bx + Math.cos(ang) * len).toFixed(1)} ${(by + Math.sin(ang) * len).toFixed(1)}`,
      );
    }
  }
  return segs.join('');
}

/** Царапины-«молнии» на камне вокруг коридоров, как в оригинальной гравюре. */
function scratches(rng: () => number, count: number): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const corner = Math.floor(rng() * 4);
    let x = corner % 2 === 0 ? 4 + rng() * 26 : 70 + rng() * 26;
    let y = corner < 2 ? 4 + rng() * 26 : 70 + rng() * 26;
    d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const segs = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < segs; k++) {
      x += (rng() * 2 - 1) * 7;
      y += (rng() * 2 - 1) * 7;
      d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  }
  return d;
}

export interface TileGeometry {
  passage: string;
  cracks: string;
  scratches: string;
}

const cache = new Map<string, TileGeometry>();

export function tileGeometry(exits: number, seed: number, crumbling: boolean): TileGeometry {
  const key = `${exits}:${seed}:${crumbling}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = mulberry32(seed * 7919 + exits);
  const geo: TileGeometry = {
    passage: toPath(roughen(outline(exits), rng, 2.2)),
    cracks: crumbling ? cracks(exits, rng) : '',
    scratches: scratches(rng, 5 + Math.floor(rng() * 4)),
  };
  cache.set(key, geo);
  return geo;
}

/** Неровный край ямы. */
export function pitRim(seed: number): string {
  const rng = mulberry32(seed * 104729 + 17);
  const pts: Pt[] = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 30 + (rng() * 2 - 1) * 4;
    pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
  }
  return toPath(pts);
}
