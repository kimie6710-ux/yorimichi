"use client";

import { useId, useMemo } from "react";

import { hashSeed, sketchPath, type SketchOpts } from "./path";
import { useSize } from "./useSize";

export type SketchTone = "white" | "paper" | "sky" | "butter" | "sticker" | "none";

export const TONE_FILL: Record<SketchTone, string> = {
  white: "var(--color-card)",
  paper: "var(--color-paper-deep)",
  sky: "var(--color-sky)",
  butter: "var(--color-butter-soft)",
  sticker: "var(--color-butter)",
  none: "none",
};

export interface SketchOutlineProps extends SketchOpts {
  tone?: SketchTone;
  /** Stable seed; defaults to a per-instance id. */
  seed?: string | number;
  /** Second, offset stroke — reads as a line traced over twice. */
  double?: boolean;
  strokeWidth?: number;
  stroke?: string;
  /** Extend the frame past the box (e.g. a sheet whose bottom edge is off-screen). */
  bleed?: { top?: number; right?: number; bottom?: number; left?: number };
  className?: string;
}

/**
 * Absolutely-positioned SVG frame drawn behind the content of its parent.
 * The parent needs `relative isolate`; content stays normal HTML.
 */
export function SketchOutline({
  tone = "white",
  seed,
  double = true,
  strokeWidth = 2.2,
  stroke = "var(--color-ink)",
  bleed,
  radius,
  wobble,
  className = "",
}: SketchOutlineProps) {
  const autoId = useId();
  const s = hashSeed(seed ?? autoId);
  const [ref, size] = useSize<SVGSVGElement>();
  const b = { top: 0, right: 0, bottom: 0, left: 0, ...bleed };

  const paths = useMemo(() => {
    if (!size) return null;
    const w = size.w, h = size.h;
    const inset = strokeWidth + 0.5;
    return {
      main: sketchPath(w, h, s, { radius, wobble, inset }),
      echo: double ? sketchPath(w, h, s + 7, { radius, wobble: (wobble ?? 1.6) * 1.2, inset: inset + 0.4 }) : "",
    };
  }, [size, s, radius, wobble, strokeWidth, double]);

  return (
    <svg
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute -z-10 overflow-visible ${className}`}
      style={{ top: -b.top, right: -b.right, bottom: -b.bottom, left: -b.left, width: `calc(100% + ${b.left + b.right}px)`, height: `calc(100% + ${b.top + b.bottom}px)` }}
    >
      {paths && (
        <>
          <path d={paths.main} fill={TONE_FILL[tone]} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          {double && (
            <path
              d={paths.echo}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth * 0.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45}
              transform="translate(0.7 0.9)"
            />
          )}
        </>
      )}
    </svg>
  );
}
