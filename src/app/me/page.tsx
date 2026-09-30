"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Michibi } from "@/components/Michibi";
import { SketchSection, SketchTabs } from "@/components/sketch";
import { StickerGrid } from "@/components/StickerGrid";
import { api, ApiClientError } from "@/lib/api-client";
import type { MyHistory } from "@/lib/types";

type Tab = "visited" | "placed" | "sent" | "received";
const TABS: { value: Tab; label: string }[] = [
  { value: "visited", label: "行った場所" },
  { value: "placed", label: "残した" },
  { value: "sent", label: "送った" },
  { value: "received", label: "届いた" },
];

export default function MyPage() {
  const [data, setData] = useState<MyHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("visited");

  useEffect(() => {
    api
      .history()
      .then(setData)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込めませんでした"));
  }, []);

  const list = data && tab !== "visited" ? data[tab] : [];

  return (
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center gap-3">
        <BackButton />
        <h1 className="font-hand text-[26px]">マイページ</h1>
      </header>

      {data && (
        <p className="mt-4 text-sm text-ink-soft">
          行った場所 {data.visited.length}・残した {data.placed.length}・送った {data.sent.length}・届いた {data.received.length}
        </p>
      )}
      <SketchTabs className="mt-3 flex-wrap" value={tab} onChange={setTab} items={TABS} />

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
      {data && tab !== "visited" && (
        <div className="mt-6">
          {list.length === 0 ? <p className="text-sm text-ink-soft">まだありません。</p> : <StickerGrid items={list} />}
        </div>
      )}
    </main>
  );
}
