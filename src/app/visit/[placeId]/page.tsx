"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs */
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

import { BackButton } from "@/components/BackButton";
import { canGoBack } from "@/components/NavTracker";
import { GuideView } from "@/components/GuideView";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchInput, SketchLinkButton, SketchSheet } from "@/components/sketch";
import { MessageView } from "@/components/StateViews";
import { StickerView } from "@/components/StickerView";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES, michibiSrc } from "@/lib/character";
import { boxMask, findThings, MIDDLE_BOX, prepareCutter, within, type CutMask, type CutPoint, type StickerCutter } from "@/lib/sticker/cutter";
import { canvasToBlob, downscaleToJpeg, loadBitmap, plainFromMask, randomRotation, stickerFromMask, toCanvas } from "@/lib/sticker/render";
import { useSearch } from "@/lib/store/search-context";
import { recognize, remember, UNNAMED, warmUpVision, type Guess } from "@/lib/vision/recognize";
import { takePhoto } from "@/lib/pending-photo";
import { cameraBack, cameraOpening, checkCameraReload, diag } from "@/lib/diag";
import { isIOS, modelProgress, onModelProgress } from "@/lib/vision/runtime";
import { LABEL_MAX, mockLocation, ON_SITE_METERS } from "@/lib/config";
import { distanceMeters } from "@/lib/geo";
import type { SpotDetail, Sticker } from "@/lib/types";
import { Wrap } from "@/components/Wrap";

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
/** You can leave this many of your own stickers at one place (same as the server). */
const MAX_PLACED_PER_SPOT = 3;
/** Waiting for the cutter to study the photo (models load only after the shot); past this, a soft round cut is used.
 *  iPhones cut on the CPU (see cutter.ts): slower, so they get longer. */
