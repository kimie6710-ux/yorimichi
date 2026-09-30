"use client";

import { useCallback, useEffect, useState } from "react";

import { BirdStroll } from "@/components/BirdStroll";
import { Michibi } from "@/components/Michibi";
import { Notebook } from "@/components/notebook/Notebook";
import { SketchSheet } from "@/components/sketch";
import { StickerDetail } from "@/components/StickerDetail";
import { TopBar } from "@/components/TopBar";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import type { BookDeco, BookPage, BookPos, DecoKind, Sticker } from "@/lib/types";

/** 手帳: pages you flip through, stickers you stick wherever you like. */
export default function NotebookPage() {
  const [items, setItems] = useState<Sticker[] | null>(null);
  const [pages, setPages] = useState<BookPage[]>([]);
  const [decos, setDecos] = useState<BookDeco[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.myStickers(), api.bookPages(), api.decos()])
      .then(([s, p, d]) => {
        setItems(s.items);
        setPages(p.pages);
        setDecos(d.decos);
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

  const addDeco = useCallback((kind: DecoKind, pos: BookPos) => {
    const temp = `tmp-${crypto.randomUUID()}`;
    setDecos((list) => [...list, { id: temp, kind, pos }]);
    api
      .addDeco(kind, pos)
      .then(({ deco }) => setDecos((list) => list.map((d) => (d.id === temp ? deco : d))))
      .catch(() => setDecos((list) => list.filter((d) => d.id !== temp)));
  }, []);

  const moveDeco = useCallback((id: string, pos: BookPos) => {
    setDecos((list) => list.map((d) => (d.id === id ? { ...d, pos } : d)));
    if (!id.startsWith("tmp-")) void api.moveDeco(id, pos).catch(() => undefined);
  }, []);

  const removeDeco = useCallback((id: string) => {
    setDecos((list) => list.filter((d) => d.id !== id));
    if (!id.startsWith("tmp-")) void api.removeDeco(id).catch(() => undefined);
  }, []);

  const open = items?.find((s) => s.id === openId) ?? null;

  return (
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-8">
      <TopBar />
      <div className="mt-5 mb-3 flex items-end justify-between px-1">
        <h1 className="font-hand text-[28px] tracking-wide">手帳</h1>
        {items && items.length > 0 && <span className="text-sm text-ink-mute">{items.length}枚</span>}
      </div>

      {error && <p className="mt-6 text-sm font-bold">{error}</p>}
      {!items && !error && (
        <div className="mt-16 flex justify-center">
          <Michibi mood="side" size={72} animate="bob" />
        </div>
      )}
      {items && items.length === 0 && (
        <div className="mb-4 flex justify-center">
          <Michibi mood="perch" size={64} says={MICHIBI_LINES.collectionEmpty} animate="none" />
        </div>
      )}
      {items && items.length > 0 && <BirdStroll className="-mb-3" />}
      {items && (
        <Notebook
          stickers={items}
          decos={decos}
          pages={pages}
          onOpen={setOpenId}
          onMove={move}
          onPagesChange={changePages}
          onAddDeco={addDeco}
          onMoveDeco={moveDeco}
          onRemoveDeco={removeDeco}
        />
      )}

      <SketchSheet open={!!open} onClose={() => setOpenId(null)} label="シール">
        {open && <StickerDetail key={open.id} sticker={open} onClose={() => setOpenId(null)} onChange={(s) => setItems((list) => list?.map((x) => (x.id === s.id ? s : x)) ?? null)} />}
      </SketchSheet>
    </main>
  );
}
