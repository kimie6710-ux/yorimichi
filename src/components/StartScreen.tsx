"use client";

/* eslint-disable @next/next/no-img-element -- local sprites */
import { useEffect, useState } from "react";

import { APP_TAGLINE } from "@/lib/config";
import { michibiSrc, type BirdPose } from "@/lib/character";
import { SketchBubble, SketchButton, Tape } from "./sketch";

/** Stickers loosely stuck around the title, like the cover of a notebook. */
const COVER_STICKERS: { src: string; className: string; rot: number }[] = [
  { src: "/deco/bird-perch.png", className: "top-[4%] left-[5%] w-[30%] max-w-[150px]", rot: -6 },
  { src: "/deco/tape-stripe.png", className: "top-[2%] right-[-6%] w-[46%]", rot: 8 },
  { src: "/deco/bird-sleepy.png", className: "top-[9%] right-[6%] w-[22%] max-w-[110px]", rot: 7 },
  { src: "/deco/tape-yellowdots.png", className: "bottom-[24%] left-[-8%] w-[34%]", rot: -10 },
];

/** The first thing you see: a notebook cover with the bird walking across it. */
export function StartScreen({ onStart }: { onStart: () => void }) {
  const [x, setX] = useState(-20);
  const [pose, setPose] = useState<BirdPose>("walk");
  const [says, setSays] = useState<string | null>(null);

  // The bird walks in from the left, stops under the title and says hello.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 2600);
      setX(-20 + 58 * (1 - (1 - k) ** 2));
      if (k < 1) raf = requestAnimationFrame(step);
      else {
        setPose("happy");
        setSays("いっしょに歩こ。");
      }
    };
    const start = setTimeout(() => (raf = requestAnimationFrame(step)), 500);
    return () => {
      clearTimeout(start);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="book-cream fixed inset-0 z-[80] mx-auto flex max-w-[480px] flex-col overflow-hidden animate-[fade_0.4s_ease-out]">
      {COVER_STICKERS.map((s) => (
        <img
          key={s.src}
          src={s.src}
          alt=""
          aria-hidden
          className={`pointer-events-none absolute select-none ${s.className}`}
          style={{ transform: `rotate(${s.rot}deg)`, filter: "drop-shadow(0 1.5px 1.5px rgb(34 32 28 / 0.18))" }}
        />
      ))}

      <div className="relative flex flex-1 flex-col items-center justify-center px-8 pt-[18vh] text-center">
        <div className="relative">
          <Tape seed="cover-title" className="!-top-5 !w-20" />
          <h1 className="text-[56px] leading-none tracking-[0.12em]">よるみち</h1>
        </div>
        <p className="mt-5 text-lg">{APP_TAGLINE}</p>
      </div>

      {/* the bird walks across the bottom of the cover */}
      <div className="relative h-[120px]">
        <div className="absolute bottom-2" style={{ left: `${x}%` }}>
          {says && (
            <SketchBubble side="left" className="animate-peek absolute bottom-[calc(100%-6px)] left-[35%] w-max max-w-[170px]">
              {says}
            </SketchBubble>
          )}
          <img
            src={michibiSrc(pose, "md")}
            alt=""
            className={`h-24 w-24 select-none ${pose === "walk" ? "bird-waddle" : "bird-breathe"}`}
            style={{ ["--flip" as string]: "1" }}
          />
        </div>
      </div>

      <div className="px-10 pb-[max(40px,env(safe-area-inset-bottom))]">
        <SketchButton size="lg" block onClick={onStart}>
          はじめる
        </SketchButton>
      </div>
    </div>
  );
}
