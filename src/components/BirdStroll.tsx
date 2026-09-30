"use client";

/* eslint-disable @next/next/no-img-element -- local sprites */
import { useCallback, useEffect, useRef, useState } from "react";

import { michibiSrc, type BirdPose } from "@/lib/character";
import { WANDER_LINES } from "./map/MapBird";
import { SketchBubble } from "./sketch";

const BOOK_LINES = [
  "このシール、いい顔してる。",
  "ページ、めくってみる？",
  "テープがちょっと曲がってる。",
  "ここ、まだ空いてるよ。",
  "並べかえるの、楽しい。",
  "この手帳、だいぶ育ってきた。",
];
const TAP_LINES = ["わっ。", "なに？", "いっしょに見る？", "それ、いいね。"];
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** A bird strolling back and forth along the top of a page, muttering now and then. */
export function BirdStroll({ className = "" }: { className?: string }) {
  const [x, setX] = useState(10); // % of the strip
  const [pose, setPose] = useState<BirdPose>("side");
  const [flip, setFlip] = useState(false);
  const [says, setSays] = useState<string | null>(null);
  const xRef = useRef(10);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const say = useCallback((line: string) => {
    setSays(line);
    if (sayTimer.current) clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => setSays(null), 3800);
  }, []);

  const walkTo = useCallback((to: number, then?: () => void) => {
    const from = xRef.current;
    const duration = Math.max(900, Math.abs(to - from) * 60);
    const t0 = performance.now();
    busy.current = true;
    setFlip(to < from);
    setPose("walk");
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const v = from + (to - from) * k;
      xRef.current = v;
      setX(v);
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        busy.current = false;
        setPose("side");
        then?.();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (busy.current) return;
      const r = Math.random();
      if (r < 0.45) {
        walkTo(4 + Math.random() * 78, () => {
          if (Math.random() < 0.5) say(Math.random() < 0.6 ? pick(BOOK_LINES) : pick(WANDER_LINES));
        });
      } else if (r < 0.65) {
        setPose("hop");
        setTimeout(() => setPose("side"), 700);
      } else if (r < 0.8) {
        setPose("front");
      } else {
        say(pick(Math.random() < 0.5 ? BOOK_LINES : WANDER_LINES));
      }
    }, 4200);
    return () => clearInterval(t);
  }, [walkTo, say]);

  return (
    <div className={`relative h-[74px] w-full ${className}`} aria-hidden={!says}>
      <div className="absolute bottom-0" style={{ left: `${x}%` }}>
        {says && (
          <SketchBubble key={says} side="left" className="animate-peek absolute bottom-[calc(100%-6px)] left-[70%] w-max max-w-[190px]">
            {says}
          </SketchBubble>
        )}
        <button
          type="button"
          aria-label="小鳥"
          onClick={() => {
            setPose("happy");
            say(pick(TAP_LINES));
            setTimeout(() => setPose("side"), 1200);
          }}
        >
          <img
            src={michibiSrc(pose, "sm")}
            alt=""
            draggable={false}
            className={`h-12 w-12 select-none ${pose === "walk" ? "bird-waddle" : pose === "hop" ? "bird-hop" : "bird-breathe"}`}
            style={{ ["--flip" as string]: flip ? "-1" : "1" }}
          />
        </button>
      </div>
    </div>
  );
}
