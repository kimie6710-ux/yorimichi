/** The user's real position: an ink dot with a soft sky pulse. */
export function CurrentLocationMarker() {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center" role="img" aria-label="いまここ">
      <span className="absolute h-5 w-5 animate-pulse-ring rounded-full bg-sky-deep" />
      <span className="relative h-4 w-4 rounded-full border-[3px] border-card bg-ink" />
    </span>
  );
}
