"use client";

import { useEffect, useMemo, useState } from "react";

import { Michibi } from "@/components/Michibi";
import { SketchSection, SketchSheet, SketchTabs } from "@/components/sketch";
import { StickerDetail } from "@/components/StickerDetail";
import { StickerGrid } from "@/components/StickerGrid";
import { TopBar } from "@/components/TopBar";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import type { Sticker } from "@/lib/types";

type View = "all" | "spot";

const MARK: Record<string, string> = { placed: "置いた", sent: "送った", received: "届いた" };

export default function StickerBookPage() {
  const [items, setItems] = useState<Sticker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api
      .myStickers()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込めませんでした"));
  }, []);

  const bySpot = useMemo(() => {
    const groups = new Map<string, Sticker[]>();
    for (const s of items ?? []) groups.set(s.spotId, [...(groups.get(s.spotId) ?? []), s]);
    return [...groups.values()];
  }, [items]);

  const open = items?.find((s) => s.id === openId) ?? null;
  const caption = (id: string) => {
    const s = items?.find((x) => x.id === id);
    const mark = s ? (s.origin === "received" ? MARK.received : MARK[s.status]) : undefined;
    return mark ? <span className="text-[12px] text-ink-mute">{mark}</span> : null;
  };

  return (
    <main className="sticker-sheet min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10">
      <TopBar />
      <div className="mt-5 flex items-end justify-between">
        <h1 className="font-hand text-2xl font-bold">シール帳</h1>
        {items && <span className="text-sm text-ink-soft">{items.length}枚</span>}
      </div>

      {items && items.length > 0 && (
        <SketchTabs
          className="mt-3"
          value={view}
          onChange={setView}
          items={[
            { value: "all", label: "ぜんぶ" },
            { value: "spot", label: "場所ごと" },
          ]}
        />
      )}

      {error && <p className="mt-6 text-sm font-bold">{error}</p>}
      {!items && !error && (
        <div className="mt-16 flex justify-center">
          <Michibi mood="side" size={72} animate="bob" />
        </div>
      )}
      {items && items.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center">
          <Michibi mood="perch" size={96} says={MICHIBI_LINES.collectionEmpty} className="flex-col-reverse !items-center" animate="none" />
          <p className="mt-4 max-w-[260px] text-sm text-ink-soft">スポットで見つけたものを撮ると、ここに貼られていきます。</p>
        </div>
      )}

      {items && items.length > 0 && view === "all" && (
        <div className="mt-6">
          <StickerGrid items={items} onPick={setOpenId} caption={caption} />
        </div>
      )}
      {items && view === "spot" && (
        <div className="mt-5 flex flex-col gap-4">
          {bySpot.map((group) => (
            <SketchSection key={group[0].spotId} title={group[0].spotCopy ?? "ここ、なんか気になる。"} tone="white" seed={`group-${group[0].spotId}`}>
              <StickerGrid items={group} onPick={setOpenId} caption={caption} />
            </SketchSection>
          ))}
        </div>
      )}

      <SketchSheet open={!!open} onClose={() => setOpenId(null)} label="シール">
        {open && <StickerDetail key={open.id} sticker={open} onChange={(s) => setItems((list) => list?.map((x) => (x.id === s.id ? s : x)) ?? null)} />}
      </SketchSheet>
    </main>
  );
}
