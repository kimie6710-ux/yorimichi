/* eslint-disable @next/next/no-img-element -- signed / local URLs of transparent PNGs */

/**
 * A sticker is an object, not a card: a transparent PNG (die-cut with a white
 * border and a hand-drawn edge) shown on its own with a slight tilt.
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
  /** A touch more shadow, e.g. while selected. */
  lift?: boolean;
}) {
  const shadow = lift ? "drop-shadow(0 3px 3px rgb(34 32 28 / 0.22))" : "drop-shadow(0 1.5px 1.5px rgb(34 32 28 / 0.18))";
  if (!src) {
    return <span className={`block aspect-square rounded-[40%_46%_42%_48%] bg-paper-deep ${className}`} aria-label={alt} role="img" />;
  }
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
