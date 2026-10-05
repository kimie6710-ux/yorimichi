// よりみちの小鳥「みちび」。ナビゲーターだけど、説明しすぎない。

export const CHARACTER = {
  name: "みちび",
} as const;

/** Poses drawn by the user (public/bird/*.webp). */
export type BirdPose =
  | "front" // まえ
  | "side" // よこ
  | "back" // うしろ
  | "walk" // あるく
  | "flap" // はばたく
  | "perch" // とまる
  | "hop" // ぴょん
  | "happy" // うれしい
  | "surprise" // びっくり
  | "sleepy"; // ねむい

/** Older mood names still used in a few places. */
type LegacyMood = "idle" | "wonder" | "peek" | "wander" | "found" | "lazy";
export type MichibiMood = BirdPose | LegacyMood;

const LEGACY: Record<LegacyMood, BirdPose> = {
  idle: "front",
  wonder: "surprise",
  peek: "side",
  wander: "walk",
  found: "flap",
  lazy: "perch",
};

export function birdPose(mood: MichibiMood): BirdPose {
  return (LEGACY as Record<string, BirdPose>)[mood] ?? (mood as BirdPose);
}

export function michibiSrc(mood: MichibiMood, size: "sm" | "md" = "md"): string {
  return `/bird/${birdPose(mood)}${size === "sm" ? "-sm" : ""}.webp`;
}

export const MICHIBI_LINES = {
  homeGreeting: ["なんかありそうな予感。", "気になるの、ある？"],
  loading: ["ぐるっと見てまわってる。", "なんかありそう。"],
  fallback: "今日は勘がにぶいかも。",
  empty: "今日は、静かな街みたい。",
  sparse: "まだ、あんまり見つかってない。",
  aiEmpty: "うーん、ピンとこなかった。",
  locationDenied: "どこにいるか分からないと、探せない。",
  outsideArea: "いまは東京の街を歩いてる。",
  networkError: "電波がどこかに行っちゃった。",
  arrived: "もうすぐそこだよ。",
  explore: "なにか見つけた？",
  somebodyWasHere: "誰かが、ここでこれを見てた。",
  nudge: "上とか、足もととか。",
  photoAsk: "それ、シールにする？",
  choose: "どれにする？",
  made: "それ、ぼくは気づかなかった。",
  shareAsk: "置いていく？",
  placed: "置いてきた。次の誰かが見つけるかも。",
  sent: "どこかの誰かに届けたよ。",
  sendWaiting: "届け先、探してるところ。",
  kept: "ボックスに入れといた。",
  notFound: "見つからなかった。",
  received: "誰かの発見が届いたよ。",
  collectionEmpty: "まだ一枚もないね。",
  inboxEmpty: "まだ何も届いてない。",
} as const;

export function pick<T>(list: readonly T[], seed?: number): T {
  const i = seed === undefined ? Math.floor(Math.random() * list.length) : Math.abs(seed) % list.length;
  return list[i];
}
