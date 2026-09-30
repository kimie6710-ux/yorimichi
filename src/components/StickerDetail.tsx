"use client";

/* eslint-disable @next/next/no-img-element -- signed / local URLs */
import { useState } from "react";

import { api, ApiClientError } from "@/lib/api-client";
import { useSearch } from "@/lib/store/search-context";
import type { Sticker } from "@/lib/types";
import { SketchButton, SketchLinkButton, SketchTextarea } from "./sketch";
import { StickerView } from "./StickerView";

const STATUS: Record<Sticker["status"], string> = { kept: "手もと", placed: "置いてきた", sent: "送り出した" };

function date(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** Everything about one sticker, plus what you can do with it. */
export function StickerDetail({ sticker, onChange }: { sticker: Sticker; onChange: (s: Sticker) => void }) {
  const { currentLocation, refreshUnread } = useSearch();
  const [memo, setMemo] = useState(sticker.memo);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const mine = sticker.origin === "found";

  async function run(fn: () => Promise<Sticker>, done: string) {
    setBusy(true);
    setNote(null);
    try {
      onChange(await fn());
      setNote(done);
      refreshUnread();
    } catch (err) {
      setNote(err instanceof ApiClientError ? err.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pb-4">
      <div className="mx-auto w-[58%] pt-2">
        <StickerView src={sticker.imageUrl} alt={sticker.label} rotation={sticker.rotation} lift />
      </div>
      <h2 className="mt-4 text-center text-xl font-bold">{sticker.label}</h2>
      <p className="mt-1 text-center text-sm text-ink-soft">
        {date(sticker.createdAt)}・{mine ? "自分で見つけた" : "知らない誰かから届いた"}・{STATUS[sticker.status]}
        {sticker.status === "placed" && sticker.seenCount > 0 && `（${sticker.seenCount}人が見た）`}
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="font-bold">生まれた場所</dt>
          <dd className="mt-0.5">{sticker.spotCopy ?? "ここ、なんか気になる。"}</dd>
          {mine && sticker.spotName && <dd className="text-ink-soft">{sticker.spotName}</dd>}
        </div>
        {mine ? (
          <div>
            <dt className="font-bold">メモ</dt>
            <dd className="mt-1">
              <SketchTextarea rows={2} maxLength={80} value={memo} placeholder="気になったところ" onChange={(e) => setMemo(e.target.value)} onBlur={() => memo !== sticker.memo && void run(async () => (await api.memo(sticker.id, memo)).sticker, "メモを残しました。")} />
            </dd>
          </div>
        ) : (
          sticker.memo && (
            <div>
              <dt className="font-bold">見つけた人のメモ</dt>
              <dd className="mt-0.5 font-hand text-base">「{sticker.memo}」</dd>
            </div>
          )
        )}
      </dl>

      {sticker.photoUrl && (
        <div className="mt-4">
          <SketchButton variant="plain" size="sm" onClick={() => setShowPhoto((v) => !v)} aria-expanded={showPhoto}>
            {showPhoto ? "元の写真をしまう" : "元の写真"}
          </SketchButton>
          {showPhoto && <img src={sticker.photoUrl} alt="元の写真" className="mt-2 w-full rounded-[14px_18px_12px_20px] outline-2 outline-ink outline-solid" />}
        </div>
      )}

      {note && <p className="mt-4 text-center text-sm font-bold" role="status">{note}</p>}

      <div className="mt-5 flex flex-col gap-3">
        <SketchLinkButton href={`/spot/${encodeURIComponent(sticker.spotId)}`} variant={mine ? "sub" : "primary"} block>
          このシールが生まれた場所を見る
        </SketchLinkButton>
        {mine && sticker.status === "kept" && (
          <div className="grid grid-cols-2 gap-3">
            <SketchButton variant="plain" size="sm" disabled={busy} onClick={() => void run(async () => (await api.place(sticker.id, currentLocation)).sticker, "置いてきました。")}>
              ここに置く
            </SketchButton>
            <SketchButton variant="plain" size="sm" disabled={busy} onClick={() => void run(async () => (await api.send(sticker.id)).sticker, "どこかの誰かに届けました。")}>
              送り出す
            </SketchButton>
          </div>
        )}
      </div>
    </div>
  );
}
