"use client";

import { useEffect, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard, SketchLinkButton, SketchModal } from "@/components/sketch";
import { StickerView } from "@/components/StickerView";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";
import type { InboxItem } from "@/lib/types";

export default function InboxPage() {
  const { refreshUnread } = useSearch();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<InboxItem | null>(null);

  useEffect(() => {
    api
      .inbox()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込めませんでした"));
  }, []);

  async function open(item: InboxItem) {
    setOpenItem(item);
    if (!item.openedAt) {
      await api.open(item.id).catch(() => undefined);
      setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, openedAt: new Date().toISOString() } : x)) ?? null);
      refreshUnread();
    }
  }

  return (
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        <BackButton />
        <h1 className="font-hand text-[26px]">届いたもの</h1>
      </header>

      {error && <p className="mt-6 text-sm font-bold">{error}</p>}
      {items && items.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <Michibi mood="sleepy" size={96} says={MICHIBI_LINES.inboxEmpty} className="flex-col-reverse !items-center" animate="none" />
          <p className="mt-4 max-w-[260px] text-sm text-ink-soft">シールを送り出すと、誰かの発見がひとつ返ってきます。</p>
        </div>
      )}

      <ul className="mt-5 flex flex-col gap-3">
        {items?.map((it) => (
          <li key={it.id}>
            <SketchCard as="div" tone={it.openedAt ? "white" : "butter"} pad="md" seed={`inbox-${it.id}`}>
              <button type="button" onClick={() => void open(it)} className="flex w-full items-center gap-4 text-left">
                <span className="w-16 shrink-0">
                  {it.openedAt ? (
                    <StickerView src={it.sticker.imageUrl} alt="" rotation={it.sticker.rotation} />
                  ) : (
                    <span className="block h-14 w-16 rounded-[6px_10px_7px_9px] bg-card outline-2 outline-ink outline-solid" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{it.openedAt ? it.sticker.label : "小さな発見が届いています"}</span>
                  <span className="block text-sm text-ink-soft">{it.kind === "return" ? "送り出したお返し" : "知らない誰かから"}</span>
                </span>
              </button>
            </SketchCard>
          </li>
        ))}
      </ul>

      <SketchModal open={!!openItem} onClose={() => setOpenItem(null)} label="届いたシール">
        {openItem && (
          <div className="flex flex-col items-center text-center">
            <p className="text-base font-bold">知らない誰かから、小さな発見が届きました。</p>
            <div className="mt-5 w-[60%] animate-[stick_0.5s_cubic-bezier(0.2,0.9,0.3,1.2)_both]" style={{ ["--r" as string]: `${openItem.sticker.rotation}deg` }}>
              <StickerView src={openItem.sticker.imageUrl} alt={openItem.sticker.label} lift />
            </div>
            <p className="mt-4 text-lg font-bold">{openItem.sticker.label}</p>
            {openItem.sticker.memo && <p className="mt-1 font-hand text-base">「{openItem.sticker.memo}」</p>}
            {openItem.sticker.spotCopy && <p className="mt-3 text-sm text-ink-soft">生まれた場所：{openItem.sticker.spotCopy}</p>}
            <div className="mt-6 flex w-full flex-col gap-3">
              <SketchLinkButton href={`/spot/${encodeURIComponent(openItem.sticker.spotId)}`} block>
                このシールが生まれた場所を見る
              </SketchLinkButton>
              <SketchButton variant="plain" size="sm" onClick={() => setOpenItem(null)}>
                手帳にしまう
              </SketchButton>
            </div>
          </div>
        )}
      </SketchModal>
    </main>
  );
}
