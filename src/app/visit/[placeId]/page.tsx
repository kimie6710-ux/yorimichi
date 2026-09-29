"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { GuideView } from "@/components/GuideView";
import { Michibi } from "@/components/Michibi";
import { PlaceSheetContent } from "@/components/PlaceSheetContent";
import { MessageView } from "@/components/StateViews";
import { StickerView } from "@/components/StickerView";
import { MICHIBI_LINES, type MichibiMood } from "@/lib/character";
import { emojiForType } from "@/lib/place-emoji";
import {
  AUTO_POINTS,
  looksLikeObject,
  maskIoU,
  prepareCutter,
  warmUpCutter,
  type CutMask,
  type CutPoint,
  type StickerCutter,
} from "@/lib/sticker/cutter";
import {
  canvasToBlob,
  downscaleToJpeg,
  emojiSticker,
  loadBitmap,
  randomRotation,
  stickerFromMask,
  toCanvas,
} from "@/lib/sticker/render";
import { useSearch } from "@/lib/store/search-context";
import { recordReaction, saveStickers } from "@/lib/store/sticker-repo";
import { REACTIONS, type StickerItem, type UserReaction } from "@/lib/types";

type Step = "go" | "reveal" | "reaction" | "photo" | "cut" | "saving" | "done";

/** A cut-out candidate. Several can come out of one photo. */
interface Candidate {
  id: string;
  blob: Blob;
  url: string;
  rotation: number;
  selected: boolean;
}

const REACTION_MOOD: Record<UserReaction, MichibiMood> = {
  totally_off: "lazy",
  kind_of: "found",
  totally_get_it: "happy",
};
const MAX_CANDIDATES = 6;

function CheckIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function VisitPage() {
  const { placeId } = useParams<{ placeId: string }>();
  const router = useRouter();
  const { findSpot, result } = useSearch();
  const spot = findSpot(decodeURIComponent(placeId));
  const spotNumber = spot && result ? result.spots.indexOf(spot) + 1 : 0;

  const [step, setStep] = useState<Step>("go");
  const [reaction, setReaction] = useState<UserReaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ items: StickerItem[]; where: "cloud" | "device" } | null>(null);

  // Cut-out workspace
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [tapping, setTapping] = useState<CutPoint | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [cutterName, setCutterName] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const workCanvas = useRef<HTMLCanvasElement | null>(null);
  const cutter = useRef<StickerCutter | null>(null);
  const masks = useRef<CutMask[]>([]);
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

  // Start fetching the cut-out model while the user is still walking.
  useEffect(() => {
    if (step === "go" || step === "reveal" || step === "reaction" || step === "photo") warmUpCutter();
  }, [step]);

  if (!spot) {
    return (
      <main className="h-[calc(100dvh-76px)]">
        <MessageView
          mood="lazy"
          says="この場所、どこかに置いてきちゃった。"
          detail="検索結果の有効期限が切れたみたい。もう一度寄り道を探してみてください。"
          action={{ label: "ホームへ", href: "/" }}
        />
      </main>
    );
  }

  const { place, recommendation: rec } = spot;
  const focused = candidates.find((c) => c.id === focusId) ?? candidates[0] ?? null;
  const selectedCount = candidates.filter((c) => c.selected).length;

  async function addCandidate(mask: CutMask, select: boolean): Promise<boolean> {
    const source = workCanvas.current;
    if (!source) return false;
    const sticker = stickerFromMask(source, mask);
    if (!sticker) return false;
    const blob = await canvasToBlob(sticker);
    const c: Candidate = { id: crypto.randomUUID(), blob, url: track(blob), rotation: randomRotation(), selected: select };
    masks.current.push(mask);
    setCandidates((list) => [...list, c]);
    setFocusId(c.id);
    return true;
  }

  /** Look around the photo for things worth cutting out (middle first). */
  async function detectCandidates(active: StickerCutter) {
    setDetecting(true);
    let found = 0;
    const points = active.name === "blob" ? AUTO_POINTS.slice(0, 1) : AUTO_POINTS;
    for (const [i, point] of points.entries()) {
      if (found >= MAX_CANDIDATES) break;
      try {
        const mask = await active.maskAt(point);
        if (!mask) continue;
        if (i > 0 && !looksLikeObject(mask)) continue; // probably the table / wall / sky
        if (masks.current.some((m) => maskIoU(m, mask) > 0.55)) continue; // same object again
        if (await addCandidate(mask, found === 0)) found++;
      } catch (err) {
        console.warn("[cut] auto point failed", err);
      }
    }
    setDetecting(false);
    if (found === 0) {
      setHint("主役が見つからなかった。写真の中の、シールにしたいものをタップしてみて。");
      setShowPhoto(true);
    }
  }

  async function chooseReaction(r: UserReaction) {
    setReaction(r);
    setStep("photo");
    await recordReaction({ placeId: place.placeId, recommendationId: rec.id, reaction: r });
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setHint(null);
    setCandidates([]);
    setFocusId(null);
    setShowPhoto(false);
    masks.current = [];
    setStep("cut");
    setDetecting(true);
    try {
      const bitmap = await loadBitmap(file);
      const photo = await downscaleToJpeg(bitmap);
      setPhotoBlob(photo);
      setPhotoUrl(track(photo));
      workCanvas.current = toCanvas(bitmap, 1024);
      setCutterName(null);
      const active = await prepareCutter(workCanvas.current);
      cutter.current = active;
      setCutterName(active.name);
      await detectCandidates(active);
    } catch (err) {
      console.error("[photo]", err);
      setDetecting(false);
      setError("写真を読み込めなかった。別の写真でもう一回どうぞ。");
      setStep("photo");
    }
  }

  async function skipPhoto() {
    const canvas = emojiSticker(emojiForType(place.primaryType));
    if (!canvas) return;
    const blob = await canvasToBlob(canvas);
    const c: Candidate = { id: crypto.randomUUID(), blob, url: track(blob), rotation: randomRotation(), selected: true };
    setPhotoUrl(null);
    setPhotoBlob(null);
    workCanvas.current = null;
    masks.current = [];
    setCandidates([c]);
    setFocusId(c.id);
    setShowPhoto(false);
    setStep("cut");
  }

  async function onPhotoTap(e: MouseEvent<HTMLImageElement>) {
    if (tapping || detecting || !cutter.current || candidates.length >= MAX_CANDIDATES) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
    setTapping(point);
    setHint(null);
    try {
      const mask = await cutter.current.maskAt(point);
      const dup = mask ? masks.current.findIndex((m) => maskIoU(m, mask) > 0.8) : -1;
      if (mask && dup >= 0) {
        // Already a candidate → just select it.
        const existing = candidates[dup];
        if (existing) {
          setCandidates((list) => list.map((c) => (c.id === existing.id ? { ...c, selected: true } : c)));
          setFocusId(existing.id);
        }
      } else if (!mask || !(await addCandidate(mask, true))) {
        setHint("そこはうまく切り抜けなかった。もう少し真ん中あたりをタップしてみて。");
      }
    } catch (err) {
      console.error("[cut]", err);
      setHint("切り抜きに失敗した。別のところをタップしてみて。");
    } finally {
      setTapping(null);
    }
  }

  function toggleSelected(id: string) {
    setCandidates((list) => list.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  }

  async function save() {
    const chosen = candidates.filter((c) => c.selected);
    if (chosen.length === 0) return;
    setStep("saving");
    setError(null);
    try {
      const res = await saveStickers({
        placeId: place.placeId,
        recommendationId: rec.id,
        realName: place.name,
        aiTitle: rec.title,
        query: result?.query ?? "",
        reaction,
        // Stickers are tied to the Google place (place_id + its coordinates).
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        address: place.address,
        photo: photoBlob,
        stickers: chosen.map((c) => ({ blob: c.blob, rotation: c.rotation })),
      });
      setSaved(res);
      setStep("done");
    } catch (err) {
      console.error("[save]", err);
      setError("保存に失敗しました。ストレージの空きを確認して、もう一度どうぞ。");
      setStep("cut");
    }
  }

  if (step === "go") {
    return (
      <main>
        <GuideView
          spot={spot}
          index={spotNumber > 0 ? spotNumber : null}
          onArrive={() => setStep("reveal")}
          onQuit={() => router.push("/map")}
        />
      </main>
    );
  }

  if (step === "reveal") {
    return (
      <main className="aurora min-h-[calc(100dvh-76px)] pt-[max(16px,env(safe-area-inset-top))]">
        <p className="px-5 pb-4 text-center text-xl font-bold">ここでした</p>
        <PlaceSheetContent spot={spot} onContinue={() => setStep("reaction")} />
      </main>
    );
  }

  return (
    <main className="aurora min-h-[calc(100dvh-76px)]">
      <div className="px-5 pt-[max(16px,env(safe-area-inset-top))] pb-10">
        <header className="flex items-center gap-3">
          <Link
            href="/map"
            aria-label="マップに戻る"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-soft"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm text-ink-soft">{place.name}</p>
            <p className="truncate text-lg font-bold">{rec.title}</p>
          </div>
        </header>

        {step === "reaction" && (
          <section className="animate-rise mt-10 flex flex-col items-center text-center">
            <Michibi mood="wonder" size={120} animate="none" />
            <h1 className="mt-4 text-2xl font-bold">{MICHIBI_LINES.reactionAsk}</h1>
            <p className="mt-1 text-sm text-ink-soft">「{rec.title}」は…</p>
            <div className="mt-8 grid w-full grid-cols-3 gap-3">
              {REACTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => void chooseReaction(r.value)}
                  className="flex flex-col items-center gap-2 rounded-3xl bg-white px-1 py-5 shadow-soft transition-transform active:scale-95"
                >
                  <span className="text-[40px] leading-none" aria-hidden>
                    {r.emoji}
                  </span>
                  <span className="text-sm font-bold tracking-tight whitespace-nowrap">{r.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === "photo" && (
          <section className="animate-rise mt-10 flex flex-col items-center text-center">
            {reaction && (
              <Michibi
                mood={REACTION_MOOD[reaction]}
                size={120}
                says={MICHIBI_LINES.reaction[reaction]}
                className="flex-col !items-center"
              />
            )}
            <h2 className="mt-6 text-xl font-bold">ここで見つけたもの、シールにする？</h2>
            <p className="mt-1 text-sm text-ink-soft">
              写真に写ったもの（丼、看板、鳥居、植木鉢…）だけを切り抜いて、シール帳に貼れます。
            </p>
            {error && (
              <p role="alert" className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#c2255c] shadow-soft">
                {error}
              </p>
            )}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void onPhoto(e.target.files?.[0])}
            />
            <input
              ref={libraryRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="sr-only"
              onChange={(e) => void onPhoto(e.target.files?.[0])}
            />
            <div className="mt-8 flex w-full flex-col gap-3">
              <button type="button" onClick={() => cameraRef.current?.click()} className="btn-primary h-14 w-full text-lg">
                写真を撮る
              </button>
              <button type="button" onClick={() => libraryRef.current?.click()} className="btn-secondary h-12 w-full text-base">
                ＋ アルバムから選ぶ
              </button>
              <button type="button" onClick={() => void skipPhoto()} className="mt-1 text-sm font-bold text-ink-soft underline underline-offset-4">
                写真なしで、この場所のシールだけもらう
              </button>
            </div>
          </section>
        )}

        {(step === "cut" || step === "saving") && (
          <section className="animate-rise mt-5">
            {/* Big preview of the focused cut-out, on a transparency checkerboard. */}
            <div className="checker relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[28px] shadow-soft">
              {focused ? (
                <div key={focused.id} className="w-[72%] animate-[stick_0.45s_cubic-bezier(0.2,0.9,0.3,1.2)_both]">
                  <StickerView src={focused.url} alt="切り抜いたシール" rotation={focused.rotation / 2} lift />
                </div>
              ) : (
                <div className="flex flex-col items-center text-center" role="status">
                  <Michibi mood="peek" size={96} animate="wander" />
                  <p className="mt-2 text-sm font-bold text-ink-soft">
                    {cutterName === null ? "切り抜きの道具を準備中…" : "ちょきちょき… 写真の中から探してる"}
                  </p>
                </div>
              )}
              {focused && photoUrl && (
                <button
                  type="button"
                  onClick={() => toggleSelected(focused.id)}
                  disabled={step === "saving"}
                  aria-pressed={focused.selected}
                  className={`absolute right-3 bottom-3 flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold shadow-soft ${
                    focused.selected ? "bg-mint text-ink" : "bg-white text-ink-soft"
                  }`}
                >
                  {focused.selected && <CheckIcon size={16} />}
                  {focused.selected ? "使う" : "使わない"}
                </button>
              )}
              {detecting && focused && (
                <span className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-ink-soft shadow-soft">
                  ほかにも探してる…
                </span>
              )}
            </div>

            {/* Candidate tray */}
            {candidates.length > 0 && (
              <ul className="hide-scrollbar -mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-2" aria-label="切り抜き候補">
                {candidates.map((c) => {
                  const isFocused = focused?.id === c.id;
                  return (
                    <li key={c.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => (isFocused ? toggleSelected(c.id) : setFocusId(c.id))}
                        aria-label={c.selected ? "選択中のシール" : "候補のシール"}
                        aria-pressed={c.selected}
                        className={`relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-soft transition ${
                          isFocused ? "ring-[3px] ring-lavender" : ""
                        } ${c.selected ? "" : "opacity-55"}`}
                      >
                        <StickerView src={c.url} alt="" />
                        {c.selected && (
                          <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-mint text-ink shadow-soft">
                            <CheckIcon size={14} />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {photoUrl && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowPhoto((v) => !v)}
                  className="btn-secondary h-10 px-4 text-sm"
                  aria-expanded={showPhoto}
                >
                  {showPhoto ? "写真をしまう" : "＋ 写真から自分で選ぶ"}
                </button>
                {showPhoto && (
                  <div className="mt-3">
                    <p className="text-sm text-ink-soft">
                      {cutterName === "blob"
                        ? "いまは自動の切り抜きが使えないので、タップした所を丸く切り取ります。"
                        : "シールにしたいものをタップ。"}
                    </p>
                    <div className="relative mt-2 overflow-hidden rounded-3xl bg-paper-deep">
                      <img
                        src={photoUrl}
                        alt="撮った写真。切り抜きたいところをタップ"
                        onClick={(e) => void onPhotoTap(e)}
                        className={`block max-h-[40dvh] w-full object-contain ${tapping ? "cursor-progress" : "cursor-crosshair"}`}
                      />
                      {tapping && (
                        <span
                          className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 animate-pulse-ring rounded-full bg-lavender"
                          style={{ left: `${tapping.x * 100}%`, top: `${tapping.y * 100}%` }}
                          aria-hidden
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {hint && (
              <p className="mt-3 rounded-2xl bg-white px-4 py-2.5 text-sm text-ink-soft shadow-soft" role="status">
                {hint}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#c2255c] shadow-soft">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={selectedCount === 0 || step === "saving"}
                className="btn-primary h-14 w-full text-lg"
              >
                <CheckIcon size={22} />
                {step === "saving" ? "貼ってる…" : `シール帳に貼る（${selectedCount}枚）`}
              </button>
              <button
                type="button"
                onClick={() => setStep("photo")}
                disabled={step === "saving"}
                className="h-11 text-sm font-bold text-ink-soft underline underline-offset-4"
              >
                写真を撮り直す
              </button>
            </div>
          </section>
        )}

        {step === "done" && saved && (
          <section className="animate-rise mt-8 flex flex-col items-center text-center">
            <div className="sticker-sheet relative w-full rounded-3xl px-4 pt-6 pb-4">
              <ul className="flex flex-wrap items-center justify-center gap-4">
                {saved.items.map((item, i) => (
                  <li
                    key={item.id}
                    className="w-[40%] max-w-[150px] animate-[stick_0.5s_cubic-bezier(0.2,0.9,0.3,1.2)_both]"
                    style={{ animationDelay: `${i * 120}ms` }}
                  >
                    <StickerView src={item.stickerUrl} alt={`${item.aiTitle}のシール`} rotation={item.rotation} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="-mt-6">
              <Michibi mood="happy" size={120} says={MICHIBI_LINES.saved} className="flex-col !items-center" />
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {saved.where === "cloud" ? "クラウドのシール帳に保存しました。" : "この端末のシール帳に保存しました。"}
            </p>
            <div className="mt-6 flex w-full flex-col gap-3">
              <Link href="/collection" className="btn-primary h-14 w-full text-lg">
                シール帳を見る
              </Link>
              <Link href="/map" className="btn-secondary h-12 w-full text-base">
                ほかの場所も見る
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
