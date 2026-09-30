"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn icon sprites */
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "地図", icon: "/ui/n-map.png", match: (p: string) => p === "/" || p.startsWith("/spot") || p.startsWith("/visit") },
  { href: "/capture", label: "撮る", icon: "/ui/n-camera.png", match: (p: string) => p.startsWith("/capture") },
  { href: "/collection", label: "手帳", icon: "/ui/n-book.png", match: (p: string) => p.startsWith("/collection") },
  { href: "/me", label: "マイページ", icon: "/ui/n-person.png", match: (p: string) => p.startsWith("/me") || p.startsWith("/inbox") },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="メイン" className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="paper mx-auto max-w-[480px] shadow-[0_-1px_0_var(--color-line)]">
        <ul className="flex">
          {ITEMS.map(({ href, label, icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-[68px] flex-col items-center justify-center gap-0.5 text-[12px] transition-opacity ${active ? "font-bold text-ink" : "text-ink-mute opacity-60"}`}
                >
                  <img src={icon} alt="" className="h-8 w-auto" draggable={false} />
                  <span className="relative isolate px-1">
                    {active && <img src="/ui/marker-yellow.png" alt="" aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-2 w-full" />}
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
