"use client";

import { useCallback, useEffect, useState } from "react";

import { Michibi } from "@/components/Michibi";
import { Notebook } from "@/components/notebook/Notebook";
import { SketchSheet } from "@/components/sketch";
import { StickerDetail } from "@/components/StickerDetail";
import { TopBar } from "@/components/TopBar";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import type { BookPage, BookPos, Sticker } from "@/lib/types";

/** 手帳: pages you flip through, stickers you stick wherever you like. */
export default function NotebookPage() {
  const [items, setItems] = useState<Sticker[] | null>(null);
  const [pages, setPages] = useState<BookPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.myStickers(), api.bookPages()])
      .then(([s, p]) => {
        setItems(s.items);
        setPages(p.pages);
      })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込めませんでした"));
  }, []);

  const move = useCallback((id: string, book: BookPos) => {
    setItems((list) => list?.map((s) => (s.id === id ? { ...s, book } : s)) ?? null);
    void api.moveInBook(id, book).catch(() => undefined);
  }, []);

  const changePages = useCallback((next: BookPage[]) => {
    setPages(next);
    void api.saveBookPages(next).catch(() => undefined);
  }, []);

  const open = items?.find((s) => s.id === openId) ?? null;

  return (
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-8">
      <TopBar />
      <div className="mt-5 mb-3 flex items-end justify-between px-1">
        <h1 className="text-2xl font-bold tracking-wide">手帳</h1>
        {items && items.length > 0 && <span className="text-sm text-ink-mute">{items.length}枚</span>}
      </div>

      {error && <p className="mt-6 text-sm font-bold">{error}</p>}
      {!items && !error && (
        <div className="mt-16 flex justify-center">
          <Michibi mood="side" size={72} animate="bob" />
        </div>
      )}
      {items && items.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <Michibi mood="perch" size={96} says={MICHIBI_LINES.collectionEmpty} className="flex-col-reverse !items-center" animate="none" />
          <p className="mt-4 max-w-[260px] text-sm text-ink-soft">街で見つけたものを撮ると、ここに貼られていきます。</p>
        </div>
      )}
      {items && items.length > 0 && (
        <>
          <Notebook stickers={items} pages={pages} onOpen={setOpenId} onMove={move} onPagesChange={changePages} />
          <p className="mt-3 text-center text-[12px] text-ink-mute">シールはドラッグで好きな場所へ。端で止めると隣のページへ。</p>
        </>
      )}

      <SketchSheet open={!!open} onClose={() => setOpenId(null)} label="シール">
        {open && <StickerDetail key={open.id} sticker={open} onChange={(s) => setItems((list) => list?.map((x) => (x.id === s.id ? s : x)) ?? null)} />}
      </SketchSheet>
    </main>
  );
}
