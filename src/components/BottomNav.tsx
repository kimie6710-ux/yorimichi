"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SketchCircle, SketchRule } from "./sketch";

const ITEMS = [
  { href: "/", label: "マップ", icon: MapIcon, match: (p: string) => p === "/" || p.startsWith("/spot") || p.startsWith("/visit") },
  { href: "/capture", label: "撮る", icon: PlusIcon, match: (p: string) => p.startsWith("/capture") },
  { href: "/collection", label: "シール帳", icon: BookIcon, match: (p: string) => p.startsWith("/collection") },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="paper mx-auto max-w-[480px]">
        <SketchRule seed="nav" className="-mb-1" />
        <ul className="flex">
          {ITEMS.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            const center = href === "/capture";
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-[68px] flex-col items-center justify-center gap-0.5 text-sm ${active ? "font-bold text-ink" : "text-ink-mute"}`}
                >
                  <SketchCircle seed={`nav-${href}`} show={active || center} className={center ? "h-10 w-14" : "h-9 w-12"}>
                    <Icon />
                  </SketchCircle>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

const stroke = { stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M9 4.2 3.8 6.3l.3 13.6L9 17.8l6.1 2.1 5.2-2.2-.2-13.5L15 6.3 9 4.2Z" {...stroke} />
      <path d="M9.1 4.5 9 17.6M15 6.5l.1 13.1" {...stroke} />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <path d="M12.2 5.2c-.2 4.6 0 9.2-.3 13.6M5.3 12.1c4.5.2 9-.2 13.4.1" {...stroke} strokeWidth={2.6} />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 4.5c3-.3 6.6-.2 9.5 0 2 .1 4.3.3 4.6.6.2 4.4.2 10 .1 14.4-4.6.3-9.4.3-14.2 0-.3-4.8-.3-10.2 0-15Z" {...stroke} />
      <path d="M8.5 9.5c1-.9 2.4-1.1 3.4-.2" {...stroke} />
      <circle cx="14.6" cy="13.4" r="2.2" {...stroke} />
    </svg>
  );
}
