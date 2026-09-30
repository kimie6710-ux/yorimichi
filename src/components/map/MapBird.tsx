"use client";

/* eslint-disable @next/next/no-img-element -- local sprites */
import { useCallback, useEffect, useRef, useState } from "react";

import { SketchBubble } from "@/components/sketch";
import { michibiSrc, type BirdPose } from "@/lib/character";
import type { LatLng, MapSpot } from "@/lib/types";

/** The map draws the bird a fixed few pixels to the right of this point. */
const SIDE_STEP = 0;
const SAY_MS = 4200;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "こんな時間の道も、悪くない。";
  if (h < 11) return "おはよう。どこ寄ってく？";
  if (h < 16) return "今日はどこ寄ってく？";
  if (h < 19) return "夕方の道、けっこう好き。";
  return "夜の道も悪くないよ。";
}

const IDLE_LINES = ["なんかあるかも。", "こっち、こっち。", "ちょっと寄り道しない？", "私も気になってた。", "足もと、見てる？"];
const TAP_LINES = ["わっ。", "なに？", "つつかないで〜。", "いっしょに行く？", "それ、いいね。"];
/** Things it mutters when left alone and wandering off by itself. */
export const WANDER_LINES = [
  "電柱と目が合った。",
  "ポストに話しかけたら、無視された。",
  "今、雲がひとつ減った。",
  "右足から歩く日。",
  "この道、さっきより長くない？",
  "看板の「営業中」、ずっと営業中。",
  "自販機がこっち見てる。",
  "ちょっと角を数えてくる。",
  "マンホールのふた、全部ちがう顔。",
  "あの猫、たぶん町内会長。",
  "向こうの信号、青の気分じゃない。",
  "落ち葉を一枚だけ持って帰る。",
  "なんとなく、左の道のほうが好き。",
  "さっきの影、わたしより大きかった。",
  "ひまだから、地図のはじっこ見てくる。",
];
const WANDER_AFTER_MS = 22000;
const SLEEP_AFTER_MS = 120000;

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** Somewhere open on the map: inside the area the spots cover, but away from every marker. */
function emptySpot(spots: MapSpot[], here: LatLng | null): LatLng {
  const lats = spots.map((s) => s.place.location.latitude);
  const lngs = spots.map((s) => s.place.location.longitude);
  // Stay well inside the area the spots cover (the map is fitted to it), so it never walks off screen.
  const s0 = Math.min(...lats), n0 = Math.max(...lats), w0 = Math.min(...lngs), e0 = Math.max(...lngs);
  const inset = 0.15;
  const box = { s: s0 + (n0 - s0) * inset, n: n0 - (n0 - s0) * inset, w: w0 + (e0 - w0) * inset, e: e0 - (e0 - w0) * inset };
  const far = (p: LatLng) => spots.every((s) => Math.hypot(s.place.location.latitude - p.latitude, s.place.location.longitude - p.longitude) > 0.0005);
  for (let i = 0; i < 30; i++) {
    const p = { latitude: box.s + Math.random() * (box.n - box.s), longitude: box.w + Math.random() * (box.e - box.w) };
    if (far(p)) return p;
  }
  return here ?? spots[0].place.location;
}

/**
 * A little bird that lives on the map: walks over to the spot you're looking
 * at, hops around while it waits, and says something now and then.
 */
