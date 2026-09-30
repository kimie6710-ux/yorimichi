"use client";

/* eslint-disable @next/next/no-img-element -- local UI sprites */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { SketchButton, SketchSheet } from "@/components/sketch";
import { hashSeed, rng } from "@/components/sketch/path";
import { StickerView } from "@/components/StickerView";
import {
  DECO_KINDS,
  PAGE_BACKGROUNDS,
  type BookDeco,
  type BookPage,
  type BookPos,
  type DecoKind,
  type PageBackground,
  type Sticker,
} from "@/lib/types";

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
  decos,
  pages,
  onOpen,
  onMove,
  onPagesChange,
  onAddDeco,
  onMoveDeco,
  onRemoveDeco,
}: {
  stickers: Sticker[];
  decos: BookDeco[];
  pages: BookPage[];
  onOpen: (id: string) => void;
  onMove: (id: string, pos: BookPos) => void;
  onPagesChange: (pages: BookPage[]) => void;
  onAddDeco: (kind: DecoKind, pos: BookPos) => void;
  onMoveDeco: (id: string, pos: BookPos) => void;
  onRemoveDeco: (id: string) => void;
}) {
  const base = useMemo(() => {
    const m = layout(stickers);
    for (const d of decos) m.set(d.id, d.pos);
    return m;
  }, [stickers, decos]);
  const decoIds = useMemo(() => new Set(decos.map((d) => d.id)), [decos]);
  const [selected, setSelected] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
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
      if (decoIds.has(d.id)) setSelected((cur) => (cur === d.id ? null : d.id));
      else onOpen(d.id);
      return;
    }
    const p = local.get(d.id);
    if (!p) return;
    if (decoIds.has(d.id)) onMoveDeco(d.id, p);
    else onMove(d.id, p);
  }

  // ── swiping the page itself ──
  function onPageDown(e: ReactPointerEvent<HTMLDivElement>) {
    swipe.current = { x: e.clientX, y: e.clientY };
    setSelected(null);
  }

  function addDeco(kind: DecoKind) {
    const r = rng(hashSeed(`${kind}-${decos.length}-${page}`))();
    onAddDeco(kind, { page, x: 0.35 + r * 0.3, y: 0.3 + ((r * 7) % 1) * 0.4, rot: Math.round((r * 16 - 8) * 10) / 10 });
    setTrayOpen(false);
  }
  function onPageUp(e: ReactPointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  }

  type Item = { id: string; src: string | null; label: string | null; deco: boolean };
  const onPage: Item[] = [
    ...stickers.map((s) => ({ id: s.id, src: s.imageUrl, label: s.label, deco: false })),
    ...decos.map((d) => ({ id: d.id, src: `/deco/${d.kind}.png`, label: null, deco: true })),
  ]
    .filter((it) => pos(it.id).page === page)
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
          const isSelected = selected === s.id;
          return (
            <div
              key={s.id}
              onPointerDown={(e) => onStickerDown(e, s.id)}
              onPointerMove={onStickerMove}
              onPointerUp={onStickerUp}
              onPointerCancel={onStickerUp}
              className={`absolute cursor-grab touch-none ${s.deco ? "w-[24%]" : "w-[31%]"} ${lifted ? "z-50 cursor-grabbing" : ""} ${isSelected ? "z-40" : ""}`}
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                transform: `translate(-50%, -50%) rotate(${p.rot}deg) scale(${lifted ? 1.06 : 1})`,
                transition: lifted ? "none" : "transform 0.15s ease",
              }}
            >
              <StickerView
                src={s.src}
                alt={s.label ?? ""}
                lift={lifted}
                className={`pointer-events-none mx-auto w-auto ${s.deco ? "max-h-[26cqw]" : "max-h-[36cqw]"} ${isSelected ? "rounded-xl outline-2 outline-sky-deep outline-offset-2 outline-dashed" : ""}`}
              />
              {s.label && <span className="pointer-events-none mt-0.5 block truncate text-center text-[12px] text-ink-soft">{s.label}</span>}
              {isSelected && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    onRemoveDeco(s.id);
                    setSelected(null);
                  }}
                  className="absolute -top-9 left-1/2 -translate-x-1/2 rounded-[8px_11px_9px_10px] bg-card px-3 py-1 text-[13px] font-bold whitespace-nowrap shadow-[0_2px_8px_-2px_rgb(60_50_30/0.35)]"
                  style={{ rotate: `${-p.rot}deg` }}
                >
                  はがす
                </button>
              )}
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
        <SketchButton variant="sub" size="sm" onClick={() => setTrayOpen(true)} className="!px-2.5" aria-label="シールを貼る">
          <img src="/deco/bird-front.png" alt="" className="h-6 w-auto" />
          貼る
        </SketchButton>
        <button type="button" onClick={() => go(1)} aria-label={page === pageCount - 1 ? "新しいページ" : "次のページ"} className="sketch-btn flex h-11 w-11 items-center justify-center">
          <img src="/ui/i-back.png" alt="" className="h-5 w-auto -scale-x-100" />
        </button>
      </div>

      <SketchSheet open={trayOpen} onClose={() => setTrayOpen(false)} label="シールを貼る">
        <ul className="grid grid-cols-4 gap-3 px-5 pt-2 pb-4">
          {DECO_KINDS.map((k) => (
            <li key={k}>
              <button type="button" onClick={() => addDeco(k)} className="sketch-btn flex aspect-square w-full items-center justify-center" aria-label="このシールを貼る">
                <img src={`/deco/${k}.png`} alt="" className="max-h-full w-auto" />
              </button>
            </li>
          ))}
        </ul>
      </SketchSheet>
    </div>
  );
}
