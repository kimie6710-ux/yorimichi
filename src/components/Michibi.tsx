/* eslint-disable @next/next/no-img-element -- tiny local webp sprites, next/image adds nothing here */
import { CHARACTER, michibiSrc, type MichibiMood } from "@/lib/character";

interface MichibiProps {
  mood?: MichibiMood;
  size?: number;
  /** Speech bubble text. Omit for a silent cameo. */
  says?: string;
  /** Bubble on the right (default) or left of the character. */
  side?: "right" | "left";
  animate?: "bob" | "wander" | "none";
  className?: string;
}

/**
 * みちび — appears small, says one thing, gets out of the way.
 * The bubble uses the handwritten face so its voice is visually distinct from
 * real (Google) information.
 */
export function Michibi({
  mood = "idle",
  size = 64,
  says,
  side = "right",
  animate = "bob",
  className = "",
}: MichibiProps) {
  const anim = animate === "bob" ? "animate-bob" : animate === "wander" ? "animate-wander" : "";
  return (
    <div
      className={`flex items-end gap-2 ${side === "left" ? "flex-row-reverse" : ""} ${className}`}
    >
      <img
        src={michibiSrc(mood, size <= 80 ? "sm" : "md")}
        alt={says ? `${CHARACTER.name}` : ""}
        width={size}
        height={size}
        className={`shrink-0 select-none ${anim}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
      {says && (
        <p
          key={says}
          className={`animate-peek relative mb-3 max-w-[300px] rounded-2xl bg-white px-4 py-2.5 font-hand text-base leading-snug text-ink shadow-soft ${
            side === "right" ? "rounded-bl-md" : "rounded-br-md"
          }`}
        >
          {says}
        </p>
      )}
    </div>
  );
}
