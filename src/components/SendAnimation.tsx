"use client";

/* eslint-disable @next/next/no-img-element -- local sprites / sticker PNGs */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { michibiSrc } from "@/lib/character";
import type { Sticker } from "@/lib/types";
import { SketchBubble, SketchButton } from "./sketch";
import { StickerView } from "./StickerView";

type Stage = "lift" | "fold" | "fly" | "arrived";

// The flight path, in the 360×560 stage below.
const FLIGHT = "M180 330 C 120 260, 60 230, 110 170 S 260 150, 250 90 S 330 30, 420 -40";

/**
 * Sending a sticker to someone you don't know: the sticker lifts off the page,
 * folds into a paper plane and flies off along a dotted line.
 */
export function SendAnimation({ sticker, onClose }: { sticker: Sticker; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("lift");

  useEffect(() => {
    const t = [
      setTimeout(() => setStage("fold"), 900),
      setTimeout(() => setStage("fly"), 1500),
      setTimeout(() => setStage("arrived"), 3300),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="paper fixed inset-0 z-[70] mx-auto flex max-w-[480px] animate-[fade_0.25s_ease-out] flex-col items-center justify-center overflow-hidden" role="dialog" aria-modal="true" aria-label="誰かに送る">
      <div className="relative h-[560px] w-[360px] max-w-full">
        {/* dotted trail, drawn as the plane flies */}
        <svg viewBox="0 0 360 560" className={`absolute inset-0 h-full w-full overflow-visible transition-opacity duration-700 ${stage === "arrived" ? "opacity-25" : ""}`} aria-hidden>
          <defs>
            <mask id="trail-reveal">
              <path d={FLIGHT} pathLength={100} fill="none" stroke="#fff" strokeWidth="10" className={stage === "fly" || stage === "arrived" ? "send-trail-draw" : "send-trail-hidden"} />
            </mask>
          </defs>
          <path d={FLIGHT} pathLength={100} fill="none" stroke="var(--color-sky-deep)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0.1 2.2" mask="url(#trail-reveal)" />
        </svg>

        {/* the sticker lifts, wobbles and folds away */}
        {(stage === "lift" || stage === "fold") && (
          <div className={`absolute top-[210px] left-1/2 w-[46%] ${stage === "lift" ? "send-lift" : "send-fold"}`}>
            <StickerView src={sticker.imageUrl} alt={sticker.label} rotation={sticker.rotation} lift />
          </div>
        )}

        {/* the paper plane */}
        {(stage === "fold" || stage === "fly") && (
          <img
            src="/ui/i-send.png"
            alt=""
            className={`absolute top-0 left-0 h-12 w-auto ${stage === "fold" ? "send-plane-appear" : "send-plane-fly"}`}
            style={{ offsetPath: `path("${FLIGHT}")`, offsetRotate: "auto 45deg" }}
          />
        )}

        {stage === "arrived" && (
          <div className="absolute top-[130px] left-1/2 w-[70%] -translate-x-1/2 animate-peek text-center">
            <img src="/ui/i-mail.png" alt="" className="mx-auto h-12 w-auto" />
            <p className="mt-4 font-hand text-[24px]">どこかの誰かに届いたよ。</p>
            <p className="mt-2 text-sm text-ink-soft">「{sticker.label}」が、知らない街の誰かの手帳へ。</p>
          </div>
        )}

        {/* the bird watches it go */}
        <div className="absolute bottom-4 left-4 flex items-end gap-2">
          <img src={michibiSrc(stage === "arrived" ? "happy" : "flap", "md")} alt="" className="h-20 w-20 animate-bob" />
          <SketchBubble key={stage} side="left" className="animate-peek mb-8">
            {stage === "arrived" ? "何か返ってくるかもね。" : "いってらっしゃい。"}
          </SketchBubble>
        </div>
      </div>

      {stage === "arrived" && (
        <SketchButton size="lg" className="animate-peek mt-2 w-[70%]" onClick={onClose}>
          手帳にもどる
        </SketchButton>
      )}
    </div>,
    document.body,
  );
}
