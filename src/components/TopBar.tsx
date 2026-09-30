"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn icon sprite */
import Link from "next/link";

import { useSearch } from "@/lib/store/search-context";

/** Wordmark + 届いたもの. */
export function TopBar({ className = "" }: { className?: string }) {
  const { unread } = useSearch();
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="rounded-[10px_14px_9px_13px] bg-card/90 px-3 py-1 text-base font-bold tracking-[0.18em]">よるみち</span>
      <Link
        href="/inbox"
        aria-label={unread ? `届いたもの ${unread}件` : "届いたもの"}
        className="sketch-btn relative flex h-11 w-11 items-center justify-center rounded-[46%_54%_50%_50%] bg-card/90"
        style={{ ["--tilt" as string]: "-0.8deg" }}
      >
        <img src="/ui/i-mail.png" alt="" className="h-6 w-auto" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-butter px-1 text-[12px] leading-none font-bold">
            {unread}
          </span>
        )}
      </Link>
    </div>
  );
}
