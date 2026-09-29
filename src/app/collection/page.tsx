"use client";

/* eslint-disable @next/next/no-img-element -- original photo is a blob/signed URL */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BottomSheet } from "@/components/BottomSheet";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { Michibi } from "@/components/Michibi";
import { MessageView } from "@/components/StateViews";
import { StickerView } from "@/components/StickerView";
import { MICHIBI_LINES } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";
import { listStickers } from "@/lib/store/sticker-repo";
import { REACTIONS, type StickerItem } from "@/lib/types";

type View = "book" | "map";

const reactionOf = (item: StickerItem) => REACTIONS.find((r) => r.value === item.reaction) ?? null;

/** Deterministic 0–1 "randomness" per sticker, so the layout doesn't jump. */
function jitter(id: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

export default function StickerBookPage() {
  const { currentLocation } = useSearch();
  const [items, setItems] = useState<StickerItem[] | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [view, setView] = useState<View>("book");
  const [openId, setOpenId] = useState<string | null>(null);
  const hasLocation = currentLocation !== null;

  useEffect(() => {
    let alive = true;
    listStickers(currentLocation)
      .then(({ items: list, cloudError: err }) => {
        if (!alive) return;
        setItems(list);
        setCloudError(err);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
    // Re-read once when the real location arrives (demo seeds are placed around it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation]);

  const open = items?.find((i) => i.id === openId) ?? null;

  if (items === null) {
    return (
      <main className="sticker-sheet flex h-[calc(100dvh-76px)] items-center justify-center" role="status">
        <Michibi mood="peek" size={96} says="シール帳をめくってる…" className="flex-col !items-center" />
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="h-[calc(100dvh-76px)]">
        <MessageView
          mood="sleepy"
          says={MICHIBI_LINES.collectionEmpty}
          detail="行ってみた場所で写真を撮ると、写っているものが切り抜かれて、ここにシールとして貼られます。"
          action={{ label: "寄り道を探す", href: "/" }}
        />
      </main>
    );
  }

  return (
    <main
      className={
        view === "map"
          ? "relative h-[calc(100dvh-76px-env(safe-area-inset-bottom))]"
          : "sticker-sheet min-h-[calc(100dvh-76px)]"
      }
    >
      <div
        className={`${view === "map" ? "pointer-events-none absolute inset-x-0 top-0 z-10" : ""} px-5 pt-[max(16px,env(safe-area-inset-top))]`}
      >
        <div className="pointer-events-auto flex items-center justify-between gap-3">
          <div className={view === "map" ? "rounded-2xl bg-white/90 px-3 py-1 shadow-soft" : ""}>
            <h1 className="text-2xl font-bold whitespace-nowrap">シール帳</h1>
            <p className="text-sm text-ink-soft">街のかけら {items.length}枚</p>
          </div>
          <div className="flex shrink-0 rounded-full bg-white p-1 shadow-soft" role="tablist" aria-label="表示の切り替え">
            {(
              [
                { v: "book", label: "シール帳" },
                { v: "map", label: "地図" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                role="tab"
                aria-selected={view === o.v}
                onClick={() => setView(o.v)}
                className={`rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                  view === o.v ? "bg-mint/40 text-ink" : "text-ink-soft"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {cloudError && (
          <p className="pointer-events-auto mt-3 rounded-2xl bg-star px-4 py-2 text-sm font-bold" role="status">
            クラウドのシール帳を読み込めませんでした（{cloudError}）。この端末の分だけ表示しています。
          </p>
        )}
      </div>

      {view === "book" ? (
        <StickerBook items={items} onOpen={setOpenId} />
      ) : (
        <StickerMap items={items} onOpen={setOpenId} />
      )}

      <BottomSheet open={open !== null} onClose={() => setOpenId(null)} label="シールの詳細">
        {open && <StickerDetail item={open} />}
      </BottomSheet>
    </main>
  );
}

/**
 * Stickers stuck loosely on the backing sheet — no cards, no captions.
 * Each sticker gets its own size, tilt and offset; tap one for its story.
 */
function StickerBook({ items, onOpen }: { items: StickerItem[]; onOpen: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-3 px-3 pt-6 pb-20">
      {items.map((item, i) => {
        const size = 78 + Math.round(jitter(item.id, 1) * 22); // 78–100% of the cell
        const shiftX = Math.round((jitter(item.id, 2) - 0.5) * 14);
        const shiftY = Math.round((jitter(item.id, 3) - 0.5) * 18) + (i % 3 === 1 ? 14 : 0);
        return (
          <li key={item.id} className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="flex w-full justify-center active:scale-[0.96]"
              style={{ transform: `translate(${shiftX}px, ${shiftY}px)` }}
              aria-label={`${item.aiTitle}（${item.realName}）のシール`}
            >
              <span
                className="block animate-[stick_0.5s_cubic-bezier(0.2,0.9,0.3,1.2)_both]"
                style={{ width: `${size}%`, animationDelay: `${Math.min(i, 12) * 40}ms` }}
              >
                <StickerView src={item.stickerUrl} alt="" rotation={item.rotation} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 採集マップ: your own stickers stuck where you collected them. */
function StickerMap({ items, onOpen }: { items: StickerItem[]; onOpen: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markers: MapMarker[] = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        position: { latitude: item.latitude, longitude: item.longitude },
        label: item.aiTitle,
        tone: "collected" as const,
        thumbUrl: item.stickerUrl,
        rotation: item.rotation,
      })),
    [items],
  );

  return (
    <div className="absolute inset-0">
      <MapView
        origin={null}
        markers={markers}
        selectedId={selectedId}
        onSelect={(id) => (id === selectedId ? onOpen(id) : setSelectedId(id))}
        bottomInset={40}
        className="h-full w-full"
      />
      {selectedId && (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-ink-soft">
          もう一度タップでくわしく
        </p>
      )}
    </div>
  );
}

function StickerDetail({ item }: { item: StickerItem }) {
  const r = reactionOf(item);
  const [showPhoto, setShowPhoto] = useState(false);
  return (
    <div className="px-6 pb-8">
      <div className="sticker-sheet -mx-6 flex justify-center px-6 py-8">
        <div className="w-[62%]">
          <StickerView src={item.stickerUrl} alt={`${item.aiTitle}のシール`} rotation={item.rotation} lift />
        </div>
      </div>
      <p className="mt-5 text-xl font-bold">{item.aiTitle}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="場所" value={item.realName} strong />
        {item.address && <Row label="住所" value={item.address} />}
        <Row label="採集した日" value={new Date(item.createdAt).toLocaleDateString("ja-JP")} />
        {item.query && <Row label="きっかけ" value={`「${item.query}」`} />}
        {r && <Row label="実際は" value={`${r.emoji} ${r.label}`} />}
      </dl>
      {item.photoUrl && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowPhoto((v) => !v)}
            className="btn-secondary h-10 px-4 text-sm"
            aria-expanded={showPhoto}
          >
            {showPhoto ? "元の写真をしまう" : "元の写真を見る"}
          </button>
          {showPhoto && (
            <img src={item.photoUrl} alt="シールを切り抜いた元の写真" className="mt-3 w-full rounded-2xl" />
          )}
        </div>
      )}
      {!item.placeId.startsWith("mock_") && (
        <Link
          href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}&query_place_id=${encodeURIComponent(item.placeId)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm font-bold text-lavender-deep underline underline-offset-4"
        >
          Google マップで場所を見る
        </Link>
      )}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-ink-mute">{label}</dt>
      <dd className={strong ? "font-bold" : "text-ink-soft"}>{value}</dd>
    </div>
  );
}
