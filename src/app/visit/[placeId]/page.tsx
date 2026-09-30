"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs */
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import { BackButton } from "@/components/BackButton";
import { GuideView } from "@/components/GuideView";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard, SketchInput, SketchLinkButton, SketchSection, SketchTextarea } from "@/components/sketch";
import { MessageView } from "@/components/StateViews";
import { StickerGrid } from "@/components/StickerGrid";
import { StickerView } from "@/components/StickerView";
import { SpotReveal } from "@/components/SpotReveal";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import { findThings, prepareCutter, warmUpCutter, type CutMask, type StickerCutter } from "@/lib/sticker/cutter";
import { canvasToBlob, downscaleToJpeg, loadBitmap, randomRotation, stickerFromMask, thumbForNaming, toCanvas } from "@/lib/sticker/render";
import { useSearch } from "@/lib/store/search-context";
import type { SpotDetail, Sticker } from "@/lib/types";

type Step = "go" | "explore" | "looking" | "pick" | "make" | "share" | "done";
type Outcome = "kept" | "placed" | "sent";

/** A thing cut out of the photo, waiting to be chosen. */
interface Cutout {
  id: string;
  label: string;
  blob: Blob;
  url: string;
  rotation: number;
}
const MAX_CUTOUTS = 7;

export default function VisitPage() {
  return (
    <Suspense>
      <Visit />
    </Suspense>
  );
}

