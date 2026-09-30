"use client";

/* eslint-disable @next/next/no-img-element -- signed / local URLs */
import { useState } from "react";

import { api, ApiClientError } from "@/lib/api-client";
import { useSearch } from "@/lib/store/search-context";
import type { Sticker } from "@/lib/types";
import { SketchButton, SketchLinkButton, SketchTextarea, Tape } from "./sketch";
import { SendAnimation } from "./SendAnimation";
import { StickerView } from "./StickerView";

function date(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** Everything about one sticker, plus what you can do with it. */
export function StickerDetail({ sticker, onChange, onClose }: { sticker: Sticker; onChange: (s: Sticker) => void; onClose?: () => void }) {
  const { currentLocation, refreshUnread } = useSearch();
  const [memo, setMemo] = useState(sticker.memo);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [sending, setSending] = useState(false);
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
      <div className="relative mx-auto w-[58%] pt-2">
        <Tape seed={sticker.id} corner="left" />
        <Tape seed={`${sticker.id}-r`} corner="right" />
        <StickerView src={sticker.imageUrl} alt={sticker.label} rotation={sticker.rotation} lift />
      </div>
      <h2 className="mt-4 text-center font-hand text-[24px]">{sticker.label}</h2>
      <p className="mt-1 text-center text-sm text-ink-soft">
        {date(sticker.createdAt)}・{mine ? "自分で見つけた" : "知らない誰かから届いた"}
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

      <div className="mt-6 flex flex-col items-center gap-3">
        {mine && (
          <SketchButton size="lg" block onClick={() => setSending(true)}>
            誰かに送る
            <img src="/ui/i-send.png" alt="" className="h-5 w-auto" />
          </SketchButton>
        )}
        <SketchLinkButton href={`/spot/${encodeURIComponent(sticker.spotId)}`} variant={mine ? "sub" : "primary"} block>
          生まれた場所を見る
        </SketchLinkButton>
        {mine && sticker.status === "kept" && (
          <SketchButton variant="plain" size="sm" disabled={busy} onClick={() => void run(async () => (await api.place(sticker.id, currentLocation)).sticker, "置いてきました。")}>
            ここに置く
          </SketchButton>
        )}
      </div>

      {sending && (
        <SendAnimation
          sticker={sticker}
          onClose={() => {
            setSending(false);
            onClose?.();
          }}
        />
      )}
    </div>
  );
}
