"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { MichibiMood } from "@/lib/character";
import { MICHIBI_LINES } from "@/lib/character";
import { Michibi } from "./Michibi";

const FLOATING = [
  { icon: "🍴", className: "top-[12%] left-[12%]", delay: "0s" },
  { icon: "📚", className: "top-[6%] right-[24%]", delay: "0.6s" },
  { icon: "🌳", className: "top-[20%] right-[7%]", delay: "1.2s" },
  { icon: "☕️", className: "top-[28%] left-[4%]", delay: "1.8s" },
  { icon: "⛩️", className: "top-[34%] right-[18%]", delay: "0.9s" },
];

/** Loading between the Places fetch and the AI interpretation. */
export function LoadingView({ stage, query }: { stage: "places" | "ai"; query: string }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const t = setInterval(() => setLineIndex((i) => (i + 1) % MICHIBI_LINES.loading.length), 2600);
    return () => clearInterval(t);
  }, []);

  // Jumps at real stage changes, creeps in between (never claims 100% early).
  useEffect(() => {
    const cap = stage === "places" ? 34 : 92;
    const t = setInterval(() => setProgress((p) => (p < cap ? p + (cap - p) * 0.08 : p)), 300);
    return () => clearInterval(t);
  }, [stage]);

  const steps = [
    "近くの場所を見て回っています",
    `「${query}」の寄り道先を探しています`,
    "よさそうなところを選んでいます",
  ];
  const current = stage === "places" ? 0 : progress > 62 ? 2 : 1;

  return (
    <div
      className="aurora relative flex h-full flex-col items-center justify-center overflow-hidden px-6"
      role="status"
      aria-live="polite"
    >
      {FLOATING.map((f) => (
        <span
          key={f.icon}
          aria-hidden
          className={`absolute flex h-14 w-14 animate-float items-center justify-center rounded-full bg-white/75 text-2xl shadow-soft backdrop-blur ${f.className}`}
          style={{ animationDelay: f.delay }}
        >
          {f.icon}
        </span>
      ))}

      <div className="relative flex flex-col items-center">
        <p
          key={lineIndex}
          className="animate-peek mb-1 max-w-[260px] rounded-2xl bg-white px-4 py-2.5 text-center font-hand text-base shadow-soft"
        >
          {MICHIBI_LINES.loading[lineIndex]}
        </p>
        <Michibi
          mood={stage === "places" ? "wander" : "sleepy"}
          size={168}
          animate={stage === "places" ? "wander" : "bob"}
        />
      </div>

      <div className="relative mt-4 w-full max-w-xs">
        <p className="text-center text-xl font-bold">みちびが街を読み込んでいます…</p>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/80" aria-hidden>
          <div
            className="h-full animate-progress rounded-full transition-[width] duration-500"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #b794ff, #4dd0ff, #7ee7dd, #b794ff)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>
        <ol className="mt-5 space-y-3">
          {steps.map((label, i) => (
            <li
              key={label}
              className={`flex items-center gap-3 text-sm ${i <= current ? "text-ink" : "text-ink-mute"}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  i < current
                    ? "bg-mint text-ink"
                    : i === current
                      ? "bg-white shadow-soft"
                      : "bg-white/60 ring-1 ring-gray-300"
                }`}
                aria-hidden
              >
                {i < current ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="m5 12 5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : i === current ? (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-lavender" />
                ) : null}
              </span>
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function MessageView({
  mood,
  says,
  detail,
  action,
  secondary,
}: {
  mood: MichibiMood;
  says: string;
  detail?: string;
  action?: { label: string; onClick?: () => void; href?: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <div className="aurora flex h-full flex-col items-center justify-center px-6 text-center" role="status">
      <Michibi mood={mood} size={132} animate="none" />
      <p className="mt-4 text-xl font-bold">{says}</p>
      {detail && <p className="mt-2 max-w-xs text-sm text-ink-soft">{detail}</p>}
      <div className="mt-6 flex flex-col items-center gap-3">
        {action &&
          (action.href ? (
            <Link href={action.href} className="btn-primary h-12 px-7 text-base">
              {action.label}
            </Link>
          ) : (
            <button type="button" onClick={action.onClick} className="btn-primary h-12 px-7 text-base">
              {action.label}
            </button>
          ))}
        {secondary && (
          <Link href={secondary.href} className="btn-secondary h-11 px-6 text-sm">
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}
