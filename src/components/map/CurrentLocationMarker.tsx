/** The user's real position: a small deep-lavender dot with a soft pulse. */
export function CurrentLocationMarker() {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center" role="img" aria-label="いまここ">
      <span className="absolute h-5 w-5 animate-pulse-ring rounded-full bg-lavender-deep" />
      <span className="relative h-4 w-4 rounded-full border-[3px] border-white bg-lavender-deep shadow-soft" />
    </span>
  );
}
