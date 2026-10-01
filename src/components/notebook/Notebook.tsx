"use client";

/* eslint-disable @next/next/no-img-element -- local UI sprites */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { SketchButton, SketchSheet, Tape } from "@/components/sketch";
import { hashSeed, rng } from "@/components/sketch/path";
import { StickerView } from "@/components/StickerView";
import { StickerBox } from "./StickerBox";
import {
  DECO_KINDS,
  PAGE_BACKGROUNDS,
  stickerOfDeco,
  type BookDeco,
  type BookDecoKind,
  type BookPage,
  type BookPos,
  type PageBackground,
  type Sticker,
} from "@/lib/types";

const EDGE = 0.1;
const MAX_PAGES = 200;
const EDGE_HOLD_MS = 650;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const PAGE_BG_LABEL: Record<PageBackground, string> = { cream: "生成り", grid: "方眼", kraft: "クラフト", pink: "ピンク", dots: "ドット", lined: "罫線" };

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

/**
 * The notebook: pages you stick things on. Your stickers live in the box
 * (ボックス); sticking one puts a copy on the page, so the same sticker can go
 * on many pages, and peeling it off leaves it in the box.
 */
export function Notebook({
  stickers,
  decos,
  pages,
  onOpen,
  onPagesChange,
  onAddDeco,
  onMoveDeco,
  onRemoveDeco,
}: {
  stickers: Sticker[];
  decos: BookDeco[];
  pages: BookPage[];
  /** Open a stuck sticker (and which copy on the page it was, so it can be peeled off). */
  onOpen: (stickerId: string, decoId: string) => void;
  onPagesChange: (pages: BookPage[]) => void;
  onAddDeco: (kind: BookDecoKind, pos: BookPos) => void;
  onMoveDeco: (id: string, pos: BookPos) => void;
  onRemoveDeco: (id: string) => void;
}) {
  const base = useMemo(() => new Map(decos.map((d) => [d.id, d.pos])), [decos]);
  const byId = useMemo(() => new Map(stickers.map((s) => [s.id, s])), [stickers]);
  /** How many times each sticker is stuck somewhere. */
  const stuck = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decos) {
      const sid = stickerOfDeco(d.kind);
      if (sid) m.set(sid, (m.get(sid) ?? 0) + 1);
    }
    return m;
  }, [decos]);
  const unstuck = stickers.filter((s) => !stuck.has(s.id)).length;
  const [selected, setSelected] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
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
  // A new page only exists on screen until something is stuck on it (or its paper changes).
  const pageCount = Math.min(MAX_PAGES, Math.max(usedPages, pages.length ? Math.max(...pages.map((p) => p.idx)) + 1 : 1, page + 1, 1));
  const bgOf = (idx: number): PageBackground => pages.find((p) => p.idx === idx)?.bg ?? "cream";

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the current page in range after data changes
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  function go(delta: 1 | -1) {
    const next = page + delta;
    if (next < 0 || next >= MAX_PAGES) return;
    // Past the last page there's one fresh page — but not a pile of empty ones.
    if (next >= pageCount && !decos.some((d) => (local.get(d.id) ?? d.pos).page === page)) return;
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
      // Your stickers open straight away; birds and tape show "はがす".
      const sid = stickerOfDeco(decos.find((x) => x.id === d.id)?.kind ?? "");
      if (sid) onOpen(sid, d.id);
      else setSelected((cur) => (cur === d.id ? null : d.id));
      return;
    }
    const p = local.get(d.id);
    if (p) onMoveDeco(d.id, p);
  }

  // ── swiping the page itself ──
  function onPageDown(e: ReactPointerEvent<HTMLDivElement>) {
    swipe.current = { x: e.clientX, y: e.clientY };
    setSelected(null);
  }

  function addDeco(kind: BookDecoKind, rot?: number) {
    const r = rng(hashSeed(`${kind}-${decos.length}-${page}`))();
    onAddDeco(kind, { page, x: 0.35 + r * 0.3, y: 0.3 + ((r * 7) % 1) * 0.4, rot: rot ?? Math.round((r * 16 - 8) * 10) / 10 });
    setTrayOpen(false);
    setBoxOpen(false);
  }
  function onPageUp(e: ReactPointerEvent<HTMLDivElement>) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(dx < 0 ? 1 : -1);
  }

  type Item = { id: string; src: string | null; label: string | null; deco: boolean; tape?: boolean; sticker: string | null };
  const onPage: Item[] = decos
    .flatMap((d): Item[] => {
      const sid = stickerOfDeco(d.kind);
      if (!sid) return [{ id: d.id, src: `/deco/${d.kind}.png`, label: null, deco: true, tape: d.kind.startsWith("tape-"), sticker: null }];
      const st = byId.get(sid);
      return st ? [{ id: d.id, src: st.imageUrl, label: st.label, deco: false, sticker: sid }] : [];
    })
    .filter((it) => pos(it.id).page === page)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={pageRef}
        onPointerDown={onPageDown}
        onPointerUp={onPageUp}
        className={`book-page book-${bgOf(page)} relative min-h-0 w-full flex-1 touch-none overflow-hidden select-none [container-type:inline-size]`}
      >
        <span key={page} className={`pointer-events-none absolute inset-0 ${dir === 1 ? "animate-[page-turn-r_0.3s_ease-out]" : "animate-[page-turn-l_0.3s_ease-out]"}`} aria-hidden />
        <Tape seed={`page-${page}-a`} corner="left" className="!-top-1 !w-16" />
        <Tape seed={`page-${page}-b`} corner="right" className="!-top-1 !w-16" />
        <span className="pointer-events-none absolute top-3 right-4 text-[14px] text-ink-mute tabular-nums">
          {page + 1}
        </span>
        {onPage.length === 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-ink-mute">ボックスから、好きなシールを貼ってみて</p>
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
              className={`absolute cursor-grab touch-none ${s.tape ? "w-[42%]" : s.deco ? "w-[24%]" : "w-[31%]"} ${lifted ? "z-50 cursor-grabbing" : ""} ${isSelected ? "z-40" : ""}`}
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
                className={`pointer-events-none mx-auto ${s.tape ? "w-full opacity-90" : "w-auto"} ${s.deco && !s.tape ? "max-h-[26cqw]" : s.tape ? "" : "max-h-[36cqw]"} ${isSelected ? "rounded-xl outline-2 outline-sky-deep outline-offset-2 outline-dashed" : ""}`}
              />
              {s.label && <span className="pointer-events-none mt-0.5 block truncate text-center font-hand text-[14px] text-ink-soft">{s.label}</span>}
              {isSelected && (
                <div
                  className="absolute -top-10 left-1/2 flex -translate-x-1/2 gap-1.5"
                  style={{ rotate: `${-p.rot}deg` }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveDeco(s.id);
                      setSelected(null);
                    }}
                    className="rounded-[8px_11px_9px_10px] bg-card px-3 py-1 text-[14px] font-bold whitespace-nowrap shadow-[0_2px_8px_-2px_rgb(60_50_30/0.35)]"
                  >
                    はがす
                  </button>
                </div>
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

      {/* one compact row: pages, paper, stickers */}
      <div className="relative mt-2 flex shrink-0 items-center justify-between gap-1">
        {paperOpen && (
          <div className="animate-peek absolute right-0 bottom-full left-0 mb-2 flex items-center justify-center gap-2 rounded-[12px_16px_11px_15px] bg-card/95 p-2 shadow-[0_4px_14px_-4px_rgb(60_50_30/0.35)]" role="radiogroup" aria-label="ページの紙">
            {PAGE_BACKGROUNDS.map((bg) => (
              <button
                key={bg}
                type="button"
                role="radio"
                aria-checked={bgOf(page) === bg}
                aria-label={PAGE_BG_LABEL[bg]}
                onClick={() => setBg(bg)}
                className={`book-${bg} sketch-btn h-9 w-9 rounded-[7px_10px_6px_11px] shadow-[0_1px_2px_rgb(60_50_30/0.2)] ${bgOf(page) === bg ? "outline-2 outline-ink outline-offset-2 outline-solid" : ""}`}
              />
            ))}
          </div>
        )}
        <button type="button" onClick={() => go(-1)} disabled={page === 0} aria-label="前のページ" className="sketch-btn flex h-10 w-8 shrink-0 items-center justify-center disabled:opacity-30">
          <img src="/ui/i-back.png" alt="" className="h-5 w-auto" />
        </button>
        <span className="w-11 shrink-0 text-center text-[14px] whitespace-nowrap text-ink-mute tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <SketchButton variant="plain" size="sm" onClick={() => setPaperOpen((v) => !v)} aria-expanded={paperOpen} className="!min-h-10 !gap-1 !px-1.5 whitespace-nowrap">
          <span className={`book-${bgOf(page)} inline-block h-5 w-5 rounded-[4px_6px_4px_5px] shadow-[0_1px_2px_rgb(60_50_30/0.25)]`} aria-hidden />
          紙
        </SketchButton>
        <SketchButton variant="primary" size="sm" onClick={() => setBoxOpen(true)} className="relative !min-h-10 !gap-1 !px-2 whitespace-nowrap" aria-label={`シールを貼る（まだ貼っていないシール${unstuck}枚）`}>
          <img src="/ui/n-cards.png" alt="" className="h-5 w-auto" />
          シール
          {unstuck > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-ink px-1 text-center text-[14px] leading-5 font-bold text-white tabular-nums">{unstuck}</span>
          )}
        </SketchButton>
        <SketchButton variant="sub" size="sm" onClick={() => setTrayOpen(true)} className="!min-h-10 !gap-1 !px-2 whitespace-nowrap" aria-label="みちびやテープで飾る">
          <img src="/deco/bird-front.png" alt="" className="h-5 w-auto" />
          かざり
        </SketchButton>
        <button type="button" onClick={() => go(1)} aria-label={page === pageCount - 1 ? "新しいページ" : "次のページ"} className="sketch-btn flex h-10 w-8 shrink-0 items-center justify-center">
          <img src="/ui/i-back.png" alt="" className="h-5 w-auto -scale-x-100" />
        </button>
      </div>

      <SketchSheet open={boxOpen} onClose={() => setBoxOpen(false)} label="ボックス">
        <StickerBox stickers={stickers} stuck={stuck} onPick={(st) => addDeco(`sticker:${st.id}`, st.rotation)} />
      </SketchSheet>

      <SketchSheet open={trayOpen} onClose={() => setTrayOpen(false)} label="かざり">
        <p className="px-5 pt-1 font-hand text-lg">みちび</p>
        <ul className="grid grid-cols-4 gap-3 px-5 pt-2 pb-4">
          {DECO_KINDS.filter((k) => k.startsWith("bird-")).map((k) => (
            <li key={k}>
              <button type="button" onClick={() => addDeco(k)} className="sketch-btn flex aspect-square w-full items-center justify-center" aria-label="このシールを貼る">
                <img src={`/deco/${k}.png`} alt="" className="max-h-full w-auto" />
              </button>
            </li>
          ))}
        </ul>
        <p className="px-5 pt-1 font-hand text-lg">マスキングテープ</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pt-2 pb-6">
          {DECO_KINDS.filter((k) => k.startsWith("tape-")).map((k) => (
            <li key={k}>
              <button type="button" onClick={() => addDeco(k)} className="sketch-btn block w-full" aria-label="このテープを貼る">
                <img src={`/deco/${k}.png`} alt="" className="h-8 w-full object-cover opacity-90" />
              </button>
            </li>
          ))}
        </ul>
      </SketchSheet>
    </div>
  );
}
