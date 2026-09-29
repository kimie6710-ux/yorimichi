/* eslint-disable @next/next/no-img-element -- blob/signed URLs of transparent PNGs */
import { michibiSrc } from "@/lib/character";

/**
 * A sticker is an object, not a card: a transparent PNG (already die-cut with
 * a white border) shown on its own with a soft shadow and a slight tilt.
 * No background, no frame, no text on top — meta info lives outside it.
 */
export function StickerView({
  src,
  alt,
  rotation = 0,
  className = "",
  lift = false,
}: {
  src: string | null;
  alt: string;
  rotation?: number;
  className?: string;
  /** Slightly stronger shadow, e.g. while being "peeled" or selected. */
  lift?: boolean;
}) {
  const shadow = lift
    ? "drop-shadow(0 2px 2px rgb(71 85 105 / 0.14)) drop-shadow(0 12px 16px rgb(71 85 105 / 0.28))"
    : "drop-shadow(0 1px 1px rgb(71 85 105 / 0.14)) drop-shadow(0 6px 8px rgb(71 85 105 / 0.2))";

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading="lazy"
        className={`block h-auto max-w-full select-none ${className}`}
        style={{ transform: `rotate(${rotation}deg)`, filter: shadow }}
      />
    );
  }

  // Legacy rows without a sticker PNG: みちび with a white die-cut outline.
  const outline =
    "drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 3px 0 #fff) drop-shadow(0 -3px 0 #fff)";
  return (
    <img
      src={michibiSrc("sleepy")}
      alt={alt}
      draggable={false}
      className={`block h-auto max-w-full select-none ${className}`}
      style={{ transform: `rotate(${rotation}deg)`, filter: `${outline} ${shadow}` }}
    />
  );
}
