"use client";

import Link from "next/link";

import { useSearch } from "@/lib/store/search-context";
import { SketchOutline } from "./sketch";

/** Wordmark + the two quiet doors: 届いたもの / マイページ. */
export function TopBar({ className = "" }: { className?: string }) {
  const { unread } = useSearch();
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="relative isolate px-3 py-1 font-hand text-lg font-bold tracking-[0.12em]">
        <SketchOutline tone="white" seed="wordmark" radius={12} double={false} />
        よるみち
      </span>
      <div className="flex gap-2">
        <Link href="/inbox" aria-label={unread ? `届いたもの ${unread}件` : "届いたもの"} className="sketch-btn relative isolate flex h-11 w-11 items-center justify-center" style={{ ["--tilt" as string]: "-0.8deg" }}>
          <SketchOutline tone="white" seed="inbox-btn" radius={20} double={false} />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3.8 7c5.4-.3 10.8-.2 16.3 0 .2 3.4.1 7.1 0 10.6-5.4.3-10.9.2-16.2 0-.3-3.6-.3-7.2-.1-10.6Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
            <path d="M4.2 7.4c2.6 2 5.2 3.9 7.9 5.6 2.6-1.8 5.1-3.7 7.7-5.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 text-[12px] leading-none font-bold text-ink outline-2 outline-ink outline-solid">
              {unread}
            </span>
          )}
        </Link>
        <Link href="/me" aria-label="マイページ" className="sketch-btn relative isolate flex h-11 w-11 items-center justify-center" style={{ ["--tilt" as string]: "0.7deg" }}>
          <SketchOutline tone="white" seed="me-btn" radius={20} double={false} />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 12.3c2.2.1 3.9-1.6 3.9-3.9 0-2.1-1.7-3.9-3.9-3.9S8.1 6.3 8.2 8.5c0 2.1 1.6 3.8 3.8 3.8Z" stroke="currentColor" strokeWidth="2.1" />
            <path d="M4.8 19.6c1.3-3.2 4-4.7 7.3-4.7 3.2 0 5.9 1.6 7.1 4.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
