"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Michibi } from "@/components/Michibi";
import { useRouter } from "next/navigation";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { SpotCard } from "@/components/SpotCard";
import { LoadingView, MessageView } from "@/components/StateViews";
import { MICHIBI_LINES } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";

export default function MapPage() {
  const { status, result, error, query, retry } = useSearch();

  if (status === "places" || status === "ai") {
    return (
      <main className="h-[calc(100dvh-76px-env(safe-area-inset-bottom))]">
        <LoadingView stage={status} query={query} />
      </main>
    );
  }

  if (status === "error" && error) {
    return (
      <main className="h-[calc(100dvh-76px-env(safe-area-inset-bottom))]">
        <MessageView
          mood={error.kind === "empty" ? "lazy" : "sleepy"}
          says={error.kind === "empty" ? MICHIBI_LINES.empty : error.message}
          detail={
            error.kind === "config"
              ? "APIキーの設定を確認してください（README参照）。開発中は NEXT_PUBLIC_USE_MOCK_DATA=true でも動かせます。"
              : error.kind === "empty"
                ? "半径800m以内にスポットが見つかりませんでした。少し移動してから、もう一度どうぞ。"
                : undefined
          }
          action={error.kind === "config" ? { label: "ホームへ", href: "/" } : { label: "もう一回探す", onClick: retry }}
          secondary={error.kind === "config" ? undefined : { label: "ことばを変える", href: "/" }}
        />
      </main>
    );
  }

  if (!result) {
    return (
      <main className="h-[calc(100dvh-76px-env(safe-area-inset-bottom))]">
        <MessageView
          mood="lazy"
          says="まだ寄り道を探してないよ。"
          detail="ひとこと入れると、この地図に寄り道先が並びます。"
          action={{ label: "ひとこと入れる", href: "/" }}
        />
      </main>
    );
  }

  return <ResultMap />;
}

function ResultMap() {
  const { result } = useSearch();
  const spots = useMemo(() => result?.spots ?? [], [result]);
  const [selectedId, setSelectedId] = useState<string | null>(spots[0]?.place.placeId ?? null);
  const router = useRouter();
  const goThere = (placeId: string) => router.push(`/visit/${encodeURIComponent(placeId)}`);
  // みちび sits next to the spot she finds most surprising.
  const mascotAt = useMemo(() => {
    const top = [...spots].sort((a, b) => b.recommendation.surpriseScore - a.recommendation.surpriseScore)[0];
    return top?.place.location ?? null;
  }, [spots]);
  const railRef = useRef<HTMLDivElement>(null);
  const programmaticScroll = useRef(false);

  const markers: MapMarker[] = useMemo(
    () =>
      spots.map((s, i) => ({
        id: s.place.placeId,
        position: s.place.location,
        label: s.recommendation.title,
        tone: s.recommendation.kind,
        index: i + 1,
      })),
    [spots],
  );

  const dots = useMemo(() => {
    const picked = new Set(spots.map((s) => s.place.placeId));
    return (result?.nearby ?? [])
      .filter((p) => !picked.has(p.placeId))
      .map((p) => ({ id: p.placeId, position: p.location, name: p.name }));
  }, [result, spots]);

  const selectFromMap = useCallback((id: string) => {
    setSelectedId(id);
    const el = railRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
    if (el) {
      programmaticScroll.current = true;
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      window.setTimeout(() => (programmaticScroll.current = false), 600);
    }
  }, []);

  // Sync selection with the card snapped in the carousel (mobile).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (programmaticScroll.current) return;
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = best?.target.getAttribute("data-card");
        if (id) setSelectedId(id);
      },
      { root: rail, threshold: [0.6, 0.9] },
    );
    rail.querySelectorAll("[data-card]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [spots]);

  if (!result) return null;
  const selected = spots.find((s) => s.place.placeId === selectedId) ?? spots[0];

  return (
    <main className="relative h-[calc(100dvh-76px-env(safe-area-inset-bottom))] overflow-hidden overscroll-none">
      <section className="relative h-full">
        <MapView
          origin={result.origin}
          markers={markers}
          dots={dots}
          selectedId={selectedId}
          onSelect={selectFromMap}
          bottomInset={280}
          mascotAt={mascotAt}
          className="h-full w-full"
        />

        {/* Header overlay: what was shifted + mascot comment */}
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex items-center gap-2">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 rounded-full bg-white py-2 pr-4 pl-3 text-sm font-bold shadow-soft"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate">「{result.query}」の寄り道</span>
            </Link>
          </div>
          {result.interpretedIntent && result.interpretedIntent.expanded.length > 0 && (
            <p className="pointer-events-auto mt-2 w-fit max-w-full truncate rounded-full bg-white/90 px-3 py-1 text-sm text-ink-soft shadow-soft">
              みちびの連想：{result.interpretedIntent.expanded.slice(0, 5).join("・")}
            </p>
          )}
          {result.notice && (
            <p className="pointer-events-auto mt-2 rounded-2xl bg-star px-4 py-2 text-sm font-bold text-ink shadow-soft" role="status">
              {result.notice}
            </p>
          )}
        </div>

        {/* Mobile: mascot + card carousel */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="px-4 pb-2">
            <Michibi
              mood={result.mode === "fallback" ? "lazy" : "found"}
              size={56}
              says={selected ? selected.recommendation.michibiLine : result.michibiComment}
            />
          </div>
          <div
            ref={railRef}
            className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[7%] pb-4"
          >
            {spots.map((s, i) => (
              <div
                key={s.place.placeId}
                data-card={s.place.placeId}
                className="w-[86%] max-w-[380px] shrink-0 snap-center"
              >
                <SpotCard
                  spot={s}
                  index={i}
                  selected={s.place.placeId === selectedId}
                  onFocus={() => setSelectedId(s.place.placeId)}
                  onGo={() => goThere(s.place.placeId)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}
