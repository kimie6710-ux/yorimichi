"use client";

import { useState } from "react";

import { SketchSheet } from "./sketch";
import { StickerView } from "./StickerView";

export interface Find {
  id: string;
  imageUrl: string | null;
  label: string;
  memo?: string;
  rotation: number;
  mine?: boolean;
}

/**
 * What people found at a place: just the stickers in a row. Tap one to see
 * what it's called and what they wrote (kept out of the row so it stays calm).
 */
export function FindsRow({ items, className = "", size = "max-h-[20dvh]" }: { items: Find[]; className?: string; size?: string }) {
  const [open, setOpen] = useState<Find | null>(null);
  return (
    <>
      <ul className={`hide-scrollbar -mx-4 flex items-center gap-4 overflow-x-auto px-4 py-1 ${className}`}>
        {items.map((f) => (
          <li key={f.id} className="w-[30%] shrink-0">
            <button type="button" onClick={() => setOpen(f)} aria-label={f.label} className="block w-full transition-transform active:translate-y-0.5">
              <StickerView src={f.imageUrl} alt={f.label} rotation={f.rotation} className={`mx-auto w-auto ${size}`} />
            </button>
          </li>
        ))}
      </ul>

      <SketchSheet open={!!open} onClose={() => setOpen(null)} label={open?.label ?? "シール"}>
        {open && (
          <div className="flex flex-col items-center px-6 pt-2 pb-8 text-center">
            <StickerView src={open.imageUrl} alt={open.label} rotation={open.rotation} lift className="max-h-[40dvh] w-auto" />
            <p className="mt-4 font-hand text-[24px]">{open.label}</p>
            {open.memo && <p className="mt-2 font-hand text-[17px] leading-relaxed text-ink-soft">「{open.memo}」</p>}
            <p className="mt-3 text-[14px] text-ink-mute">{open.mine ? "あなたが見つけた" : "知らない誰かが見つけた"}</p>
          </div>
        )}
      </SketchSheet>
    </>
  );
}
