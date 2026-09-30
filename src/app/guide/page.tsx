"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn icon sprites */
import { useRef, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { michibiSrc, type BirdPose } from "@/lib/character";
import { APP_NAME } from "@/lib/config";
import { PaperFrame, SketchButton, SketchLinkButton, type FrameKind } from "@/components/sketch";

interface Page {
  icon: string;
  title: string;
  lines: string[];
  frame: FrameKind;
  bird: BirdPose;
}

const PAGES: Page[] = [
  {
    icon: "/ui/n-map.png",
    title: "地図で、気になる一言を",
    lines: ["地図には、お店の名前じゃなく", "みちびの一言が浮かんでいます。", "ピンときたものを選んで。"],
    frame: "fold",
    bird: "front",
  },
  {
    icon: "/ui/n-compass.png",
    title: "着くまで、ひみつ",
    lines: ["どんな場所かは、着いてのお楽しみ。", "線と矢印のとおりに歩くだけ。", "角が近づくと「40m先 右へ」。"],
    frame: "dash",
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
    lines: ["写したものが、形のままシールに。", "名前はみちびが考えます。", "直した名前は、次から覚えます。"],
    frame: "tape",
    bird: "flap",
  },
  {
    icon: "/ui/i-send.png",
    title: "残す・送る・とっておく",
    lines: ["その場所に置いて、次の人へ。", "知らない誰かに送る。", "手帳にしまっておく。"],
    frame: "stack",
    bird: "happy",
  },
  {
    icon: "/ui/n-book.png",
    title: "手帳に、好きに貼る",
    lines: ["ページをめくって、どこに貼ってもいい。", "端で止めると、となりのページへ。", "テープやみちびのシールも貼れます。"],
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
        <h1 className="font-hand text-[26px]">{APP_NAME}のつかいかた</h1>
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
          <PaperFrame kind={page.frame} className="w-full">
            <div className="flex flex-col items-center px-1 py-3 text-center">
              <img src={page.icon} alt="" className="h-12 w-auto" draggable={false} />
              <h2 className="relative isolate mt-3 px-1 text-[22px] leading-snug">
                <img src="/ui/marker-yellow.png" alt="" aria-hidden className="absolute inset-x-0 bottom-0.5 -z-10 h-3 w-full" />
                {page.title}
              </h2>
              <div className="mt-3 flex flex-col gap-1 text-[16px] leading-relaxed">
                {page.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            </div>
          </PaperFrame>
        </div>
        <img src={michibiSrc(page.bird, "sm")} alt="みちび" className="bird-breathe mt-4 h-16 w-16" draggable={false} />
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
