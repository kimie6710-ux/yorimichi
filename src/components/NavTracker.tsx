"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// How many screens have been shown in this app session. "Back" only goes back
// when there is an earlier screen of ours (history.length also counts other sites).
let shown = 0;

export function canGoBack(): boolean {
  return shown > 1;
}

export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    shown++;
  }, [pathname]);
  return null;
}
