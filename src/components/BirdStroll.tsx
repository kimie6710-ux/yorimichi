"use client";

/* eslint-disable @next/next/no-img-element -- local sprites */
import { useCallback, useEffect, useRef, useState } from "react";

import { michibiSrc, type BirdPose } from "@/lib/character";

/** A bird strolling back and forth along the top of a page. It doesn't talk here. */
export function BirdStroll({ className = "" }: { className?: string }) {
  const [x, setX] = useState(10); // % of the strip
  const [pose, setPose] = useState<BirdPose>("side");
  const [flip, setFlip] = useState(false);
  const xRef = useRef(10);
  const busy = useRef(false);

  const walkTo = useCallback((to: number) => {
    const from = xRef.current;
    const duration = Math.max(900, Math.abs(to - from) * 60);
    const t0 = performance.now();
    busy.current = true;
    setFlip(to < from);
    setPose("walk");
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const v = from + (to - from) * k;
      xRef.current = v;
      setX(v);
      if (k < 1) requestAnimationFrame(step);
      else {
        busy.current = false;
        setPose("side");
      }
    };
    requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (busy.current) return;
      const r = Math.random();
      if (r < 0.5) walkTo(4 + Math.random() * 84);
      else if (r < 0.7) {
        setPose("hop");
        setTimeout(() => setPose("side"), 700);
      } else if (r < 0.85) setFlip((f) => !f);
      else setPose("front");
    }, 4200);
    return () => clearInterval(t);
  }, [walkTo]);

  return (
    <div className={`pointer-events-none relative h-[44px] w-full ${className}`} aria-hidden>
      <div className="pointer-events-auto absolute bottom-0" style={{ left: `${x}%` }}>
        <button
          type="button"
          aria-label="みちび"
          onClick={() => {
            if (busy.current) return;
            setPose("hop");
            setTimeout(() => setPose("side"), 700);
          }}
        >
          <img
            src={michibiSrc(pose, "sm")}
            alt=""
            draggable={false}
            className={`h-10 w-10 select-none ${pose === "walk" ? "bird-waddle" : pose === "hop" ? "bird-hop" : "bird-breathe"}`}
            style={{ ["--flip" as string]: flip ? "-1" : "1" }}
          />
        </button>
      </div>
    </div>
  );
}
