"use client";

import Link from "next/link";
import type React from "react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { hashSeed, sketchEllipse, sketchLine } from "./path";
import { SketchOutline, type SketchTone } from "./SketchOutline";
import { useSize } from "./useSize";

export { SketchOutline, type SketchTone } from "./SketchOutline";

/* ───────── Card / Section ───────── */

type Pad = "none" | "sm" | "md" | "lg";
const PAD: Record<Pad, string> = { none: "", sm: "p-3", md: "p-4", lg: "p-5" };

/** A loose piece of paper: organic shape, no black frame (outline only when asked), optional tape. */
export function SketchCard({
  tone = "white",
  pad = "md",
  seed,
  radius = 16,
  outline = false,
  tape,
  className = "",
  children,
  as: Tag = "div",
  ...rest
}: {
  tone?: SketchTone;
  pad?: Pad;
  seed?: string | number;
  radius?: number;
  outline?: boolean;
  tape?: (typeof WASHI)[number] | "blue" | "auto";
  as?: "div" | "article" | "section" | "li";
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <Tag className={`relative isolate ${PAD[pad]} ${className}`} {...(rest as object)}>
      <SketchOutline tone={tone} seed={seed} radius={radius} strokeWidth={outline ? 1.6 : 0} stroke="var(--color-ink-soft)" double={false} shadow={!outline} />
      {tape && <Tape color={tape === "auto" ? undefined : tape} seed={seed} />}
      {children}
    </Tag>
  );
}

const WASHI = ["yellow", "dots", "pink", "greencheck", "yellowdots", "bluegrid", "green", "stripe", "purple", "kraft"] as const;

/**
 * A short piece of washi tape (both ends torn) holding down a corner.
 * Tape is only ever where something is being held: the corners, never the middle.
 */
export function Tape({
  color,
  seed,
  corner,
  className = "",
  style,
}: {
  color?: (typeof WASHI)[number] | "blue";
  seed?: string | number;
  /** Which top corner it holds (picked by seed unless given). */
  corner?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
}) {
  const s = hashSeed(seed ?? color ?? "tape");
  const name = color === "blue" ? "bluegrid" : (color ?? WASHI[s % WASHI.length]);
  const side = corner ?? (s % 2 ? "left" : "right");
  const tilt = 34 + ((s >> 3) % 10); // 34–43°, across the corner
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -top-2 z-10 block aspect-[190/72] w-14 opacity-95 ${className}`}
      style={{
        [side]: "-14px",
        transform: `rotate(${side === "left" ? -tilt : tilt}deg)`,
        backgroundImage: `url(/deco/tape-${name}-short.png)`,
        backgroundSize: "100% 100%",
        ...style,
      }}
    />
  );
}

export function SketchSection({
  title,
  tone = "paper",
  seed,
  action,
  className = "",
  children,
}: {
  title?: ReactNode;
  tone?: SketchTone;
  seed?: string | number;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative isolate p-4 ${className}`}>
      <SketchOutline tone={tone} seed={seed ?? (typeof title === "string" ? title : undefined)} radius={18} strokeWidth={0} double={false} />
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-hand text-lg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ───────── Button ───────── */

export type SketchVariant = "primary" | "sub" | "plain";
const SIZE = { sm: "min-h-10 px-4 text-sm", md: "min-h-12 px-5 text-base", lg: "min-h-14 px-6 text-lg" } as const;

function tiltFor(seed: number) {
  const r = (seed % 1000) / 1000;
  return `${(r < 0.5 ? -1 : 1) * (0.4 + (r % 0.5) * 0.3)}deg`;
}

function buttonSeed(explicit: string | number | undefined, label: ReactNode, fallback: string) {
  return hashSeed(explicit ?? (typeof label === "string" ? label : fallback));
}

/**
 * primary = a stroke of yellow marker behind the words
 * sub     = a pale blue scrap of paper
 * plain   = words with a hand-drawn underline
 */
function ButtonFace({ variant, seed }: { variant: SketchVariant; seed: number }) {
  if (variant === "primary") {
    // eslint-disable-next-line @next/next/no-img-element -- UI sprite
    return <img src="/ui/marker-yellow.png" alt="" aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full" style={{ transform: `scaleX(${seed % 2 ? 1 : -1})` }} />;
  }
  if (variant === "sub") return <SketchOutline tone="sky" seed={seed} radius={18} wobble={1.6} strokeWidth={0} double={false} />;
  return null;
}

const FACE: Record<SketchVariant, string> = {
  primary: "font-bold",
  sub: "font-bold",
  plain: "font-medium text-ink-soft underline decoration-sky-deep/60 decoration-wavy decoration-[1.5px] underline-offset-[6px]",
};

type ButtonBase = { variant?: SketchVariant; size?: keyof typeof SIZE; seed?: string | number; block?: boolean };

