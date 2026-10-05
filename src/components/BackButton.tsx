"use client";

import { useRouter } from "next/navigation";

import { canGoBack } from "./NavTracker";
import { SketchIconButton } from "./sketch";

export function BackButton({ fallback = "/", label = "もどる" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <SketchIconButton
      label={label}
      onClick={() => (canGoBack() ? router.back() : router.push(fallback))}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M15 5.2c-2.4 2.3-4.6 4.4-7 6.9 2.3 2.2 4.6 4.5 6.9 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </SketchIconButton>
  );
}
