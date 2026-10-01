/* eslint-disable @next/next/no-img-element -- tiny local webp sprites, next/image adds nothing here */
import { michibiSrc, type MichibiMood } from "@/lib/character";
import { SketchBubble } from "./sketch";

interface MichibiProps {
  mood?: MichibiMood;
  size?: number;
  /** One short line. Omit for a silent cameo. */
  says?: string;
  /** Bubble on the right (default) or left of the bird. */
  side?: "right" | "left";
  animate?: "bob" | "wander" | "none";
  /** Bubble stacked above the bird, its tail pointing at the bird's head. */
  above?: boolean;
  className?: string;
}

/** The little bird: appears small, says one thing, gets out of the way. */
export function Michibi({ mood = "front", size = 64, says, side = "right", animate = "bob", above = false, className = "" }: MichibiProps) {
  const anim = animate === "bob" ? "animate-bob" : animate === "wander" ? "animate-wander" : "";
  return (
    <div className={`flex gap-2 ${above ? "flex-col-reverse items-center" : `items-end ${side === "left" ? "flex-row-reverse" : ""}`} ${className}`}>
      <img
        src={michibiSrc(mood, size <= 96 ? "sm" : "md")}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 select-none ${anim}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
      {says &&
        (above ? (
          // Zero-width column on the bird's centre line: the tail's tip lands right on it, the bird stays put.
          <div className="flex w-0 justify-start">
            <SketchBubble key={says} side="left" tipAtStart className="animate-peek shrink-0 max-w-[min(220px,calc(50vw+4px))]">
              {says}
            </SketchBubble>
          </div>
        ) : (
          <SketchBubble key={says} side={side === "right" ? "left" : "right"} className="animate-peek mb-5 max-w-[260px]">
            {says}
          </SketchBubble>
        ))}
    </div>
  );
}
