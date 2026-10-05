"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn icon sprites */
import { useRef, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { michibiSrc, type BirdPose } from "@/lib/character";
import { APP_NAME } from "@/lib/config";
import { PaperFrame, SketchButton, SketchLinkButton, type FrameKind } from "@/components/sketch";

interface Page {
  /** An icon, or the bird itself on the page that introduces it. */
  icon: string | "michibi";
  title: string;
  lines: string[];
  frame: FrameKind;
  bird: BirdPose;
}

const PAGES: Page[] = [
  {
    icon: "michibi",
    title: "ぼく、みちび！",
    lines: [
      "よりみちを見つける、小さな鳥だよ。",
      "地図のひとことは、\nぼくの勝手な見方だよ。",
      "気になるものを見つけると、\nついふらっと寄り道しちゃう。",
      "ほうっておくと、\nひとりでどっか散歩してるかも。",
    ],
    frame: "dash",
    bird: "happy",
  },
  {
    icon: "/ui/n-map.png",
    title: "地図で、気になるひとことを",
    lines: ["地図の「？」は、店名のかわりに", "みちびのひとことつき。", "ピンときたものを選んで。"],
    frame: "fold",
    bird: "front",
  },
  {
    icon: "/ui/n-compass.png",
    title: "着くまで、ひみつ",
    lines: ["どんな場所かは、着いてのお楽しみ。", "線と矢印のとおりに歩くだけ。"],
    frame: "stack",
    bird: "walk",
  },
  {
    icon: "/ui/i-search.png",
    title: "あなたが、見つける",
    lines: ["着いたら、気になったものを探して。", "看板でも、影でも、落ち葉でも。", "誰かのシールが残っていることも。"],
    frame: "grid",
    bird: "side",
  },
  {
    icon: "/ui/n-camera.png",
    title: "撮ると、シールになる",
    lines: ["写したものが、形のままシールに。", "名前は、あなたの見方で。", "みちびのひとことと、比べてみて。"],
    frame: "tape",
    bird: "flap",
  },
  {
    icon: "/ui/i-send.png",
    title: "置く・送る・しまう",
    lines: ["その場所に置いて、次の人へ。", "知らない誰かに送る。", "ボックスにしまっておく。"],
    frame: "stack",
    bird: "happy",
  },
  {
    icon: "/ui/n-book.png",
    title: "ボックスから、手帳へ",
    lines: ["作ったシールは、まずボックスへ。", "好きなページに、何回でも貼れる。", "テープやみちびで飾るのも自由。"],
    frame: "fold",
    bird: "perch",
  },
];

/** 使い方: one card at a time, flipped like the notebook. No scrolling. */
export default function GuidePage() {
  const [i, setI] = useState(0);
  const start = useRef<number | null>(null);
  const page = PAGES[i];
  const last = i === PAGES.length - 1;
  const go = (d: number) => setI((n) => Math.min(PAGES.length - 1, Math.max(0, n + d)));

  return (
    <main className="paper flex h-[calc(100dvh-76px-env(safe-area-inset-bottom))] flex-col overflow-hidden px-4 pt-[max(10px,env(safe-area-inset-top))] pb-3">
      <header className="flex shrink-0 items-center gap-3">
        <BackButton fallback="/me" />
        <h1 className="font-hand text-[28px]">{APP_NAME}のつかいかた</h1>
      </header>

      <section
        className="flex min-h-0 flex-1 flex-col items-center justify-center"
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerUp={(e) => {
          if (start.current === null) return;
          const dx = e.clientX - start.current;
          start.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        aria-live="polite"
      >
        <div key={i} className="animate-rise w-full max-w-[400px]">
          <PaperFrame kind={page.frame} tape={page.frame === "fold" || page.frame === "tape" ? `guide-${i}` : undefined} className="w-full">
            <div className="flex flex-col items-center px-1 py-3 text-center">
              {page.icon === "michibi" ? (
                <img src={michibiSrc(page.bird, "sm")} alt="みちび" className="bird-breathe h-24 w-24" draggable={false} />
              ) : (
                <img src={page.icon} alt="" className="h-12 w-auto" draggable={false} />
              )}
              <h2 className="relative isolate mt-3 px-1 text-[22px] leading-snug">
                <img src="/ui/marker-yellow.png" alt="" aria-hidden className="absolute inset-x-0 bottom-0.5 -z-10 h-3 w-full" />
                {page.title}
              </h2>
              <div className={`mt-3 flex flex-col text-[16px] leading-relaxed ${page.icon === "michibi" ? "gap-3" : "gap-1"}`}>
                {page.lines.map((l) => (
                  <p key={l} className="whitespace-pre-line">
                    {l}
                  </p>
                ))}
              </div>
            </div>
          </PaperFrame>
        </div>
        {page.icon !== "michibi" && <img src={michibiSrc(page.bird, "sm")} alt="みちび" className="bird-breathe mt-4 h-16 w-16" draggable={false} />}
      </section>

      <div className="shrink-0">
        <div className="mb-3 flex justify-center gap-2" aria-label={`${i + 1} / ${PAGES.length}`}>
          {PAGES.map((p, n) => (
            <button
              key={p.title}
              type="button"
              aria-label={`${n + 1}ページ目`}
              onClick={() => setI(n)}
              className="h-3 w-3 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(/ui/dot-${n === i ? "yellow" : "cream"}.png)` }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <SketchButton variant="plain" size="sm" className="shrink-0" onClick={() => go(-1)} disabled={i === 0}>
            もどる
          </SketchButton>
          {last ? (
            <SketchLinkButton href="/" size="lg" className="flex-1">
              歩いてみる
            </SketchLinkButton>
          ) : (
            <SketchButton size="lg" className="flex-1" onClick={() => go(1)}>
              つぎへ
            </SketchButton>
          )}
        </div>
      </div>
    </main>
  );
}
