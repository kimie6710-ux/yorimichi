"use client";

/* eslint-disable @next/next/no-img-element -- local UI sprites */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { hashSeed, rng } from "@/components/sketch/path";
import { StickerView } from "@/components/StickerView";
import { PAGE_BACKGROUNDS, type BookPage, type BookPos, type PageBackground, type Sticker } from "@/lib/types";

const PER_PAGE = 6;
/** Loose slots for stickers that haven't been arranged yet (centre, 0..1). */
const SLOTS: [number, number][] = [
  [0.3, 0.18],
  [0.72, 0.24],
  [0.28, 0.49],
  [0.7, 0.55],
  [0.32, 0.8],
  [0.72, 0.84],
];
const EDGE = 0.1;
const EDGE_HOLD_MS = 650;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const PAGE_BG_LABEL: Record<PageBackground, string> = { cream: "生成り", grid: "方眼", dots: "ドット" };

/**
 * Where every sticker sits. Saved positions win; the rest keep a stable
 * default spot from their place in date order, so moving one never shuffles
 * the others.
 */
function layout(stickers: Sticker[]): Map<string, BookPos> {
  const out = new Map<string, BookPos>();
  const byDate = [...stickers].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  byDate.forEach((s, i) => {
    if (s.book) {
      out.set(s.id, s.book);
      return;
    }
    const r = rng(hashSeed(s.id));
    const [x, y] = SLOTS[i % PER_PAGE];
    out.set(s.id, {
      page: Math.floor(i / PER_PAGE),
      x: clamp(x + (r() - 0.5) * 0.08, 0.12, 0.88),
      y: clamp(y + (r() - 0.5) * 0.06, 0.1, 0.9),
      rot: s.rotation,
    });
  });
  return out;
}

interface Drag {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  offX: number;
  offY: number;
  edgeSince: number | null;
  edgeSide: -1 | 1 | 0;
}