export function useMapBird(spots: MapSpot[], selected: MapSpot | null, origin: LatLng | null) {
  const [pos, setPos] = useState<LatLng | null>(null);
  const [pose, setPose] = useState<BirdPose>("front");
  const [flip, setFlip] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  const posRef = useRef<LatLng | null>(null);
  const walking = useRef(false);
  const lastAction = useRef(0);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Where it's walking: the spot you picked, or somewhere it wandered off to. */
  const [target, setTarget] = useState<{ at: LatLng; line: string | null; wander: boolean } | null>(null);
  const lastTouch = useRef(0);

  useEffect(() => {
    if (!selected) return;
    lastTouch.current = performance.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the spot the person picked
    setTarget({ at: selected.place.location, line: selected.copy?.birdLine || null, wander: false });
  }, [selected]);

  const say = useCallback((line: string) => {
    setSays(line);
    if (sayTimer.current) clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => setSays(null), SAY_MS);
  }, []);

  // Start next to the person, then say hello.
  useEffect(() => {
    if (posRef.current || !origin) return;
    const start = { latitude: origin.latitude, longitude: origin.longitude + SIDE_STEP };
    posRef.current = start;
    setPos(start);
    const t = setTimeout(() => say(greeting()), 900);
    return () => clearTimeout(t);
  }, [origin, say]);

  // Walk to the target.
  useEffect(() => {
    const from = posRef.current;
    if (!from || !target) return;
    const to = { latitude: target.at.latitude, longitude: target.at.longitude + SIDE_STEP };
    const dist = Math.hypot(to.latitude - from.latitude, to.longitude - from.longitude);
    if (dist < 0.00002) return;
    // Wandering is a slow stroll; going to a picked spot is a quick trot.
    const duration = target.wander ? Math.min(9000, Math.max(3500, dist * 2200000)) : Math.min(3800, Math.max(1100, dist * 900000));
    const t0 = performance.now();
    let raf = 0;
    walking.current = true;
    setFlip(to.longitude < from.longitude);
    setPose("walk");
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = { latitude: from.latitude + (to.latitude - from.latitude) * e, longitude: from.longitude + (to.longitude - from.longitude) * e };
      posRef.current = p;
      setPos(p);
      if (k < 1) {
        raf = requestAnimationFrame(step);
        return;
      }
      walking.current = false;
      lastAction.current = performance.now();
      if (target.wander) {
        setPose("front");
        if (target.line) say(target.line);
        return;
      }
      setFlip(true); // turn to face the spot on its left
      setPose("flap");
      say(target.line || pick(IDLE_LINES));
      setTimeout(() => setPose((p) => (p === "flap" ? "side" : p)), 1100);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      walking.current = false;
    };
  }, [target, say]);

  // Little things while waiting: hop, look around, talk, doze off.
  useEffect(() => {
    if (!spots.length) return;
    const t = setInterval(() => {
      if (walking.current) return;
      const idle = performance.now() - lastTouch.current;
      if (idle > SLEEP_AFTER_MS) {
        setPose("sleepy");
        if (Math.random() < 0.25) say("……むにゃ。");
        return;
      }
      if (idle > WANDER_AFTER_MS && Math.random() < 0.6) {
        // Left alone: go for a little walk on its own, muttering something odd.
        const at = emptySpot(spots, posRef.current);
        say(pick(["ちょっと散歩してくる。", "ひまだから歩いてくる。", "すぐ戻る。"]));
        setTimeout(() => setTarget({ at, line: pick(WANDER_LINES), wander: true }), 1200);
        return;
      }
      const r = Math.random();
      if (r < 0.3) {
        setPose("hop");
        setTimeout(() => setPose("side"), 700);
      } else if (r < 0.55) {
        setFlip((f) => !f);
        setPose("side");
      } else if (r < 0.75) {
        const other = spots[Math.floor(Math.random() * spots.length)];
        const n = spots.indexOf(other) + 1;
        say(Math.random() < 0.5 ? pick(IDLE_LINES) : `${n}番、気にならない？`);
      } else {
        setPose("front");
      }
    }, 6500);
    return () => clearInterval(t);
  }, [spots, say]);

  const tap = useCallback(() => {
    lastAction.current = performance.now();
    lastTouch.current = performance.now();
    setPose("happy");
    say(pick(TAP_LINES));
    setTimeout(() => setPose("side"), 1200);
  }, [say]);

  return { pos, says, node: pos ? <BirdSprite pose={pose} flip={flip} onTap={tap} /> : null };
}

/** The bird itself on the map (its words are shown in a corner, not over the spots). */
function BirdSprite({ pose, flip, onTap }: { pose: BirdPose; flip: boolean; onTap: () => void }) {
  return (
    <button type="button" onClick={onTap} aria-label="小鳥" className="block">
      <img
        src={michibiSrc(pose, "sm")}
        alt=""
        draggable={false}
        className={`h-12 w-12 select-none ${pose === "walk" ? "bird-waddle" : pose === "hop" ? "bird-hop" : pose === "sleepy" ? "" : "bird-breathe"}`}
        style={{ ["--flip" as string]: flip ? "-1" : "1" }}
      />
    </button>
  );
}

/** What the bird says, pinned to the top-left corner of the map. */
export function BirdSays({ says }: { says: string | null }) {
  if (!says) return null;
  return (
    <div className="pointer-events-none flex items-end gap-1" role="status" aria-live="polite">
      <img src={michibiSrc("side", "sm")} alt="" className="h-9 w-9 shrink-0" />
      <SketchBubble key={says} side="left" className="animate-peek mb-2 max-w-[210px]">
        {says}
      </SketchBubble>
    </div>
  );
}