export const SketchButton = forwardRef<HTMLButtonElement, ButtonBase & ButtonHTMLAttributes<HTMLButtonElement>>(
  function SketchButton({ variant = "primary", size = "md", seed, block, className = "", children, type = "button", style, ...rest }, ref) {
    const id = useId();
    const s = buttonSeed(seed, children, id);
    return (
      <button
        ref={ref}
        type={type}
        className={`sketch-btn relative isolate inline-flex items-center justify-center gap-2 text-ink ${SIZE[size]} ${FACE[variant]} ${block ? "w-full" : ""} ${className}`}
        style={{ ["--tilt" as string]: tiltFor(s), ...style }}
        {...rest}
      >
        <ButtonFace variant={variant} seed={s} />
        {children}
      </button>
    );
  },
);

export function SketchLinkButton({
  href,
  variant = "primary",
  size = "md",
  seed,
  block,
  className = "",
  children,
}: ButtonBase & { href: string; className?: string; children: ReactNode }) {
  const id = useId();
  const s = buttonSeed(seed, children, id);
  return (
    <Link
      href={href}
      className={`sketch-btn relative isolate inline-flex items-center justify-center gap-2 text-ink ${SIZE[size]} ${FACE[variant]} ${block ? "w-full" : ""} ${className}`}
      style={{ ["--tilt" as string]: tiltFor(s) }}
    >
      <ButtonFace variant={variant} seed={s} />
      {children}
    </Link>
  );
}

/** Small round icon button (back, close). */
export function SketchIconButton({
  label,
  seed,
  tone = "white",
  className = "",
  children,
  ...rest
}: { label: string; seed?: string | number; tone?: SketchTone } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const s = hashSeed(seed ?? label);
  return (
    <button
      type="button"
      aria-label={label}
      className={`sketch-btn relative isolate flex h-11 w-11 shrink-0 items-center justify-center text-ink ${className}`}
      style={{ ["--tilt" as string]: tiltFor(s) }}
      {...rest}
    >
      <SketchOutline tone={tone} seed={s} radius={22} wobble={1.2} strokeWidth={0} double={false} shadow />
      {children}
    </button>
  );
}

/* ───────── Inputs ───────── */

export function SketchInput({ seed, className = "", ...rest }: { seed?: string | number } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`sketch-field relative isolate ${className}`}>
      <SketchOutline tone="white" seed={seed ?? rest.name ?? rest.placeholder} radius={12} double={false} strokeWidth={1.4} stroke="var(--color-ink-mute)" />
      <input className="h-12 w-full bg-transparent px-4 text-base outline-none placeholder:text-ink-mute" {...rest} />
    </div>
  );
}

export function SketchTextarea({ seed, className = "", ...rest }: { seed?: string | number } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={`sketch-field relative isolate ${className}`}>
      <SketchOutline tone="white" seed={seed ?? rest.name ?? rest.placeholder} radius={12} double={false} strokeWidth={1.4} stroke="var(--color-ink-mute)" />
      <textarea className="block w-full resize-none bg-transparent px-4 py-3 text-base leading-relaxed outline-none placeholder:text-ink-mute" {...rest} />
    </div>
  );
}

/* ───────── Speech bubble ───────── */

/**
 * Hand-drawn bubbles (public/ui/bubbles). Drawn as 9-slice border images so
 * the corners and the tail keep their shape while the middle stretches; the
 * text sits inside the line. slice = top right bottom left (source px),
 * foot = source px from the body's bottom line to the tail tip.
 */
const BUBBLES = [
  { src: "/ui/bubbles/b1.png", slice: [95, 115, 110, 175], foot: 50 },
  { src: "/ui/bubbles/b2.png", slice: [100, 130, 105, 150], foot: 40 },
  { src: "/ui/bubbles/b3.png", slice: [80, 100, 100, 150], foot: 62 },
  { src: "/ui/bubbles/b4.png", slice: [60, 60, 85, 110], foot: 53 },
  { src: "/ui/bubbles/b6.png", slice: [60, 70, 110, 160], foot: 70 },
] as const;
const BUBBLE_SCALE = 1 / 3.4;
const EDGE_PAD = 26 * BUBBLE_SCALE + 8;

