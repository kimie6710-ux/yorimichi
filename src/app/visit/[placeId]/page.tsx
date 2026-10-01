"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs */
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import { BackButton } from "@/components/BackButton";
import { GuideView } from "@/components/GuideView";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchInput, SketchLinkButton, SketchSheet } from "@/components/sketch";
import { MessageView } from "@/components/StateViews";
import { StickerView } from "@/components/StickerView";
import { PlaceImage } from "@/components/PlaceImage";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES, michibiSrc } from "@/lib/character";
import { boxMask, findThings, MIDDLE_BOX, prepareCutter, warmUpCutter, within, type CutMask, type CutPoint, type StickerCutter } from "@/lib/sticker/cutter";
import { canvasToBlob, downscaleToJpeg, loadBitmap, plainFromMask, randomRotation, stickerFromMask, toCanvas } from "@/lib/sticker/render";
import { useSearch } from "@/lib/store/search-context";
import { recognize, remember, UNNAMED, warmUpVision, type Guess } from "@/lib/vision/recognize";
import type { SpotDetail, Sticker } from "@/lib/types";

type Step = "go" | "explore" | "looking" | "pick" | "making" | "make" | "share" | "done";
type Outcome = "kept" | "placed" | "sent";

/** A thing cut out of the photo, waiting to be chosen. */
interface Cutout {
  id: string;
  label: string;
  blob: Blob;
  url: string;
  rotation: number;
  /** Where to make the exact cut when chosen (null = already exact). */
  point: CutPoint | null;
  /** The object as it looks (no sticker border), for naming. */
  canvas: HTMLCanvasElement;
  /** Still being named. */
  naming: boolean;
  guesses: Guess[];
  emb: Float32Array | null;
}
const MAX_CUTOUTS = 6;
/** Same as the server's on-site distance for leaving a sticker. */
const PLACE_NEAR_METERS = 150;
/** Waiting for the cutter to study the photo; past this, a soft round cut is used. */
const EXACT_CUT_MS = 9000;
/** Time for finding things in the photo (the first one is always cut). */
const FIND_MS = 2500;

