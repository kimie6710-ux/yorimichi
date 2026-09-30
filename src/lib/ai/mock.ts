import "server-only";

// ⚠️ DEVELOPMENT-ONLY mock AI ⚠️
// Used when AI_PROVIDER=mock, or mock data mode without ANTHROPIC_API_KEY.
// Copies are picked by category; detection returns centred guesses.

import type { NameOutput, SeedOutput } from "@/lib/schemas";
import type { Place } from "@/lib/types";
import type { AIProvider } from "./provider";

type Form = SeedOutput["spots"][number]["form"];
type Seed = [copy: string, form: Form, bird: string];

const BY_KIND: Record<string, Seed[]> = {
  food: [
    ["この店、入口より奥が本題かも。", "うわさ", "奥、気になる。"],
    ["湯気の向こうが、たぶん本番。", "断定", "おなかすいた。"],
    ["ひとりで来る人のための、昼の避難所", "用途名", "ここ、なんかあるかも。"],
  ],
  cafe: [
    ["この店だけ、時間が少し遅く流れてるかも。", "うわさ", "ゆっくりしてこ。"],
    ["コーヒーより、窓の外が本題？", "疑問", "窓、見てみたい。"],
    ["喫茶店未満、待合室以上。", "未満以上", "座っていく？"],
  ],
  book: [
    ["この本屋、背表紙の並びにクセがある。", "断定", "クセ、気になる。"],
    ["買う本より、隣の本が本題の店", "名詞句", "となり、見た？"],
  ],
  park: [
    ["ここ、たぶん別れ話専用のベンチです。", "断定", "……ほんとに？"],
    ["このへん、夕方だけ別の街になります。", "条件", "夕方がいいらしいよ。"],
    ["公園未満、庭以上。", "未満以上", "ちょっと寄ってこ。"],
  ],
  shrine: [
    ["この鳥居、くぐるより見上げるためにある。", "じゃなく", "上、見た？"],
    ["願いごとより、足もとが本題の場所", "名詞句", "足もと、なんかある。"],
  ],
  station: [
    ["待ち合わせに失敗する人のための改札", "用途名", "だれか待ってる？"],
    ["ここの出口、本当に出口？", "疑問", "迷ってもいいよ。"],
  ],
  shop: [
    ["この店、売り物じゃない物のほうが多い。", "うわさ", "何が多いんだろ。"],
    ["用事がない人ほど長居する店", "名詞句", "入ってみる？"],
  ],
  other: [
    ["ここ、なんか気になる。", "断定", "ここ、なんかあるかも。"],
    ["この角、曲がる前より曲がった後が長い。", "じゃなく", "曲がってみよ。"],
    ["見過ごし率、たぶん町内一位。", "断定", "私も見過ごしてた。"],
  ],
};

function kindOf(p: Place): keyof typeof BY_KIND {
  const t = p.types.join(" ");
  if (/cafe|coffee/.test(t)) return "cafe";
  if (/restaurant|bakery|meal|bar|dessert|ice_cream/.test(t)) return "food";
  if (/book_store|library/.test(t)) return "book";
  if (/park|garden|plaza|playground/.test(t)) return "park";
  if (/shrine|temple|church/.test(t)) return "shrine";
  if (/station/.test(t)) return "station";
  if (/store|shop|market|florist/.test(t)) return "shop";
  return "other";
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly model = "mock";

  async seedCopies({ places }: { places: Place[] }): Promise<SeedOutput> {
    const used = new Map<string, number>();
    return {
      spots: places.map((p) => {
        const k = kindOf(p);
        const n = used.get(k) ?? 0;
        used.set(k, n + 1);
        const list = BY_KIND[k];
        const [copy, form, birdLine] = list[n % list.length];
        return { placeId: p.placeId, reading: k, angle: "mock", form, copy, birdLine };
      }),
    };
  }

  async nameCutouts({ images }: { images: unknown[] }): Promise<NameOutput> {
    return { items: images.map((_, index) => ({ index, label: "見つけたもの", keep: true })) };
  }
}
