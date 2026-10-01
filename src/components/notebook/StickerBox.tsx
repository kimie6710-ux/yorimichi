"use client";

import { useMemo, useState } from "react";

import { StickerView } from "@/components/StickerView";
import { SPOT_KIND_LABEL } from "@/lib/places/place-types";
import type { SpotKind, Sticker } from "@/lib/types";
import { Wrap } from "@/components/Wrap";

type Filter = "all" | "new" | "received" | SpotKind;
type View = "date" | "place";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "new", label: "まだ貼ってない" },
  { value: "received", label: "届いた" },
  { value: "eat", label: SPOT_KIND_LABEL.eat },
  { value: "shop", label: SPOT_KIND_LABEL.shop },
  { value: "walk", label: SPOT_KIND_LABEL.walk },
];

const monthOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
};

/**
 * ボックス: every sticker you have. Find one by name, narrow it down, see it
 * by month or by place, and tap to stick it on the open page.
 */
export function StickerBox({ stickers, stuck, onPick }: { stickers: Sticker[]; stuck: Map<string, number>; onPick: (s: Sticker) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("date");

  const groups = useMemo(() => {
    const word = q.trim();
    const hit = stickers
      .filter((s) => {
        if (filter === "new") return !stuck.has(s.id);
        if (filter === "received") return s.origin === "received";
        if (filter !== "all") return s.spotKind === filter;
        return true;
      })
      .filter((s) => !word || [s.label, s.memo, s.spotName, s.spotCopy ?? ""].some((t) => t.includes(word)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const out = new Map<string, Sticker[]>();
    for (const s of hit) {
      // Places you haven't been to stay a surprise: grouped under their line instead of the name.
      const key = view === "date" ? monthOf(s.createdAt) : s.spotName || s.spotCopy || "どこかで";
      out.set(key, [...(out.get(key) ?? []), s]);
    }
    return [...out.entries()];
  }, [stickers, stuck, q, filter, view]);

  return (
    <div className="px-5 pb-6">
      <div className="flex items-center gap-2 pt-1">
        <p className="font-hand text-lg">ボックス</p>
        <div role="radiogroup" aria-label="まとめ方" className="ml-auto flex gap-1">
          {(["date", "place"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`rounded-[9px_12px_8px_11px] px-2.5 py-1 text-[14px] ${view === v ? "bg-butter font-bold" : "bg-card text-ink-soft"}`}
            >
              {v === "date" ? "日付ごと" : "場所ごと"}
            </button>
          ))}
        </div>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="名前でさがす"
        aria-label="名前でさがす"
        className="mt-2 w-full rounded-[10px_14px_9px_13px] bg-card px-3 py-2 text-[16px] outline-none placeholder:text-ink-mute focus:shadow-[0_0_0_2px_var(--color-butter)]"
      />

      <div className="hide-scrollbar -mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="しぼりこみ">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-full px-3 py-1 text-[14px] whitespace-nowrap ${filter === f.value ? "bg-ink font-bold text-white" : "bg-card text-ink-soft"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="pt-6 pb-4 text-center text-[14px] text-ink-soft">{stickers.length ? "見つからなかった。" : "撮ったシールが、ここに入ります。"}</p>
      ) : (
        groups.map(([title, list]) => (
          <section key={title} className="mt-3">
            <h3 className="sticky top-0 z-10 -mx-1 truncate bg-paper-deep px-1 py-1 text-[14px] font-bold text-ink-soft">
              {title}
              <span className="ml-1.5 font-normal text-ink-mute tabular-nums">{list.length}</span>
            </h3>
            <ul className="grid grid-cols-3 gap-x-3 gap-y-3 pt-1">
              {list.map((st) => (
                <li key={st.id}>
                  <button type="button" onClick={() => onPick(st)} className="relative flex w-full flex-col items-center text-center transition-transform active:translate-y-0.5">
                    <span className="flex h-24 w-full items-center justify-center">
                      <StickerView src={st.imageUrl} alt={st.label} rotation={st.rotation} className="max-h-24 w-auto" />
                    </span>
                    <span className="mt-1 w-full text-[14px] leading-snug"><Wrap>{st.label}</Wrap></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
