"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Phone-style bottom sheet: slides up over the map / book, closes on backdrop
 * tap, Escape, or dragging the handle down.
 */
export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
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
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 h-full w-full animate-[fade_0.2s_ease-out] bg-ink/30 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[88dvh] animate-[sheet_0.32s_cubic-bezier(0.2,0.8,0.2,1)] overflow-y-auto overscroll-contain rounded-t-[32px] bg-paper pb-[env(safe-area-inset-bottom)] shadow-lift outline-none"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div
          className="sticky top-0 z-10 flex cursor-grab touch-none justify-center bg-paper/95 pt-3 pb-2 backdrop-blur"
          onPointerDown={(e) => {
            start.current = e.clientY;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (start.current !== null) setDragY(Math.max(0, e.clientY - start.current));
          }}
          onPointerUp={() => {
            if (dragY > 90) onClose();
            setDragY(0);
            start.current = null;
          }}
        >
          <span className="h-1.5 w-11 rounded-full bg-gray-300" aria-hidden />
        </div>
        {children}
      </div>
    </div>
  );
}