/** Let the browser draw the waiting screen before heavy work blocks it. */
const nextPaint = () =>
  new Promise<void>((r) => {
    const t = setTimeout(r, 80); // rAF never fires in a hidden tab (e.g. just back from the camera)
    requestAnimationFrame(() => setTimeout(() => (clearTimeout(t), r()), 40));
  });

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
  const { currentLocation, patchSpot, refreshUnread, around } = useSearch();
  /** From the 撮る tab: shoot anything here; the sticker ties to a place nearby (changeable). */
  const free = params.get("free") === "1";
  const [linkId, setLinkId] = useState(spotId);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [delivered, setDelivered] = useState(true);

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
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const chosenEmb = useRef<Float32Array | null>(null);
  const run = useRef(0);
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
    warmUpVision();
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
    if (!free && step === "explore" && detail && !detail.spot.visited && !recorded.current) {
      recorded.current = true;
      void api.visit(spotId, currentLocation).then(load).catch(() => undefined);
      patchSpot(spotId, { visited: true });
    }
  }, [free, step, detail, spotId, currentLocation, load, patchSpot]);

  async function toCutout(mask: CutMask, point: CutPoint | null): Promise<Cutout | null> {
    if (!work.current) return null;
    const canvas = stickerFromMask(work.current, mask);
    const plain = plainFromMask(work.current, mask);
    if (!canvas || !plain) return null;
    const blob = await canvasToBlob(canvas);
    return { id: crypto.randomUUID(), label: UNNAMED, blob, url: track(blob), rotation: randomRotation(), point, canvas: plain, naming: true, guesses: [], emb: null };
  }

  /** Name one cutout on the device (word list + what you've named before). */
  async function nameOne(c: Cutout): Promise<Cutout> {
    try {
      const r = await recognize(c.canvas);
      return { ...c, label: r.label, guesses: r.guesses, emb: r.emb, naming: false };
    } catch (err) {
      console.warn("[name]", err);
      return { ...c, naming: false };
    }
  }

  /** Name the candidates one by one, in the background, while you look at them. */
  async function nameAll(list: Cutout[], token: number) {
    for (const c of list) {
      if (run.current !== token) return;
      const named = await nameOne(c);
      if (run.current !== token) return;
      setCutouts((cur) => cur.map((x) => (x.id === c.id && x.naming ? { ...named, blob: x.blob, url: x.url, canvas: x.canvas, point: x.point } : x)));
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const token = ++run.current;
    setError(null);
    setCutouts([]);
    setSticker(null);
    setStep("looking");
    try {
      await nextPaint();
      const bitmap = await loadBitmap(file);
      const photo = await downscaleToJpeg(bitmap);
      setPhotoBlob(photo);
      setPhotoUrl(track(photo));
      const canvas = toCanvas(bitmap, 1024);
      work.current = canvas;
      cutter.current = prepareCutter(canvas);
      cutter.current.catch(() => undefined);
      // Study the photo once, then cut each thing along its shape.
      const ready = await within(cutter.current, EXACT_CUT_MS);
      let made: Cutout[] = [];
      if (ready && ready.name === "sam") {
        const found = await findThings(ready, MAX_CUTOUTS, FIND_MS);
        made = (await Promise.all(found.map((f) => toCutout(f.mask, null)))).filter((c): c is Cutout => !!c);
      }
      if (made.length === 0) {
        // The cutter isn't ready (slow network): a soft round cut, made exact when chosen.
        const soft = await toCutout(boxMask(MIDDLE_BOX, canvas.width / canvas.height), { x: 0.5, y: 0.5 });
        if (soft) made = [soft];
      }
      if (run.current !== token) return;
      setCutouts(made);
      setStep("pick");
      void nameAll(made, token);
    } catch (err) {
      console.error("[photo]", err);
      setError("写真を読み込めなかった。別の写真でもう一回どうぞ。");
      setStep("explore");
    }
  }

  async function choose(picked: Cutout) {
    let c = cutouts.find((x) => x.id === picked.id) ?? picked;
    const needsCut = !!(c.point && cutter.current);
    if (needsCut || c.naming) {
      setStep("making");
      await nextPaint();
    }
    if (needsCut) {
      try {
        const ready = await within(cutter.current!, EXACT_CUT_MS);
        const mask = ready && ready.name === "sam" ? await ready.maskAt(c.point!) : null;
        const exact = mask ? await toCutout(mask, null) : null;
        if (exact) c = { ...exact, id: c.id, rotation: c.rotation };
      } catch (err) {
        console.warn("[cut]", err);
      }
    }
    if (c.naming || needsCut) c = await nameOne(c);
    const done = c;
    setCutouts((list) => list.map((x) => (x.id === done.id ? done : x)));
    setLabel(done.label === UNNAMED ? "" : done.label);
    setGuesses(done.guesses);
    chosenEmb.current = done.emb;
    setSticker({ blob: done.blob, url: done.url, rotation: done.rotation });
    setStep("make");
  }

  async function onPhotoTap(e: MouseEvent<HTMLImageElement>) {
    if (!cutter.current || cutting || cutouts.length >= MAX_CUTOUTS + 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const point = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    setCutting(true);
    setError(null);
    try {
      await nextPaint();
      const mask = await (await cutter.current).maskAt(point);
      const c = mask ? await toCutout(mask, null) : null;
      if (!c) throw new Error("no mask");
      setCutouts((list) => [...list, c]);
      void nameAll([c], run.current);
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
        spotId: linkId,
        memo: memo.trim(),
        photo: photoBlob,
        items: [{ blob: sticker.blob, label: label.trim() || UNNAMED, rotation: sticker.rotation }],
      });
      setSaved(items[0]);
      // The name you settled on teaches the recogniser.
      if (chosenEmb.current) void remember(items[0].id, label, chosenEmb.current);
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
      if (kind === "sent") setDelivered((await api.send(saved.id)).delivered);
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
  // Where a free capture can belong: the nearest places (the page's own spot first).
  const places = [
    { placeId: spotId, name: around.find((p) => p.placeId === spotId)?.name ?? spot.place.name },
    ...around.filter((p) => p.placeId !== spotId).map((p) => ({ placeId: p.placeId, name: p.name })),
  ].slice(0, 5);
  // From a spot you walked to you can always leave it there; a free shot only near the place it's tied to.
  const linkedNear = linkId === spotId ? (around.find((p) => p.placeId === spotId)?.distanceMeters ?? 0) : (around.find((p) => p.placeId === linkId)?.distanceMeters ?? Infinity);
  const canPlace = !free || linkedNear <= PLACE_NEAR_METERS;

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

  // Every step fits one screen: the main thing (photo / sticker) takes the free
  // space, the actions sit at the bottom. No scrolling.
  return (
    <main className="paper flex h-[calc(100dvh-76px-env(safe-area-inset-bottom))] flex-col overflow-hidden px-4 pt-[max(10px,env(safe-area-inset-top))] pb-3">
      {fileInputs}
      <header className="flex shrink-0 items-center gap-3">
        {/* 撮る is a tab of its own: nothing to go back to. */}
        {!free && <BackButton fallback={`/spot/${encodeURIComponent(spotId)}`} />}
        {free ? <h1 className="font-hand text-[26px]">撮る</h1> : <p className="min-w-0 flex-1 truncate text-[17px]">{spot.copy?.copy}</p>}
      </header>

      {error && (
        <p role="alert" className="mt-2 shrink-0 rounded-[10px_14px_9px_13px] bg-butter-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* ───── 探索モード ───── */}
      {/* ───── どこでも撮る（撮るタブ） ───── */}
      {step === "explore" && free && (
        <section className="animate-rise mt-3 flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
            <Michibi mood="front" size={96} says="なにか見つけた？" className="flex-col-reverse !items-center" animate="none" />
          </div>
          <div className="shrink-0 pt-2">
            <p className="mb-2 text-center text-[17px]">気になったもの、ある？</p>
            <SketchButton size="lg" block onClick={() => cameraRef.current?.click()}>
              撮る
            </SketchButton>
            <div className="mt-1 flex justify-center">
              <SketchButton variant="plain" size="sm" onClick={() => libraryRef.current?.click()}>
                アルバムから選ぶ
              </SketchButton>
            </div>
          </div>
        </section>
      )}

      {step === "explore" && !free && (
        <section className="animate-rise mt-3 flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 rounded-[14px_18px_12px_20px] bg-card p-2.5 shadow-[0_1px_0_rgb(60_50_30/0.08),0_6px_12px_-8px_rgb(60_50_30/0.3)]">
            <PlaceImage place={spot.place} width={200} className="h-16 w-16 shrink-0 rounded-[10px_12px_9px_13px]" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-ink-mute">ここでした</p>
              <p className="truncate text-lg leading-tight">{spot.place.name}</p>
              {spot.place.primaryTypeLabel && <p className="truncate text-[14px] text-ink-soft">{spot.place.primaryTypeLabel}</p>}
            </div>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center">
            {others.length > 0 ? (
              <>
                <p className="text-[15px]">{MICHIBI_LINES.somebodyWasHere}</p>
                <ul className="hide-scrollbar -mx-4 mt-2 flex gap-4 overflow-x-auto px-4 pb-1">
                  {others.map((o) => (
                    <li key={o.id} className="w-[34%] shrink-0 text-center">
                      <StickerView src={o.imageUrl} alt={o.label} rotation={o.rotation} className="mx-auto max-h-[22dvh] w-auto" />
                      <p className="mt-1 truncate text-[14px]">{o.label}</p>
                      {o.memo && <p className="line-clamp-2 text-[14px] text-ink-soft">「{o.memo}」</p>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <button type="button" onClick={() => setNudge((v) => !v)} aria-label="ヒント" className="mx-auto">
                <Michibi mood={nudge ? "surprise" : "front"} size={96} says={nudge ? MICHIBI_LINES.nudge : MICHIBI_LINES.explore} className="flex-col-reverse !items-center" animate="none" />
              </button>
            )}
            {detail.foundLabels.length > 0 && (
              <p className="mt-2 truncate text-[14px] text-ink-mute">ここで見つかったもの：{detail.foundLabels.join("・")}</p>
            )}
          </div>

          <div className="shrink-0 pt-2">
            <p className="mb-2 text-center text-[17px]">{others.length > 0 ? "あなたは、何を見つける？" : "気になったもの、ある？"}</p>
            <SketchButton size="lg" block onClick={() => cameraRef.current?.click()}>
              ここで撮る
            </SketchButton>
            <div className="mt-1 flex justify-center">
              <SketchButton variant="plain" size="sm" onClick={() => libraryRef.current?.click()}>
                アルバムから選ぶ
              </SketchButton>
            </div>
          </div>
        </section>
      )}

      {/* ───── 写真の中を見ている ───── */}
      {step === "looking" && (
        <WaitView photoUrl={photoUrl} line="なにが写ってるかな" />
      )}

      {/* ───── 候補から選ぶ ───── */}
      {step === "pick" && photoUrl && (
        <section className="animate-rise mt-3 flex min-h-0 flex-1 flex-col">
          <p className="shrink-0 text-lg">{MICHIBI_LINES.choose}</p>
          {cutouts.length > 0 && (
            <ul className="hide-scrollbar -mx-4 mt-2 flex shrink-0 gap-3 overflow-x-auto px-4 pb-1">
              {cutouts.map((c) => (
                <li key={c.id} className="w-[27%] shrink-0">
                  <button type="button" onClick={() => choose(c)} className="flex w-full flex-col items-center text-center transition-transform active:translate-y-0.5">
                    <StickerView src={c.url} alt={c.label} rotation={c.rotation} className="h-[12dvh] w-auto" />
                    <span className="mt-1 line-clamp-1 text-[14px]">
                      {c.naming ? (
                        <span className="wait-dots text-ink-mute" aria-label="名前を考え中">
                          <i>.</i>
                          <i>.</i>
                          <i>.</i>
                        </span>
                      ) : (
                        c.label
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 shrink-0 text-[14px] text-ink-mute">{cutouts.length > 0 ? "ほかのものは、写真の中をタップ。" : "シールにしたいところを、写真の中でタップ。"}</p>
          <div className="relative mt-1 flex min-h-0 flex-1 items-center justify-center">
            <img
              src={photoUrl}
              alt="撮った写真。シールにしたいところをタップ"
              onClick={(e) => void onPhotoTap(e)}
              className={`max-h-full max-w-full rounded-[14px_18px_12px_20px] object-contain ${cutting ? "cursor-progress" : "cursor-crosshair"}`}
            />
            {cutting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-card/50">
                <img src={michibiSrc("flap", "sm")} alt="" className="bird-hop-loop h-14 w-14" />
                <p className="text-[15px]">
                  切ってる<span className="wait-dots" aria-hidden><i>.</i><i>.</i><i>.</i></span>
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 justify-center pt-1">
            <SketchButton variant="plain" size="sm" onClick={() => setStep("explore")}>
              撮り直す
            </SketchButton>
          </div>
        </section>
      )}

      {/* ───── 切り抜いている ───── */}
      {step === "making" && <WaitView photoUrl={photoUrl} line="ふちを切ってる" cutting />}

      {/* ───── シールができた ───── */}
      {step === "make" && sticker && (
        <section className="animate-rise mt-3 flex min-h-0 flex-1 flex-col">
          <div className="sticker-sheet relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[22px_18px_24px_16px]">
            <div className="h-[74%] animate-[stick_0.45s_cubic-bezier(0.2,0.9,0.3,1.2)_both]" style={{ ["--r" as string]: `${sticker.rotation}deg` }}>
              <StickerView src={sticker.url} alt="できたシール" lift className="h-full w-auto" />
            </div>
            <div className="absolute bottom-2 left-2">
              <Michibi mood="happy" size={44} says={MICHIBI_LINES.made} animate="none" />
            </div>
          </div>
          <div className="shrink-0 pt-3">
            <SketchInput
              aria-label="なまえ"
              className="w-full !text-[20px]"
              value={label}
              maxLength={12}
              placeholder="なんて呼ぶ？"
              onChange={(e) => setLabel(e.target.value)}
            />
            {guesses.length > 0 && (
              <div className="hide-scrollbar mt-2 flex gap-2 overflow-x-auto" aria-label="名前の候補">
                {guesses.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setLabel(g.label)}
                    className={`shrink-0 rounded-[10px_13px_9px_12px] px-3 py-1 text-[15px] transition-colors ${label === g.label ? "bg-butter" : "bg-card"}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-3 text-[14px] text-ink-soft">
              {free && places.length > 0 && (
                <button type="button" onClick={() => setPlaceOpen(true)} className="min-w-0 truncate underline decoration-butter decoration-4 underline-offset-2">
                  場所：{places.find((p) => p.placeId === linkId)?.name ?? "近く"}
                </button>
              )}
              {!memoOpen && (
                <button type="button" onClick={() => setMemoOpen(true)} className="ml-auto shrink-0 underline decoration-sky decoration-4 underline-offset-2">
                  ＋ メモ
                </button>
              )}
            </div>
            {memoOpen && (
              <SketchInput aria-label="ひとことメモ" className="mt-2 w-full" value={memo} maxLength={80} placeholder="気になったところ" autoFocus onChange={(e) => setMemo(e.target.value)} />
            )}
            <div className="mt-3 flex items-center gap-2">
              <SketchButton variant="plain" size="sm" onClick={() => setStep("pick")} disabled={busy} className="shrink-0">
                ほかのにする
              </SketchButton>
              <SketchButton size="lg" className="flex-1" onClick={() => void makeSticker()} disabled={busy}>
                {busy ? "貼ってる…" : "シールにする"}
              </SketchButton>
            </div>
          </div>
        </section>
      )}

      {/* ───── どうする？ ───── */}
      {step === "share" && saved && (
        <section className="animate-rise mt-3 flex min-h-0 flex-1 flex-col items-center text-center">
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
            <StickerView src={saved.imageUrl} alt={saved.label} rotation={saved.rotation} lift className="max-h-[80%] w-auto" />
            <p className="mt-2 text-lg">{saved.label}</p>
          </div>
          <div className="w-full shrink-0">
            <div className="mb-2 flex justify-center">
              <Michibi mood="perch" size={44} says={MICHIBI_LINES.shareAsk} animate="none" />
            </div>
            {canPlace ? (
              <SketchButton size="lg" block onClick={() => void share("placed")} disabled={busy}>
                ここに置いていく
              </SketchButton>
            ) : (
              <p className="mb-1 text-[14px] text-ink-soft">置いていけるのは、その場所の近くにいるとき。</p>
            )}
            <div className="mt-2 flex gap-2">
              <SketchButton variant="sub" className="flex-1" onClick={() => void share("sent")} disabled={busy}>
                誰かに送る
              </SketchButton>
              <SketchButton variant="plain" className="flex-1" onClick={() => void share("kept")} disabled={busy}>
                ボックスにしまう
              </SketchButton>
            </div>
          </div>
        </section>
      )}

      {/* ───── おしまい ───── */}
      {step === "done" && saved && (
        <section className="animate-rise mt-3 flex min-h-0 flex-1 flex-col items-center text-center">
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
            <StickerView src={saved.imageUrl} alt={saved.label} rotation={saved.rotation} className="max-h-[60%] w-auto" />
            <Michibi
              mood={outcome === "sent" ? "flap" : outcome === "placed" ? "perch" : "happy"}
              size={72}
              says={outcome === "sent" ? (delivered ? MICHIBI_LINES.sent : "届け先、探してるところ。") : outcome === "placed" ? MICHIBI_LINES.placed : "ボックスに入れといた。"}
              className="mt-3 flex-col-reverse !items-center"
              animate="none"
            />
          </div>
          <div className="flex w-full shrink-0 gap-2">
            <SketchLinkButton href="/" variant="sub" className="flex-1">
              ほかの場所へ
            </SketchLinkButton>
            <SketchButton
              className="flex-1"
              onClick={() => {
                setStep("explore");
                setSaved(null);
                setSticker(null);
                setMemo("");
                void load();
              }}
            >
              もう少し探す
            </SketchButton>
          </div>
        </section>
      )}
      <SketchSheet open={placeOpen} onClose={() => setPlaceOpen(false)} label="どこで見つけた？">
        <p className="px-5 pt-1 font-hand text-lg">どこで見つけた？</p>
        <ul className="flex flex-col gap-2 px-5 pt-2 pb-6">
          {places.map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                onClick={() => {
                  setLinkId(p.placeId);
                  setPlaceOpen(false);
                }}
                className={`w-full truncate rounded-[12px_15px_11px_14px] px-4 py-3 text-left text-[16px] ${linkId === p.placeId ? "bg-butter font-bold" : "bg-card"}`}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      </SketchSheet>
    </main>
  );
}

/**
 * The waiting screen while the photo is looked at / cut out. Everything moves
 * with CSS only, so it keeps going even while the cutter keeps the page busy.
 */
function WaitView({ photoUrl, line, cutting = false }: { photoUrl: string | null; line: string; cutting?: boolean }) {
  return (
    <section className="mt-3 flex min-h-0 flex-1 flex-col items-center" role="status" aria-live="polite">
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        {photoUrl ? (
          <div className="relative max-h-full overflow-hidden rounded-[18px_22px_16px_24px]">
            <img src={photoUrl} alt="" className={`block max-h-[60dvh] w-auto max-w-full object-contain ${cutting ? "opacity-60" : "opacity-85"}`} />
            <div className="scan-line pointer-events-none absolute inset-x-0 h-10" />
          </div>
        ) : (
          <div className="h-[40dvh] w-full rounded-[18px_22px_16px_24px] bg-card" />
        )}
      </div>
      <div className="flex shrink-0 items-end gap-2 pt-3">
        <img src={michibiSrc(cutting ? "flap" : "side", "sm")} alt="" className="bird-hop-loop h-14 w-14" />
        <p className="mb-2 text-[18px]">
          {line}
          <span className="wait-dots" aria-hidden><i>.</i><i>.</i><i>.</i></span>
        </p>
      </div>
    </section>
  );
}