const EXACT_CUT_MS = isIOS() ? 30000 : 12000;
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

  // The basics only (no Google details, no view counting): this screen is about the photo.
  const hasLocation = !!currentLocation;
  const loadId = useRef(0);
  const load = useCallback(
    () => {
      // Only the newest answer counts (the one without a position may come back last).
      const n = ++loadId.current;
      return api
        .spot(spotId, currentLocation, true)
        .then((d) => n === loadId.current && setDetail(d))
        .catch((e) => n === loadId.current && setLoadError(e instanceof ApiClientError ? e.message : "読み込めなかった。"));
    },
    // Location changes every few meters: load once, and again when it first becomes known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spotId, hasLocation],
  );
  useEffect(() => {
    void load();
  }, [load]);

  /** 着いた (only offered when you're there): count it, then the spot page takes over. */
  async function arrive() {
    setError(null);
    try {
      // Fixed position: "walking there" is pretended, so the place itself is where you are.
      await api.visit(spotId, mockLocation() && detail ? detail.spot.place.location : currentLocation);
      patchSpot(spotId, { visited: true });
      router.replace(`/spot/${encodeURIComponent(spotId)}`);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "うまくいかなかった。");
    }
  }

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
    setSaved(null);
    setOutcome(null);
    setMemo("");
    setMemoOpen(false);
    setStep("looking");
    try {
      await nextPaint();
      // Last photo's pictures aren't needed any more (phones run out of memory quickly).
      urls.current.splice(0).forEach((u) => URL.revokeObjectURL(u));
      const bitmap = await loadBitmap(file);
      const photo = await downscaleToJpeg(bitmap);
      setPhotoBlob(photo);
      setPhotoUrl(track(photo));
      const canvas = toCanvas(bitmap, 1024);
      bitmap.close();
      work.current = canvas;
      cutter.current = prepareCutter(canvas);
      cutter.current.catch(() => undefined);
      // Study the photo once, then cut each thing along its shape.
      const t0 = performance.now();
      const ready = await within(cutter.current, EXACT_CUT_MS);
      diag(`cutter ${ready ? ready.name : "not ready (timeout)"} after ${Math.round(performance.now() - t0)}ms`);
      let made: Cutout[] = [];
      if (ready && ready.name === "sam") {
        const found = await findThings(ready, MAX_CUTOUTS, FIND_MS);
        diag(`found ${found.length} things`);
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
      // Naming loads its model only now, after cutting: both at once is too much for a phone.
      warmUpVision();
      void nameAll(made, token);
    } catch (err) {
      console.error("[photo]", err);
      diag(`photo failed: ${String(err).slice(0, 120)}`);
      setError("写真を読み込めなかった。別の写真でもう一回どうぞ。");
      setStep("explore");
    }
  }

  // A photo already taken on the spot page: go straight to cutting it. Without one
  // (reload, back/forward) there's nothing to work on here: the spot page is the place to shoot.
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current) return;
    handed.current = true;
    checkCameraReload(`visit${free ? " free" : ""}`);
    const file = takePhoto();
    diag(`visit opened (step ${step}${free ? ", free" : ""}${file ? ", photo handed" : ""})`);
    if (file) void Promise.resolve().then(() => onPhoto(file));
    else if (!free && step === "explore") router.replace(`/spot/${encodeURIComponent(spotId)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // Half-made sticker: the phone's back gesture asks before throwing it away.
  const working = step === "looking" || step === "pick" || step === "making" || step === "make";
  const guarded = useRef(false); // our extra history entry is there
  const leaving = useRef(false); // the page is going away (not just the step changing)
  useEffect(() => {
    leaving.current = false;
    return () => {
      leaving.current = true;
    };
  }, []);
  useEffect(() => {
    if (!working) return;
    // Same router state, one more history entry to catch "back" with (once, even if effects run twice).
    if (!guarded.current) {
      window.history.pushState(window.history.state, "");
      guarded.current = true;
    }
    const onPop = () => {
      if (window.confirm("作りかけのシールは消えるよ。やめる？")) {
        guarded.current = false;
        run.current++;
        if (free) setStep("explore");
        else router.replace(`/spot/${encodeURIComponent(spotId)}`);
      } else {
        window.history.pushState(window.history.state, "");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Done making it: take the extra entry back out, so the next "back" works at once.
      if (guarded.current && !leaving.current) {
        guarded.current = false;
        window.history.back();
      }
    };
  }, [working, free, router, spotId]);

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
    if (!cutter.current || cutting) return;
    if (cutouts.length >= MAX_CUTOUTS + 2) {
      setError("もういっぱい。この中から選んでね。");
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const point = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
    const token = run.current;
    setCutting(true);
    setError(null);
    try {
      await nextPaint();
      // Don't wait forever for a first-time model download.
      const ready = await within(cutter.current, EXACT_CUT_MS);
      if (!ready) throw new Error("not ready");
      const mask = await ready.maskAt(point);
      if (run.current !== token) return; // a new photo came in meanwhile
      const c = mask ? await toCutout(mask, null) : null;
      if (!c) throw new Error("no mask");
      setCutouts((list) => [...list, c]);
      void nameAll([c], token);
    } catch {
      if (run.current === token) setError("そこはうまく切り抜けなかった。もう少し真ん中をタップしてみて。");
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
        // Fixed position: you "walked" to the place, so that's where it was found.
        at: mockLocation() ? (linkedAt ?? currentLocation) : currentLocation,
        photo: photoBlob,
        items: [{ blob: sticker.blob, label: label.trim() || UNNAMED, rotation: sticker.rotation }],
      });
      setSaved(items[0]);
      patchSpot(linkId, { visited: true });
      // The name you settled on teaches the recogniser.
      if (chosenEmb.current) void remember(items[0].id, label, chosenEmb.current);
      setStep("share");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "保存できなかった。もう一回どうぞ。");
    } finally {
      setBusy(false);
    }
  }

  async function share(kind: Outcome) {
    if (!saved) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "placed") {
        await api.place(saved.id, currentLocation);
        void load(); // so the per-place limit is right for the next one
      }
      if (kind === "sent") setDelivered((await api.send(saved.id)).delivered);
      setOutcome(kind);
      setStep("done");
      refreshUnread();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "うまくいかなかった。");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="h-[calc(100dvh-76px)]">
        <MessageView mood="sleepy" says={loadError} action={{ label: "地図へ", href: "/" }} />
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
  // Where a free capture can belong: the nearest places (the page's own spot first).
  const places = [
    { placeId: spotId, name: around.find((p) => p.placeId === spotId)?.name || spot.place.name || spot.copy?.copy.replace(/\n/g, "") || "この近く" },
    ...around.filter((p) => p.placeId !== spotId).map((p) => ({ placeId: p.placeId, name: p.name })),
  ].slice(0, 5);
  // Leaving it there: only when you're there (as the server checks), and not past the per-place limit.
  const linkedAt = linkId === spotId ? spot.place.location : around.find((p) => p.placeId === linkId)?.location;
  const nearLinked = !!(currentLocation && linkedAt && distanceMeters(currentLocation, linkedAt) <= ON_SITE_METERS);
  const placedHere = linkId === spotId ? detail.mine.filter((m) => m.status === "placed").length : 0;
  const canPlace = (nearLinked || (linkId === spotId && detail.onSite)) && placedHere < MAX_PLACED_PER_SPOT;

  if (step === "go") {
    return (
      <main>
        <GuideView spot={spot} onArrive={() => void arrive()} onQuit={() => (canGoBack() ? router.back() : router.replace("/"))} error={error} />
      </main>
    );
  }

  /** Take the chosen file, then clear the input so picking the same photo again still works. */
  function pickFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    cameraBack();
    diag(`photo back: ${file ? `${file.type} ${Math.round(file.size / 1024)}KB` : "none"} (step ${step}${free ? ", free" : ""})`);
    void onPhoto(file);
  }
  function openCamera() {
    cameraOpening(`visit camera${free ? " free" : ""}`);
    cameraRef.current?.click();
  }
  function openLibrary() {
    cameraOpening(`visit album${free ? " free" : ""}`);
    libraryRef.current?.click();
  }

  const fileInputs = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickFile(e.currentTarget)} />
      <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => pickFile(e.currentTarget)} />
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
        {free ? <h1 className="font-hand text-[28px]">撮る</h1> : <p className="min-w-0 flex-1 text-[18px] leading-snug"><Wrap>{spot.copy?.copy}</Wrap></p>}
      </header>

      {error && (
        <p role="alert" className="mt-2 shrink-0 rounded-[10px_14px_9px_13px] bg-butter-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* ───── 撮る前（撮るタブ／写真が読めなかったとき） ───── */}
      {step === "explore" && (
        <section className="animate-rise mt-3 flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
            <Michibi mood="front" size={96} says={MICHIBI_LINES.explore} above animate="none" />
          </div>
          <div className="shrink-0 pt-2">
            <p className="mb-2 text-center text-[18px]">気になったもの、ある？</p>
            <SketchButton size="lg" block onClick={() => openCamera()}>
              {free ? "撮る" : "ここで撮る"}
            </SketchButton>
            <div className="mt-1 flex justify-center">
              <SketchButton variant="plain" size="sm" onClick={() => openLibrary()}>
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
                    <span className="mt-1 text-[14px] leading-snug">
                      {c.naming ? (
                        <span className="wait-dots text-ink-mute" aria-label="名前を考え中">
                          <i>.</i>
                          <i>.</i>
                          <i>.</i>
                        </span>
                      ) : (
                        <Wrap>{c.label}</Wrap>
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
                <p className="text-[16px]">
                  切ってる<span className="wait-dots" aria-hidden><i>.</i><i>.</i><i>.</i></span>
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 justify-center pt-1">
            <SketchButton variant="plain" size="sm" onClick={() => openCamera()} disabled={cutting}>
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
            <div className="h-[82%] animate-[stick_0.45s_cubic-bezier(0.2,0.9,0.3,1.2)_both]" style={{ ["--r" as string]: `${sticker.rotation}deg` }}>
              <StickerView src={sticker.url} alt="できたシール" lift className="h-full w-auto" />
            </div>
          </div>
          {/* Under the sticker, never on it */}
          <div className="mt-2 shrink-0">
            <Michibi mood="happy" size={44} says={MICHIBI_LINES.made} animate="none" />
          </div>
          <div className="shrink-0 pt-3">
            <SketchInput
              aria-label="名前"
              className="w-full !text-[22px]"
              value={label}
              maxLength={LABEL_MAX}
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
                    className={`shrink-0 rounded-[10px_13px_9px_12px] px-3 py-1 text-[16px] transition-colors ${label === g.label ? "bg-butter" : "bg-card"}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center gap-3 text-[14px] text-ink-soft">
              {free && places.length > 0 && (
                <button type="button" onClick={() => setPlaceOpen(true)} className="min-w-0 text-left underline decoration-butter decoration-4 underline-offset-2">
                  場所：<Wrap>{places.find((p) => p.placeId === linkId)?.name ?? "近く"}</Wrap>
                </button>
              )}
              {!memoOpen && (
                <button type="button" onClick={() => setMemoOpen(true)} className="ml-auto shrink-0 underline decoration-sky decoration-4 underline-offset-2">
                  メモを書く
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
                {busy ? "作ってる…" : "シールにする"}
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
            <p className="mt-2 text-lg"><Wrap>{saved.label}</Wrap></p>
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
              <p className="mb-1 text-[14px] text-ink-soft">{placedHere >= MAX_PLACED_PER_SPOT ? `ひとつの場所に置けるのは${MAX_PLACED_PER_SPOT}枚まで。` : "置いていけるのは、その場所の近くにいるとき。"}</p>
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
              says={outcome === "sent" ? (delivered ? MICHIBI_LINES.sent : MICHIBI_LINES.sendWaiting) : outcome === "placed" ? MICHIBI_LINES.placed : MICHIBI_LINES.kept}
              above
              className="mt-3"
              animate="none"
            />
          </div>
          <div className="flex w-full shrink-0 gap-2">
            <SketchLinkButton href="/" variant="sub" className="flex-1">
              ほかの場所へ
            </SketchLinkButton>
            {/* Only opens the camera: the screen changes once a photo actually comes back. */}
            <SketchButton className="flex-1" onClick={() => openCamera()}>
              もう1枚撮る
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
                className={`w-full rounded-[12px_15px_11px_14px] px-4 py-3 text-left text-[16px] ${linkId === p.placeId ? "bg-butter font-bold" : "bg-card"}`}
              >
                <Wrap>{p.name}</Wrap>
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
  // First time only: the on-device models are downloading.
  const [progress, setProgress] = useState<number | null>(modelProgress());
  useEffect(() => onModelProgress(setProgress), []);
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
          {progress !== null ? `はじめての準備中 ${Math.round(progress * 100)}%` : line}
          <span className="wait-dots" aria-hidden><i>.</i><i>.</i><i>.</i></span>
        </p>
      </div>
    </section>
  );
}
