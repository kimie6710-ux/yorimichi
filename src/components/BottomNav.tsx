"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "よりみち", icon: DetourIcon, match: (p: string) => p === "/" },
  {
    href: "/map",
    label: "マップ",
    icon: MapIcon,
    match: (p: string) => p.startsWith("/map") || p.startsWith("/place") || p.startsWith("/visit"),
  },
  { href: "/collection", label: "採集", icon: BookIcon, match: (p: string) => p.startsWith("/collection") },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="メイン"
      className="fixed inset-x-0 bottom-0 z-40 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--color-line)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-[480px]">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-[68px] flex-col items-center justify-center gap-0.5 text-sm transition-colors ${
                  active ? "font-bold text-mint-deep" : "text-ink-mute"
                }`}
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-mint/30" : ""
                  }`}
                >
                  <Icon />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function DetourIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 20c0-4 3-5 6-6s6-3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="6" cy="20" r="1.6" fill="currentColor" />
      <path d="M18 3.5 20 7h-4l2-3.5Z" fill="currentColor" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="3.5" width="16" height="17" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="m12 8 1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 14l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4L12 8Z" fill="currentColor" />
    </svg>
  );
}