export function Notebook({
  stickers,
  pages,
  onOpen,
  onMove,
  onPagesChange,
}: {
  stickers: Sticker[];
  pages: BookPage[];
  onOpen: (id: string) => void;
  onMove: (id: string, pos: BookPos) => void;
  onPagesChange: (pages: BookPage[]) => void;
}) {
  const base = useMemo(() => layout(stickers), [stickers]);
  const [local, setLocal] = useState<Map<string, BookPos>>(new Map());
  const [order, setOrder] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const pos = (id: string) => local.get(id) ?? base.get(id)!;
  const usedPages = Math.max(0, ...[...base.values(), ...local.values()].map((p) => p.page)) + 1;
  const pageCount = Math.max(usedPages, pages.length ? Math.max(...pages.map((p) => p.idx)) + 1 : 1, 1);
  const bgOf = (idx: number): PageBackground => pages.find((p) => p.idx === idx)?.bg ?? "cream";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the current page in range after data changes
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  function go(delta: 1 | -1) {
    const next = page + delta;
    if (next < 0) return;
    if (next >= pageCount) {
      // Flipping past the last page opens a fresh one.
      onPagesChange([...pages.filter((p) => p.idx !== next), { idx: next, bg: bgOf(page) }]);
    }
    setDir(delta);
    setPage(next);
    return next;
  }

  function setBg(bg: PageBackground) {
    onPagesChange([...pages.filter((p) => p.idx !== page), { idx: page, bg }]);
  }

  // ── dragging stickers ──
  function onStickerDown(e: ReactPointerEvent<HTMLDivElement>, id: string) {
    e.stopPropagation();
    const rect = pageRef.current!.getBoundingClientRect();
    const p = pos(id);
    drag.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      offX: e.clientX - (rect.left + p.x * rect.width),
      offY: e.clientY - (rect.top + p.y * rect.height),
      edgeSince: null,
      edgeSide: 0,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onStickerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
    if (!d.moved) {
      d.moved = true;
      setDragId(d.id);
      setOrder((o) => [...o.filter((x) => x !== d.id), d.id]);
    }
    const rect = pageRef.current!.getBoundingClientRect();
    const x = clamp((e.clientX - d.offX - rect.left) / rect.width, 0.06, 0.94);
    const y = clamp((e.clientY - d.offY - rect.top) / rect.height, 0.06, 0.94);
    const cur = pos(d.id);
    setLocal((m) => new Map(m).set(d.id, { ...cur, page, x, y }));

    // Hold near the left / right edge to carry the sticker to the next page.
    const px = (e.clientX - rect.left) / rect.width;
    const side: -1 | 1 | 0 = px < EDGE ? -1 : px > 1 - EDGE ? 1 : 0;
    if (side !== d.edgeSide) {
      d.edgeSide = side;
      d.edgeSince = side ? e.timeStamp : null;
    } else if (side && d.edgeSince && e.timeStamp - d.edgeSince > EDGE_HOLD_MS) {
      const next = go(side);
      d.edgeSince = e.timeStamp;
      if (next !== undefined) {
        setLocal((m) => new Map(m).set(d.id, { ...cur, page: next, x: side === 1 ? 0.2 : 0.8, y }));
        d.offX = 0;
      }
    }
  }

  function onStickerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved) {
      onOpen(d.id);
      return;
    }
    const p = local.get(d.id);
    if (p) onMove(d.id, p);
  }

  // ── swiping the page itself ──
  function onPageDown(e: ReactPointerEvent<HTMLDivElement>) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }
  function onPageUp(e: ReactPointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  }

  const onPage = stickers
    .filter((s) => pos(s.id).page === page)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  return (
    <div>
      <div
        ref={pageRef}
        onPointerDown={onPageDown}
        onPointerUp={onPageUp}
        className={`book-page book-${bgOf(page)} relative aspect-[3/4.1] w-full touch-pan-y overflow-hidden select-none [container-type:inline-size]`}
      >
        <span key={page} className={`pointer-events-none absolute inset-0 ${dir === 1 ? "animate-[page-turn-r_0.3s_ease-out]" : "animate-[page-turn-l_0.3s_ease-out]"}`} aria-hidden />
        <span className="pointer-events-none absolute top-3 right-4 text-[12px] text-ink-mute tabular-nums">
          {page + 1}
        </span>
        {onPage.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-ink-mute">まだ何も貼っていないページ</p>
        )}
        {onPage.map((s) => {
          const p = pos(s.id);
          const lifted = dragId === s.id;
          return (
            <div
              key={s.id}
              onPointerDown={(e) => onStickerDown(e, s.id)}
              onPointerMove={onStickerMove}
              onPointerUp={onStickerUp}
              onPointerCancel={onStickerUp}
              className={`absolute w-[31%] cursor-grab touch-none ${lifted ? "z-50 cursor-grabbing" : ""}`}
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${p.rot}deg) scale(${lifted ? 1.06 : 1})`,
                transition: lifted ? "none" : "transform 0.15s ease",
              }}
            >
              <StickerView src={s.imageUrl} alt={s.label} lift={lifted} className="pointer-events-none mx-auto max-h-[36cqw] w-auto" />
              <span className="pointer-events-none mt-0.5 block truncate text-center text-[12px] text-ink-soft">{s.label}</span>
            </div>
          );
        })}
        {dragId && (
          <>
            <span className="pointer-events-none absolute inset-y-0 left-0 w-[10%] bg-gradient-to-r from-sky/70 to-transparent" aria-hidden />
            <span className="pointer-events-none absolute inset-y-0 right-0 w-[10%] bg-gradient-to-l from-sky/70 to-transparent" aria-hidden />
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} disabled={page === 0} aria-label="前のページ" className="sketch-btn flex h-11 w-11 items-center justify-center disabled:opacity-30">
          <img src="/ui/i-back.png" alt="" className="h-5 w-auto" />
        </button>
        <div className="flex items-center gap-2" role="radiogroup" aria-label="ページの背景">
          {PAGE_BACKGROUNDS.map((bg) => (
            <button
              key={bg}
              type="button"
              role="radio"
              aria-checked={bgOf(page) === bg}
              aria-label={PAGE_BG_LABEL[bg]}
              onClick={() => setBg(bg)}
              className={`book-${bg} relative h-8 w-8 rounded-[7px_9px_6px_10px] ${bgOf(page) === bg ? "outline-2 outline-ink outline-solid" : "outline-1 outline-line outline-solid"}`}
            />
          ))}
          <span className="ml-1 text-[12px] text-ink-mute tabular-nums">
            {page + 1} / {pageCount}
          </span>
        </div>
        <button type="button" onClick={() => go(1)} aria-label={page === pageCount - 1 ? "新しいページ" : "次のページ"} className="sketch-btn flex h-11 w-11 items-center justify-center">
          <img src="/ui/i-back.png" alt="" className="h-5 w-auto -scale-x-100" />
        </button>
      </div>
    </div>
  );
}
