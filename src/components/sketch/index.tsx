"use client";

import Link from "next/link";
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

export function SketchCard({
  tone = "white",
  pad = "md",
  seed,
  radius = 16,
  className = "",
  children,
  as: Tag = "div",
  ...rest
}: {
  tone?: SketchTone;
  pad?: Pad;
  seed?: string | number;
  radius?: number;
  as?: "div" | "article" | "section" | "li";
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"div">, "children">) {
  return (
    <Tag className={`relative isolate ${PAD[pad]} ${className}`} {...(rest as object)}>
      <SketchOutline tone={tone} seed={seed} radius={radius} />
      {children}
    </Tag>
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
      <SketchOutline tone={tone} seed={seed ?? (typeof title === "string" ? title : undefined)} radius={18} />
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ───────── Button ───────── */

export type SketchVariant = "primary" | "sub" | "plain";
const VARIANT_TONE: Record<SketchVariant, SketchTone> = { primary: "sticker", sub: "sky", plain: "white" };
const SIZE = { sm: "min-h-10 px-4 text-sm", md: "min-h-12 px-5 text-base", lg: "min-h-14 px-6 text-lg" } as const;

function tiltFor(seed: number) {
  const r = (seed % 1000) / 1000;
  return `${(r < 0.5 ? -1 : 1) * (0.5 + (r % 0.5))}deg`;
}

function buttonSeed(explicit: string | number | undefined, label: ReactNode, fallback: string) {
  return hashSeed(explicit ?? (typeof label === "string" ? label : fallback));
}

type ButtonBase = { variant?: SketchVariant; size?: keyof typeof SIZE; seed?: string | number; block?: boolean };

export const SketchButton = forwardRef<HTMLButtonElement, ButtonBase & ButtonHTMLAttributes<HTMLButtonElement>>(
  function SketchButton({ variant = "primary", size = "md", seed, block, className = "", children, type = "button", style, ...rest }, ref) {
    const id = useId();
    const s = buttonSeed(seed, children, id);
    return (
      <button
        ref={ref}
        type={type}
        className={`sketch-btn relative isolate inline-flex items-center justify-center gap-2 font-bold text-ink ${SIZE[size]} ${block ? "w-full" : ""} ${className}`}
        style={{ ["--tilt" as string]: tiltFor(s), ...style }}
        {...rest}
      >
        <SketchOutline tone={VARIANT_TONE[variant]} seed={s} radius={variant === "primary" ? 10 : 18} wobble={1.8} double={variant !== "plain"} />
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
      className={`sketch-btn relative isolate inline-flex items-center justify-center gap-2 font-bold text-ink ${SIZE[size]} ${block ? "w-full" : ""} ${className}`}
      style={{ ["--tilt" as string]: tiltFor(s) }}
    >
      <SketchOutline tone={VARIANT_TONE[variant]} seed={s} radius={variant === "primary" ? 10 : 18} wobble={1.8} double={variant !== "plain"} />
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
      <SketchOutline tone={tone} seed={s} radius={22} wobble={1.2} double={false} />
      {children}
    </button>
  );
}

/* ───────── Inputs ───────── */

export function SketchInput({ seed, className = "", ...rest }: { seed?: string | number } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`sketch-field relative isolate ${className}`}>
      <SketchOutline tone="white" seed={seed ?? rest.name ?? rest.placeholder} radius={12} double={false} />
      <input className="h-12 w-full bg-transparent px-4 text-base outline-none placeholder:text-ink-mute" {...rest} />
    </div>
  );
}

export function SketchTextarea({ seed, className = "", ...rest }: { seed?: string | number } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={`sketch-field relative isolate ${className}`}>
      <SketchOutline tone="white" seed={seed ?? rest.name ?? rest.placeholder} radius={12} double={false} />
      <textarea className="block w-full resize-none bg-transparent px-4 py-3 text-base leading-relaxed outline-none placeholder:text-ink-mute" {...rest} />
    </div>
  );
}

/* ───────── Speech bubble ───────── */

export function SketchBubble({
  side = "left",
  seed,
  className = "",
  children,
}: {
  /** Which side the tail points to. */
  side?: "left" | "right";
  seed?: string | number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative isolate px-4 py-2.5 ${className}`}>
      <SketchOutline tone="white" seed={seed ?? (typeof children === "string" ? children : undefined)} radius={18} double={false} />
      <svg
        aria-hidden
        width="18"
        height="16"
        viewBox="0 0 18 16"
        className={`pointer-events-none absolute -bottom-[11px] -z-[5] ${side === "left" ? "left-4" : "right-4 -scale-x-100"}`}
      >
        <path d="M3 0.5 C4 6 2.5 10 0.8 14.6 C6 12 11 8 15 0.5" fill="var(--color-card)" />
        <path d="M3.2 1.8 C4 6 2.5 10 0.8 14.6 C6 12 11 8 15 1.8" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="font-hand text-base leading-snug">{children}</div>
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
          <SketchOutline tone="paper" seed={seed ?? label} radius={26} bleed={{ bottom: 40 }} />
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
        <SketchOutline tone="paper" seed={seed ?? label} radius={22} />
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
            className={`relative isolate h-10 px-4 text-sm ${active ? "font-bold text-ink" : "text-ink-mute"}`}
          >
            {active && <SketchOutline tone="butter" seed={`tab-${it.value}`} radius={18} wobble={1.4} double={false} />}
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
