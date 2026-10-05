"use client";

/* eslint-disable @next/next/no-img-element -- signed / local URLs */
import { useState } from "react";

import { api, ApiClientError } from "@/lib/api-client";
import { useSearch } from "@/lib/store/search-context";
import type { Sticker } from "@/lib/types";
import { SketchButton, SketchLinkButton, SketchTextarea, Tape } from "./sketch";
import { SendAnimation } from "./SendAnimation";
import { StickerView } from "./StickerView";
import { Wrap } from "@/components/Wrap";
import { LABEL_MAX } from "@/lib/config";

function date(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** Everything about one sticker, plus what you can do with it. */
export function StickerDetail({
  sticker,
  onChange,
  onClose,
  onPeel,
}: {
  sticker: Sticker;
  onChange: (s: Sticker) => void;
  onClose?: () => void;
  /** Opened from a page of the notebook: peel this copy off (it stays in the box). */
  onPeel?: () => void;
}) {
  const { currentLocation, refreshUnread } = useSearch();
  const [memo, setMemo] = useState(sticker.memo);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [sending, setSending] = useState<{ delivered: boolean } | null>(null);
  const [label, setLabel] = useState(sticker.label);
  const mine = sticker.origin === "found";
  const inHand = mine && sticker.status === "kept";

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const res = await api.send(sticker.id);
      onChange(res.sticker);
      refreshUnread();
      setSending({ delivered: res.delivered });
    } catch (err) {
      setNote(err instanceof ApiClientError ? err.message : "送れなかった。");
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<Sticker>, done: string) {
    setBusy(true);
    setNote(null);
    try {
      onChange(await fn());
      setNote(done);
      refreshUnread();
    } catch (err) {
      setNote(err instanceof ApiClientError ? err.message : "うまくいかなかった。");
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
      {mine ? (
        <input
          aria-label="シールの名前"
          value={label}
          maxLength={LABEL_MAX}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const next = label.trim();
            if (!next) return setLabel(sticker.label);
            if (next !== sticker.label) void run(async () => (await api.rename(sticker.id, next)).sticker, "名前、変えたよ。次からこの名前で呼ぶね。");
          }}
          className="mx-auto mt-4 block w-full bg-transparent text-center font-hand text-[22px] outline-none focus:underline focus:decoration-butter focus:decoration-4"
        />
      ) : (
        <h2 className="mt-4 text-center font-hand text-[22px]"><Wrap>{sticker.label}</Wrap></h2>
      )}
      <p className="mt-1 text-center text-sm text-ink-soft">
        {date(sticker.createdAt)}・{mine ? "自分で見つけた" : "知らない誰かから届いた"}
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="font-bold">生まれた場所</dt>
          <dd className="mt-0.5">
            <Wrap>{sticker.spotCopy?.replace(/\n/g, "") ?? "なんか気になる。"}</Wrap>
          </dd>
          {mine && sticker.spotName && (
            <dd className="text-ink-soft">
              <Wrap>{sticker.spotName}</Wrap>
            </dd>
          )}
        </div>
        {mine ? (
          <div>
            <dt className="font-bold">メモ</dt>
            <dd className="mt-1">
              <SketchTextarea rows={2} maxLength={80} value={memo} placeholder="気になったところ" onChange={(e) => setMemo(e.target.value)} onBlur={() => memo !== sticker.memo && void run(async () => (await api.memo(sticker.id, memo)).sticker, "メモ、残したよ。")} />
            </dd>
          </div>
        ) : (
          sticker.memo && (
            <div>
              <dt className="font-bold">見つけた人のメモ</dt>
              <dd className="mt-0.5 font-hand text-base"><Wrap>{`「${sticker.memo}」`}</Wrap></dd>
            </div>
          )
        )}
      </dl>

      {sticker.photoUrl && (
        <div className="mt-4">
          <SketchButton variant="plain" size="sm" onClick={() => setShowPhoto((v) => !v)} aria-expanded={showPhoto}>
            {showPhoto ? "元の写真をしまう" : "元の写真"}
          </SketchButton>
          {showPhoto && <img src={sticker.photoUrl} alt="元の写真" className="mt-2 w-full rounded-[14px_18px_12px_20px]" />}
        </div>
      )}

      {note && <p className="mt-4 text-center text-sm font-bold" role="status">{note}</p>}

      <div className="mt-6 flex flex-col items-center gap-3">
        {inHand && (
          <SketchButton size="lg" block disabled={busy} onClick={() => void send()}>
            誰かに送る
            <img src="/ui/i-send.png" alt="" className="h-5 w-auto" />
          </SketchButton>
        )}
        {onPeel && (
          <SketchButton variant="sub" block onClick={onPeel}>
            このページからはがす
          </SketchButton>
        )}
        <SketchLinkButton href={`/spot/${encodeURIComponent(sticker.spotId)}`} variant={mine ? "sub" : "primary"} block>
          生まれた場所を見る
        </SketchLinkButton>
        {inHand && (
          <SketchButton variant="plain" size="sm" disabled={busy} onClick={() => void run(async () => (await api.place(sticker.id, currentLocation)).sticker, "置いてきた。")}>
            生まれた場所に置いていく
          </SketchButton>
        )}
      </div>

      {sending && (
        <SendAnimation
          sticker={sticker}
          delivered={sending.delivered}
          onClose={() => {
            setSending(null);
            onClose?.();
          }}
        />
      )}
    </div>
  );
}
