"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn icon sprites */
import Link from "next/link";
import { useEffect, useState } from "react";

import { Michibi } from "@/components/Michibi";
import { SketchSection } from "@/components/sketch";
import { StickerGrid } from "@/components/StickerGrid";
import { api, ApiClientError } from "@/lib/api-client";
import type { MyHistory } from "@/lib/types";

type Tab = "saved" | "visited" | "placed" | "sent" | "received";
const TABS: { value: Tab; label: string; icon: string; note: string }[] = [
  { value: "saved", label: "気になる", icon: "/ui/i-star.png", note: "星をつけたスポット" },
  { value: "visited", label: "行った", icon: "/ui/n-map.png", note: "着いたスポット" },
  { value: "placed", label: "置いた", icon: "/ui/i-bookmark.png", note: "スポットに置いてきたシール" },
  { value: "sent", label: "送った", icon: "/ui/i-send.png", note: "誰かに送ったシール" },
  { value: "received", label: "届いた", icon: "/ui/i-mail.png", note: "誰かから届いたシール" },
];

export default function MyPage() {
  const [data, setData] = useState<MyHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("saved");

  useEffect(() => {
    api
      .history()
      .then(setData)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込めませんでした"));
  }, []);

  const list = data && tab !== "visited" && tab !== "saved" ? data[tab] : [];

  return (
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        <h1 className="font-hand text-[26px]">マイページ</h1>
        <Link href="/guide" className="ml-auto flex flex-col items-center gap-0.5 text-[12px] transition-transform active:translate-y-0.5">
          <img src="/ui/n-compass.png" alt="" className="h-9 w-auto" draggable={false} />
          <span className="relative isolate px-1">
            <img src="/ui/marker-yellow.png" alt="" aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2 w-full" />
            つかいかた
          </span>
        </Link>
      </header>

      <div role="tablist" aria-label="マイページの一覧" className="mt-4 grid grid-cols-5 gap-1.5">
        {TABS.map((t) => {
          const active = tab === t.value;
          const count = data ? data[t.value].length : null;
          return (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={`flex flex-col items-center gap-0.5 rounded-[12px_15px_11px_14px] px-0.5 pt-2 pb-1.5 transition-transform active:translate-y-0.5 ${
                active ? "bg-butter shadow-[0_2px_6px_-3px_rgb(60_50_30/0.4)]" : "bg-card"
              }`}
            >
              <img src={t.icon} alt="" className={`h-6 w-auto ${active ? "" : "opacity-60"}`} draggable={false} />
              <span className={`text-[14px] leading-tight whitespace-nowrap ${active ? "font-bold" : "text-ink-soft"}`}>{t.label}</span>
              <span className="text-[14px] leading-tight text-ink-mute tabular-nums">{count ?? "–"}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[14px] text-ink-soft">{TABS.find((t) => t.value === tab)?.note}</p>

      {error && <p className="mt-6 text-sm font-bold">{error}</p>}
      {!data && !error && (
        <div className="mt-16 flex justify-center">
          <Michibi mood="side" size={72} animate="bob" />
        </div>
      )}

      {data && tab === "visited" && (
        <ul className="mt-4 flex flex-col gap-3">
          {data.visited.length === 0 && <p className="text-sm text-ink-soft">まだどこにも行っていません。</p>}
          {data.visited.map((v) => (
            <li key={v.spotId}>
              <Link href={`/spot/${encodeURIComponent(v.spotId)}`} className="block">
                <SketchSection tone="white" seed={`visited-${v.spotId}`}>
                  <p className="font-bold">{v.name}</p>
                  {v.copy && <p className="mt-0.5 text-sm text-ink-soft">{v.copy}</p>}
                </SketchSection>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && tab === "saved" && (
        <ul className="mt-4 flex flex-col gap-3">
          {data.saved.length === 0 && <p className="text-sm text-ink-soft">スポットの星を押すと、ここに集まります。</p>}
          {data.saved.map((v) => (
            <li key={v.spotId}>
              <Link href={`/spot/${encodeURIComponent(v.spotId)}`} className="block">
                <SketchSection tone="white" seed={`saved-${v.spotId}`}>
                  <div className="flex items-center gap-3">
                    <img src="/ui/i-star.png" alt="" className="h-5 w-auto shrink-0" draggable={false} />
                    <div className="min-w-0">
                      <p className="font-bold">{v.copy ?? "なんか気になる。"}</p>
                      <p className="mt-0.5 text-sm text-ink-soft">{v.name ?? "まだ行っていない場所"}</p>
                    </div>
                  </div>
                </SketchSection>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && tab !== "visited" && tab !== "saved" && (
        <div className="mt-6">
          {list.length === 0 ? <p className="text-sm text-ink-soft">まだありません。</p> : <StickerGrid items={list} />}
        </div>
      )}
    </main>
  );
}
