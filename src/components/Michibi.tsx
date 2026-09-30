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
  className?: string;
}

/** The little bird: appears small, says one thing, gets out of the way. */
export function Michibi({ mood = "front", size = 64, says, side = "right", animate = "bob", className = "" }: MichibiProps) {
  const anim = animate === "bob" ? "animate-bob" : animate === "wander" ? "animate-wander" : "";
  return (
    <div className={`flex items-end gap-2 ${side === "left" ? "flex-row-reverse" : ""} ${className}`}>
      <img
        src={michibiSrc(mood, size <= 96 ? "sm" : "md")}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 select-none ${anim}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
      {says && (
        <SketchBubble key={says} side={side === "right" ? "left" : "right"} className="animate-peek mb-5 max-w-[260px]">
          {says}
        </SketchBubble>
      )}
    </div>
  );
}
