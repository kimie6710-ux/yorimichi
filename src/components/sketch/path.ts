/**
 * Hand-drawn outline paths. A seeded wobble keeps each block's shape stable
 * across renders while making every block a little different.
 */

export function hashSeed(input: string | number): number {
  const s = String(input);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];

export interface SketchOpts {
  /** Base corner radius; each corner varies around it. */
  radius?: number;
  /** Max sideways wobble of the edges in px. */
  wobble?: number;
  /** Inset from the box so the stroke stays inside. */
  inset?: number;
}

function outlinePoints(w: number, h: number, seed: number, { radius = 14, wobble = 1.6, inset = 2 }: SketchOpts): Pt[] {
  const rand = rng(seed);
  const j = (amt: number) => (rand() * 2 - 1) * amt;
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const maxR = Math.max(2, Math.min((x1 - x0) / 2, (y1 - y0) / 2));
  const r = [0, 1, 2, 3].map(() => Math.min(maxR, radius * (0.55 + rand() * 0.9)));
  const pts: Pt[] = [];

  // Corners: TL, TR, BR, BL. Each corner = 3 points on a (slightly squashed) arc.
  const corner = (cx: number, cy: number, rr: number, start: number) => {
    for (let k = 0; k < 3; k++) {
      const a = start + (k * Math.PI) / 4;
      pts.push([cx + Math.cos(a) * rr + j(0.6), cy + Math.sin(a) * rr + j(0.6)]);
    }
  };
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / 70));
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1) + j(0.08 / n);
      const off = j(wobble);
      pts.push([ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off]);
    }
  };

  corner(x0 + r[0], y0 + r[0], r[0], Math.PI);
  edge(x0 + r[0], y0, x1 - r[1], y0, 0, 1);
  corner(x1 - r[1], y0 + r[1], r[1], -Math.PI / 2);
  edge(x1, y0 + r[1], x1, y1 - r[2], 1, 0);
  corner(x1 - r[2], y1 - r[2], r[2], 0);
  edge(x1 - r[2], y1, x0 + r[3], y1, 0, 1);
  corner(x0 + r[3], y1 - r[3], r[3], Math.PI / 2);
  edge(x0, y1 - r[3], x0, y0 + r[0], 1, 0);
  return pts;
}

/** Closed Catmull-Rom spline through the points, as cubic Béziers. */
function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + "Z";
}

export function sketchPath(w: number, h: number, seed: number, opts: SketchOpts = {}): string {
  if (w <= 0 || h <= 0) return "";
  return smoothClosed(outlinePoints(w, h, seed, opts));
}

/** A slightly wavy horizontal line (tab bar top, dividers). */
export function sketchLine(w: number, y: number, seed: number, wobble = 1.2): string {
  const rand = rng(seed);
  const n = Math.max(2, Math.round(w / 60));
  let d = `M2,${(y + (rand() * 2 - 1) * wobble).toFixed(1)}`;
  for (let k = 1; k <= n; k++) {
    const x = 2 + ((w - 4) * k) / n;
    const cx = x - (w - 4) / n / 2;
    d += ` Q${cx.toFixed(1)},${(y + (rand() * 2 - 1) * wobble * 1.6).toFixed(1)} ${x.toFixed(1)},${(y + (rand() * 2 - 1) * wobble).toFixed(1)}`;
  }
  return d;
}

/** Wobbly ellipse (active tab, hand-drawn circle around a thing). */
export function sketchEllipse(w: number, h: number, seed: number): string {
  const rand = rng(seed);
  const cx = w / 2, cy = h / 2;
  const pts: Pt[] = [];
  const n = 9;
  const start = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const k = 0.94 + rand() * 0.1;
    pts.push([cx + Math.cos(a) * (w / 2 - 3) * k, cy + Math.sin(a) * (h / 2 - 3) * k]);
  }
  return smoothClosed(pts);
}
