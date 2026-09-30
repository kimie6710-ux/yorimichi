"use client";

import type { ReactNode } from "react";

import { StickerView } from "./StickerView";

/** Stickers loosely stuck on paper, each with its small caption. */
export function StickerGrid({
  items,
  onPick,
  caption,
  cols = 3,
}: {
  items: { id: string; imageUrl: string | null; label: string; rotation: number }[];
  onPick?: (id: string) => void;
  caption?: (id: string) => ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <ul className={`grid gap-x-3 gap-y-5 ${cols === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {items.map((s) => (
        <li key={s.id} className="flex flex-col items-center text-center">
          <button type="button" onClick={() => onPick?.(s.id)} disabled={!onPick} className="w-full transition-transform active:translate-y-0.5">
            <StickerView src={s.imageUrl} alt={s.label} rotation={s.rotation} className="mx-auto w-[88%]" />
          </button>
          <span className="mt-1 line-clamp-1 text-sm font-bold">{s.label}</span>
          {caption?.(s.id)}
        </li>
      ))}
    </ul>
  );
}
