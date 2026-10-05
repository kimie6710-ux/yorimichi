"use client";

/* eslint-disable @next/next/no-img-element -- local bird sprite */
import { useEffect, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard, SketchLinkButton, SketchModal } from "@/components/sketch";
import { StickerView } from "@/components/StickerView";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES, michibiSrc } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";
import type { InboxItem } from "@/lib/types";
import { Wrap } from "@/components/Wrap";

export default function InboxPage() {
  const { refreshUnread } = useSearch();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<InboxItem | null>(null);

  useEffect(() => {
    api
      .inbox()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込めなかった。"));
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
    // One screen: only the list scrolls inside.
    <main className="paper flex h-[calc(100dvh-76px-env(safe-area-inset-bottom))] flex-col overflow-hidden px-4 pt-[max(12px,env(safe-area-inset-top))]">
      <header className="flex shrink-0 items-center gap-3">
        <BackButton fallback="/me" />
        <h1 className="font-hand text-[28px]">届いた</h1>
      </header>

      {error && <p className="mt-6 text-sm font-bold">{error}</p>}
      {items && items.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <Michibi mood="sleepy" size={96} says={MICHIBI_LINES.inboxEmpty} above animate="none" />
          <p className="mt-4 max-w-[260px] text-sm text-ink-soft">シールを送ると、誰かの発見がひとつ返ってくる。</p>
        </div>
      )}

      <ul className="hide-scrollbar -mx-4 mt-5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {items?.map((it) => (
          <li key={it.id}>
            <SketchCard as="div" tone={it.openedAt ? "white" : "butter"} pad="md" seed={`inbox-${it.id}`} tape="auto">
              <button type="button" onClick={() => void open(it)} className="flex w-full items-center gap-4 text-left">
                <span className="w-16 shrink-0">
                  {it.openedAt ? (
                    <StickerView src={it.sticker.imageUrl} alt="" rotation={it.sticker.rotation} />
                  ) : (
                    // Not opened yet: みちび holds it.
                    <img src={michibiSrc("flap", "sm")} alt="" className="h-16 w-16" draggable={false} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{it.openedAt ? <Wrap>{it.sticker.label}</Wrap> : "小さな発見が届いてる"}</span>
                  <span className="block text-sm text-ink-soft">{it.kind === "return" ? "送ったお返し" : "知らない誰かから"}</span>
                </span>
              </button>
            </SketchCard>
          </li>
        ))}
      </ul>

      <SketchModal open={!!openItem} onClose={() => setOpenItem(null)} label="届いたシール">
        {openItem && (
          <div className="flex flex-col items-center pb-4 text-center">
            <p className="text-base font-bold">知らない誰かから、小さな発見が届いたよ。</p>
            <div className="mt-3 w-[44%] animate-[stick_0.5s_cubic-bezier(0.2,0.9,0.3,1.2)_both]" style={{ ["--r" as string]: `${openItem.sticker.rotation}deg` }}>
              <StickerView src={openItem.sticker.imageUrl} alt={openItem.sticker.label} lift />
            </div>
            <p className="mt-3 text-lg font-bold"><Wrap>{openItem.sticker.label}</Wrap></p>
            {openItem.sticker.memo && <p className="mt-1 font-hand text-base"><Wrap>{`「${openItem.sticker.memo}」`}</Wrap></p>}
            {openItem.sticker.spotCopy && <p className="mt-3 text-sm text-ink-soft">生まれた場所：<Wrap>{openItem.sticker.spotCopy.replace(/\n/g, "")}</Wrap></p>}
            <div className="mt-4 flex w-full flex-col gap-2">
              <SketchLinkButton href={`/spot/${encodeURIComponent(openItem.sticker.spotId)}`} block>
                このシールが生まれた場所を見る
              </SketchLinkButton>
              <SketchButton variant="plain" size="sm" onClick={() => setOpenItem(null)}>
                ボックスにしまう
              </SketchButton>
            </div>
          </div>
        )}
      </SketchModal>
    </main>
  );
}