export function SketchBubble({
  side = "left",
  seed,
  className = "",
  style,
  children,
}: {
  /** Which side the tail points to. */
  side?: "left" | "right";
  seed?: string | number;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  // Pick the shape by length: short lines get the compact round bubble, longer
  // ones the wider shapes, so the corners and tail never look squashed.
  const text = typeof children === "string" ? children : "";
  const len = text.length;
  const b = len <= 9 ? BUBBLES[0] : len <= 16 ? BUBBLES[3] : BUBBLES[hashSeed(seed ?? text) % 2 === 0 ? 4 : 1];
  const [t, r, bt, l] = b.slice.map((v) => Math.round(v * BUBBLE_SCALE));
  return (
    <div className={`relative isolate w-fit ${className}`} style={{ minHeight: t + bt, minWidth: l + r + 12, ...style }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 box-border"
        style={{
          borderStyle: "solid",
          borderColor: "transparent",
          borderWidth: `${t}px ${r}px ${bt}px ${l}px`,
          borderImageSource: `url(${b.src})`,
          borderImageSlice: `${b.slice.join(" ")} fill`,
          borderImageRepeat: "stretch",
          transform: side === "right" ? "scaleX(-1)" : undefined,
        }}
      />
      <div
        className="font-hand text-[15px] leading-snug"
        style={{ padding: `${EDGE_PAD}px ${EDGE_PAD + 4}px ${Math.round(b.foot * BUBBLE_SCALE) + EDGE_PAD}px ${EDGE_PAD + 4}px` }}
      >
        {children}
      </div>
    </div>
  );
}

/* ───────── Modal / Sheet ───────── */

export function SketchSheet({
  open,
  onClose,
  label,
  seed,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  seed?: string | number;
  children: ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 mx-auto max-w-[480px]" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 h-full w-full animate-[fade_0.2s_ease-out] bg-ink/25" />
      <div
        className="absolute inset-x-1 bottom-0 animate-[sheet_0.32s_cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div ref={panel} tabIndex={-1} className="relative isolate outline-none">
          <SketchOutline tone="paper" seed={seed ?? label} radius={26} bleed={{ bottom: 40 }} strokeWidth={0} double={false} shadow />
          <div
            className="flex cursor-grab touch-none justify-center pt-3 pb-1"
            onPointerDown={(e) => {
              start.current = e.clientY;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => start.current !== null && setDragY(Math.max(0, e.clientY - start.current))}
            onPointerUp={() => {
              if (dragY > 90) onClose();
              setDragY(0);
              start.current = null;
            }}
          >
            <svg width="44" height="8" aria-hidden>
              <path d="M3 4.5 C14 2.5 28 5.5 41 3.5" stroke="var(--color-ink-mute)" strokeWidth="3" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div className="max-h-[84dvh] overflow-y-auto overscroll-contain pb-[calc(16px+env(safe-area-inset-bottom))]">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function SketchModal({
  open,
  onClose,
  label,
  seed,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  seed?: string | number;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] items-center justify-center p-5" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 h-full w-full animate-[fade_0.2s_ease-out] bg-ink/25" />
      <div className="animate-peek relative isolate w-full p-5">
        <SketchOutline tone="paper" seed={seed ?? label} radius={22} strokeWidth={0} double={false} shadow />
        <Tape seed={seed ?? label} />
        {children}
      </div>
    </div>
  );
}

/* ───────── Tabs ───────── */

export function SketchTabs<T extends string>({
  value,
  onChange,
  items,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  items: readonly { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex gap-1 ${className}`}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={`relative isolate h-10 px-3 text-sm ${active ? "font-bold text-ink" : "text-ink-mute"}`}
          >
            {active && (
              // eslint-disable-next-line @next/next/no-img-element -- UI sprite
              <img src="/ui/marker-yellow.png" alt="" aria-hidden className="pointer-events-none absolute inset-x-1 bottom-1.5 -z-10 h-3 w-[calc(100%-8px)]" />
            )}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Hand-drawn circle around its children (active tab icon, marked thing). */
export function SketchCircle({ seed, show = true, className = "", children }: { seed: string | number; show?: boolean; className?: string; children: ReactNode }) {
  const [ref, size] = useSize<HTMLSpanElement>();
  const s = hashSeed(seed);
  return (
    <span ref={ref} className={`relative isolate inline-flex items-center justify-center ${className}`}>
      {show && size && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-visible" width={size.w} height={size.h}>
          <path d={sketchEllipse(size.w, size.h, s)} fill="var(--color-butter-soft)" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
    </span>
  );
}

/** Wavy hand-drawn rule. */
export function SketchRule({ seed = "rule", className = "" }: { seed?: string | number; className?: string }) {
  const [ref, size] = useSize<HTMLDivElement>();
  return (
    <div ref={ref} aria-hidden className={`h-2 w-full ${className}`}>
      {size && (
        <svg width={size.w} height={8} className="overflow-visible">
          <path d={sketchLine(size.w, 4, hashSeed(seed))} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

const FRAMES = {
  fold: { src: "/ui/card-fold.png", slice: [40, 44, 48, 40] },
  dash: { src: "/ui/card-dash.png", slice: [40, 40, 40, 40] },
  grid: { src: "/ui/card-grid.png", slice: [40, 40, 40, 40] },
  tape: { src: "/ui/card-tape.png", slice: [64, 40, 40, 40] },
  stack: { src: "/ui/card-stack.png", slice: [40, 52, 52, 40] },
} as const;
export type FrameKind = keyof typeof FRAMES;

/**
 * A card drawn from the design sheet (hand-drawn outline, fold, tape…),
 * stretched 9-slice so the line stays the same weight at any size.
 */
export function PaperFrame({ kind, className = "", children }: { kind: FrameKind; className?: string; children: ReactNode }) {
  const f = FRAMES[kind];
  const [t, r, b, l] = f.slice.map((v) => Math.round(v / 2));
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderStyle: "solid",
          borderColor: "transparent",
          borderWidth: `${t}px ${r}px ${b}px ${l}px`,
          borderImageSource: `url(${f.src})`,
          borderImageSlice: `${f.slice.join(" ")} fill`,
          borderImageRepeat: "stretch",
        }}
      />
      <div className="relative" style={{ padding: `${t + 4}px ${r + 6}px ${b + 4}px ${l + 6}px` }}>
        {children}
      </div>
    </div>
  );
}
