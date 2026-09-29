// みちび — the street creature that personifies the AI's "slightly off" reading.
// Rename freely: every UI string pulls from CHARACTER.

export const CHARACTER = {
  name: "みちび",
  description: "街のすき間に住んでいる、正体不明の生き物。たまに間違う。悪びれない。",
} as const;

/**
 * Poses drawn by the user (public/michibi/*.webp).
 * idle=正面おすわり / wonder=見上げ / peek=横向き / wander=うしろ姿
 * found=伏せてワクワク / happy=ジャンプ / lazy=へそ天 / sleepy=おやすみ
 */
export type MichibiMood =
  | "idle"
  | "wonder"
  | "peek"
  | "wander"
  | "found"
  | "happy"
  | "lazy"
  | "sleepy";

export function michibiSrc(mood: MichibiMood, size: "sm" | "md" = "md"): string {
  return `/michibi/${mood}${size === "sm" ? "-sm" : ""}.webp`;
}

export const MICHIBI_LINES = {
  homeGreeting: ["今日はどこ、ちょっと寄ってく？", "今、なにしたい？", "このへん、なんかありそう。"],
  loading: [
    "このへん、勝手に見てみるね。",
    "ふむふむ……街のうわさを集めてる。",
    "どこに寄ろうか、考えてる。",
  ],
  resultIntro: ["こっち、ちょっと気になる。", "ぜんぶ正解じゃないかも。でも、なんかいい。"],
  fallback: "今日は勘がにぶいかも。とりあえず近くのふつうの場所。",
  empty: "このへん、今日は静かすぎるみたい。ちょっと歩いてみる？",
  aiEmpty: "うーん、今日はピンとこなかった。近くの場所を置いとくね。",
  locationDenied: "どこにいるか分からないと、寄り道を探せない……。",
  outsideArea: "いまは東京の街を探索中です。",
  networkError: "電波がどこかに行っちゃった。",
  reactionAsk: "で、実際どうだった？",
  reaction: {
    totally_off: "違った？ でも覚えたでしょ。",
    kind_of: "でしょ。ちょっとだけ、ね。",
    totally_get_it: "ほらね。街はだいたい、そういうもの。",
  },
  photoAsk: "記念にひとつ、切り取っとく？",
  saved: "採集帳に貼っといた。",
  collectionEmpty: "まだ何も貼ってないね。どこか、寄り道しに行こ。",
} as const;

export function pick<T>(list: readonly T[], seed?: number): T {
  const i = seed === undefined ? Math.floor(Math.random() * list.length) : Math.abs(seed) % list.length;
  return list[i];
}