function Visit() {
  const { placeId: raw } = useParams<{ placeId: string }>();
  const spotId = decodeURIComponent(raw);
  const router = useRouter();
  const params = useSearchParams();
  const { currentLocation, patchSpot, refreshUnread } = useSearch();

  const [detail, setDetail] = useState<SpotDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(params.get("step") === "explore" ? "explore" : "go");
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);

  // Capture workspace
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [cutouts, setCutouts] = useState<Cutout[]>([]);
  const [cutting, setCutting] = useState(false);
  const [sticker, setSticker] = useState<{ blob: Blob; url: string; rotation: number } | null>(null);
  const [label, setLabel] = useState("");
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState<Sticker | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const work = useRef<HTMLCanvasElement | null>(null);
  const cutter = useRef<Promise<StickerCutter> | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  const track = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };
  useEffect(() => {
    const list = urls.current;
    return () => list.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const load = useCallback(
    () =>
      api
        .spot(spotId, currentLocation)
        .then(setDetail)
        .catch((e) => setLoadError(e instanceof ApiClientError ? e.message : "読み込めませんでした")),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on arrival only, not on every GPS tick
    [spotId],
  );
  useEffect(() => {
    void load();
    warmUpCutter();
  }, [load]);

  const recorded = useRef(false);
  async function arrive() {
    recorded.current = true;
    setStep("explore");
    await api.visit(spotId, currentLocation).catch(() => undefined);
    patchSpot(spotId, { visited: true });
    await load();
  }

  // Coming straight to explore (from the spot page / ＋ tab) also counts as a visit.
  useEffect(() => {
    if (step === "explore" && detail && !detail.spot.visited && !recorded.current) {
      recorded.current = true;
      void api.visit(spotId, currentLocation).then(load).catch(() => undefined);
      patchSpot(spotId, { visited: true });
    }
  }, [step, detail, spotId, currentLocation, load, patchSpot]);

  async function toCutout(mask: CutMask, label: string | null): Promise<Cutout | null> {
    if (!work.current) return null;
    const canvas = stickerFromMask(work.current, mask);
    if (!canvas) return null;
    const blob = await canvasToBlob(canvas);
    return { id: crypto.randomUUID(), label: label ?? "見つけたもの", blob, url: track(blob), rotation: randomRotation() };
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCutouts([]);
    setSticker(null);
    setStep("looking");
    try {
      const bitmap = await loadBitmap(file);
      const photo = await downscaleToJpeg(bitmap);
      setPhotoBlob(photo);
      setPhotoUrl(track(photo));
      work.current = toCanvas(bitmap, 1024);
      cutter.current = prepareCutter(work.current);
      // The segmenter finds real shapes; then the AI looks at each and names it.
      const masks = await findThings(await cutter.current, MAX_CUTOUTS - 1);
      let made = (await Promise.all(masks.map((m) => toCutout(m, null)))).filter((c): c is Cutout => !!c);
      if (made.length > 0) {
        try {
          const thumbs = await Promise.all(made.map((c) => thumbForNaming(c.blob)));
          const { names } = await api.nameCutouts(thumbs, spotId);
          const named = made.map((c, i) => ({ ...c, label: names[i]?.label ?? c.label, keep: names[i]?.keep ?? true }));
          const things = named.filter((c) => c.keep);
          made = things.length > 0 ? things : named;
        } catch (err) {
          console.warn("[name]", err);
        }
      }
      setCutouts(made);
      setStep("pick");
    } catch (err) {
      console.error("[photo]", err);
      setError("写真を読み込めなかった。別の写真でもう一回どうぞ。");
      setStep("explore");
    }
  }

  function choose(c: Cutout) {
    setSticker({ blob: c.blob, url: c.url, rotation: c.rotation });
    setLabel(c.label === "見つけたもの" ? "" : c.label);
    setStep("make");
  }

  async function onPhotoTap(e: MouseEvent<HTMLImageElement>) {
    if (!cutter.current || cutting || cutouts.length >= MAX_CUTOUTS) return;
    const r = e.currentTarget.getBoundingClientRect();
    const point = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    setCutting(true);
    setError(null);
    try {
      const mask = await (await cutter.current).maskAt(point);
      const c = mask ? await toCutout(mask, null) : null;
      if (!c) throw new Error("no mask");
      setCutouts((list) => [...list, c]);
    } catch {
      setError("そこはうまく切り抜けなかった。もう少し真ん中をタップしてみて。");
    } finally {
      setCutting(false);
    }
  }

  async function makeSticker() {
    if (!sticker) return;
    setBusy(true);
    setError(null);
    try {
      const { items } = await api.createStickers({
        spotId,
        memo: memo.trim(),
        photo: photoBlob,
        items: [{ blob: sticker.blob, label: label.trim() || "見つけたもの", rotation: sticker.rotation }],
      });
      setSaved(items[0]);
      setStep("share");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "保存できませんでした。もう一度どうぞ。");
    } finally {
      setBusy(false);
    }
  }

  async function share(kind: Outcome) {
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "placed") await api.place(saved.id, currentLocation);
      if (kind === "sent") await api.send(saved.id);
      setOutcome(kind);
      setStep("done");
      refreshUnread();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="h-[calc(100dvh-76px)]">
        <MessageView mood="sleepy" says={loadError} action={{ label: "マップへ", href: "/" }} />
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="paper flex h-[calc(100dvh-76px)] items-center justify-center">
        <Michibi mood="walk" size={72} animate="wander" />
      </main>
    );
  }

  const { spot } = detail;
  const others = detail.placed.filter((p) => !p.mine);

  if (step === "go") {
    return (
      <main>
        <GuideView spot={spot} onArrive={() => void arrive()} onQuit={() => router.push("/")} />
      </main>
    );
  }

  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
      <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => void onPhoto(e.target.files?.[0])} />
    </>
  );

  return (
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10">
      {fileInputs}
      <header className="flex items-center gap-3">
        <BackButton fallback={`/spot/${encodeURIComponent(spotId)}`} />
        <p className="min-w-0 flex-1 truncate text-base font-bold">{spot.copy?.copy}</p>
      </header>

      {error && (
        <SketchCard tone="butter" pad="sm" seed="error" className="mt-3" role="alert">
          <p className="text-sm font-bold">{error}</p>
        </SketchCard>
      )}

      {/* ───── 探索モード ───── */}
      {step === "explore" && (
        <div className="animate-rise mt-4">
          <p className="text-center font-hand text-xl font-bold">ここでした</p>
          <SketchCard tone="white" pad="md" seed={`reveal-${spotId}`} className="mt-3">
            <SpotReveal place={spot.place} />
          </SketchCard>

          {others.length > 0 && (
            <SketchSection title="誰かが、ここに置いていったもの" className="mt-5" seed={`placed-${spotId}`}>
              <StickerGrid items={others} caption={(sid) => {
                const m = others.find((p) => p.id === sid)?.memo;
                return m ? <span className="mt-0.5 line-clamp-2 font-hand text-sm text-ink-soft">「{m}」</span> : null;
              }} />
              <Michibi mood="side" size={48} animate="none" says={MICHIBI_LINES.somebodyWasHere} className="mt-4" />
            </SketchSection>
          )}
          {detail.foundLabels.length > 0 && (
            <p className="mt-3 px-1 text-sm text-ink-soft">ここで見つかったもの：{detail.foundLabels.join("・")}</p>
          )}

          <div className="mt-8 flex flex-col items-center text-center">
            <button type="button" onClick={() => setNudge((v) => !v)} aria-label="ヒント">
              <Michibi mood={nudge ? "surprise" : "front"} size={84} says={nudge ? MICHIBI_LINES.nudge : MICHIBI_LINES.explore} className="flex-col-reverse !items-center" animate="none" />
            </button>
            <p className="mt-3 text-lg font-bold">{others.length > 0 ? "あなたは、何を見つける？" : "気になったもの、ある？"}</p>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            <SketchButton size="lg" block onClick={() => cameraRef.current?.click()}>
              ここで撮る
            </SketchButton>
            <SketchButton variant="sub" block onClick={() => libraryRef.current?.click()}>
              アルバムから選ぶ
            </SketchButton>
          </div>
        </div>
      )}

      {/* ───── AIが写真の中を見ている ───── */}
      {step === "looking" && (
        <div className="mt-6 flex flex-col items-center text-center" role="status">
          {photoUrl && (
            <div className="relative w-full overflow-hidden rounded-[18px_22px_16px_24px] outline-2 outline-ink outline-solid">
              <img src={photoUrl} alt="" className="block max-h-[52dvh] w-full object-contain opacity-70" />
            </div>
          )}
          <Michibi mood="side" size={64} animate="bob" says="なにが写ってるかな。" className="mt-4" />
        </div>
      )}

      {/* ───── 候補から選ぶ ───── */}
      {step === "pick" && photoUrl && (
        <div className="animate-rise mt-4">
          <p className="text-lg font-bold">{MICHIBI_LINES.choose}</p>
          {cutouts.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-4">
              {cutouts.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => choose(c)} className="flex w-full flex-col items-center text-center transition-transform active:translate-y-0.5">
                    <StickerView src={c.url} alt={c.label} rotation={c.rotation} className="w-[90%]" />
                    <span className="mt-1 line-clamp-2 text-sm font-bold">{c.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">シールにしたいところを、写真の中でタップ。</p>
          )}
          <p className="mt-5 text-sm text-ink-soft">{cutouts.length > 0 ? "ほかのものは、写真の中をタップ。" : ""}</p>
          <div className="relative mt-2 overflow-hidden rounded-[18px_22px_16px_24px] outline-2 outline-ink outline-solid">
            <img src={photoUrl} alt="撮った写真。シールにしたいところをタップ" onClick={(e) => void onPhotoTap(e)} className={`block max-h-[46dvh] w-full object-contain ${cutting ? "cursor-progress" : "cursor-crosshair"}`} />
            {cutting && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/40">
                <Michibi mood="flap" size={64} animate="bob" />
              </div>
            )}
          </div>
          <SketchButton variant="plain" size="sm" className="mt-5" onClick={() => setStep("explore")}>
            撮り直す
          </SketchButton>
        </div>
      )}

      {/* ───── シールができた ───── */}
      {step === "make" && sticker && (
        <div className="animate-rise mt-4">
          <div className="sticker-sheet relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[22px_18px_24px_16px] outline-2 outline-ink outline-solid">
            <div className="w-[68%] animate-[stick_0.45s_cubic-bezier(0.2,0.9,0.3,1.2)_both]" style={{ ["--r" as string]: `${sticker.rotation}deg` }}>
              <StickerView src={sticker.url} alt="できたシール" lift />
            </div>
          </div>
          <Michibi mood="happy" size={56} says={MICHIBI_LINES.made} className="mt-2" animate="none" />
          <label className="mt-4 block text-sm font-bold" htmlFor="sticker-label">
            なまえ
          </label>
          <SketchInput id="sticker-label" className="mt-1" value={label} maxLength={12} placeholder="例：古い照明" onChange={(e) => setLabel(e.target.value)} />
          <label className="mt-4 block text-sm font-bold" htmlFor="sticker-memo">
            ひとことメモ（なくてもいい）
          </label>
          <SketchTextarea id="sticker-memo" className="mt-1" rows={2} value={memo} maxLength={80} placeholder="気になったところ" onChange={(e) => setMemo(e.target.value)} />
          <div className="mt-6 flex flex-col gap-3">
            <SketchButton size="lg" block onClick={() => void makeSticker()} disabled={busy}>
              {busy ? "貼ってる…" : "シールにする"}
            </SketchButton>
            <SketchButton variant="plain" size="sm" onClick={() => setStep("pick")} disabled={busy}>
              ほかのにする
            </SketchButton>
          </div>
        </div>
      )}

      {/* ───── どうする？ ───── */}
      {step === "share" && saved && (
        <div className="animate-rise mt-6 flex flex-col items-center text-center">
          <div className="w-[56%]">
            <StickerView src={saved.imageUrl} alt={saved.label} rotation={saved.rotation} lift />
          </div>
          <p className="mt-3 text-lg font-bold">{saved.label}</p>
          <Michibi mood="perch" size={56} says={MICHIBI_LINES.shareAsk} className="mt-3" animate="none" />
          <div className="mt-6 flex w-full flex-col gap-3">
            <SketchButton size="lg" block onClick={() => void share("placed")} disabled={busy}>
              ここに置いていく
            </SketchButton>
            <SketchButton variant="sub" block onClick={() => void share("sent")} disabled={busy}>
              知らない誰かに送り出す
            </SketchButton>
            <SketchButton variant="plain" block onClick={() => void share("kept")} disabled={busy}>
              手帳に残す
            </SketchButton>
          </div>
          <p className="mt-4 text-sm text-ink-mute">どれを選んでも、手帳には残ります。</p>
        </div>
      )}

      {/* ───── おしまい ───── */}
      {step === "done" && saved && (
        <div className="animate-rise mt-8 flex flex-col items-center text-center">
          <div className="w-[48%]">
            <StickerView src={saved.imageUrl} alt={saved.label} rotation={saved.rotation} />
          </div>
          <Michibi
            mood={outcome === "sent" ? "flap" : outcome === "placed" ? "perch" : "happy"}
            size={80}
            says={outcome === "sent" ? MICHIBI_LINES.sent : outcome === "placed" ? MICHIBI_LINES.placed : "手帳に貼っといた。"}
            className="mt-4 flex-col-reverse !items-center"
            animate="none"
          />
          <div className="mt-8 flex w-full flex-col gap-3">
            <SketchButton size="lg" block onClick={() => { setStep("explore"); setSaved(null); setSticker(null); setMemo(""); void load(); }}>
              もう少し探す
            </SketchButton>
            <SketchLinkButton href="/" variant="sub" block>
              ほかの場所へ
            </SketchLinkButton>
          </div>
        </div>
      )}
    </main>
  );
}
