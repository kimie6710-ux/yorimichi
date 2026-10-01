// One-time: stickers used to sit in the notebook directly (one place each).
// Now the notebook holds "stuck" copies (book_decos kind=sticker:<id>) and the
// stickers themselves live in the box. This sticks every existing sticker
// exactly where it was shown, so the notebook looks the same.
// Stop the dev server first (it keeps .data in memory), then:
//   npx tsx scripts/data/migrate-box.ts
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

import { hashSeed, rng } from "../../src/components/sketch/path";

type Row = Record<string, unknown> & { id: string };
const FILE = ".data/db.json";
const db = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, Row[]>;
copyFileSync(FILE, `${FILE}.before-box`);

// Same defaults the notebook used for stickers without a saved position.
const PER_PAGE = 6;
const SLOTS: [number, number][] = [
  [0.3, 0.18],
  [0.72, 0.24],
  [0.28, 0.49],
  [0.7, 0.55],
  [0.32, 0.8],
  [0.72, 0.84],
];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const decos = (db.book_decos ??= []);
const already = new Set(decos.map((d) => String(d.kind)));
const owners = new Map<string, Row[]>();
for (const s of db.stickers ?? []) owners.set(String(s.owner_id), [...(owners.get(String(s.owner_id)) ?? []), s]);

let added = 0;
for (const [owner, list] of owners) {
  const byDate = [...list].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  byDate.forEach((s, i) => {
    const kind = `sticker:${s.id}`;
    if (already.has(kind)) return;
    let pos: { page: number; x: number; y: number; rot: number };
    if (s.book_page != null && s.book_x != null && s.book_y != null) {
      pos = { page: Number(s.book_page), x: Number(s.book_x), y: Number(s.book_y), rot: Number(s.book_rot ?? s.rotation ?? 0) };
    } else {
      const r = rng(hashSeed(s.id));
      const [x, y] = SLOTS[i % PER_PAGE];
      pos = {
        page: Math.floor(i / PER_PAGE),
        x: clamp(x + (r() - 0.5) * 0.08, 0.12, 0.88),
        y: clamp(y + (r() - 0.5) * 0.06, 0.1, 0.9),
        rot: Number(s.rotation ?? 0),
      };
    }
    decos.push({ id: randomUUID(), user_id: owner, kind, ...pos, created_at: String(s.created_at) });
    added++;
  });
}
writeFileSync(FILE, JSON.stringify(db));
console.log(`stuck ${added} stickers into notebooks (backup: ${FILE}.before-box)`);
