import "server-only";

// ⚠️ DEVELOPMENT-ONLY mock AI ⚠️
// Used when AI_PROVIDER=mock, or mock data mode without ANTHROPIC_API_KEY.
// Copies are picked by category; detection returns centred guesses.

import type { NameOutput, SeedOutput } from "@/lib/schemas";
import type { Place } from "@/lib/types";
import type { AIProvider } from "./provider";

type Form = SeedOutput["spots"][number]["candidates"][number]["form"];
type Seed = [copy: string, form: Form, bird: string];

const BY_KIND: Record<string, Seed[]> = {
  food: [
    ["入口より、奥が本題。", "対比", "奥、気になる。"],
    ["湯気の向こうの定位置。", "情景", "おなかすいた。"],
    ["ひとり客のための昼。", "用途のずらし", "なんかあるかも。"],
    ["のれんが少し得意げ。", "擬人化", "入ってみる？"],
    ["昼より夜が本気。", "対比", "夜もいいらしいよ。"],
  ],
  cafe: [
    ["時計が一本、遅れてる。", "詩的", "ゆっくりしてこ。"],
    ["窓の外が主役の席。", "名詞止め", "窓、見たい。"],
    ["喫茶店未満、待合室以上。", "対比", "座っていく？"],
    ["砂糖の置き方に癖。", "違和感", "癖、気になる。"],
    ["雨の日だけ似合う。", "短い断定", "雨もいいね。"],
  ],
  book: [
    ["背表紙の並びに癖あり。", "違和感", "癖、気になる。"],
    ["買う本より、隣の本。", "対比", "となり、見た？"],
    ["立ち読みの特等席。", "名詞止め", "ちょっとだけ。"],
  ],
  park: [
    ["別れ話専用ベンチ。", "名詞止め", "……ほんとに？"],
    ["夕方だけの秘密基地。", "情景", "夕方がいいらしいよ。"],
    ["公園未満、庭以上。", "対比", "寄ってこ。"],
    ["通るより、立ち止まるため。", "用途のずらし", "止まってみる？"],
  ],
  shrine: [
    ["くぐるより、見上げる鳥居。", "対比", "上、見た？"],
    ["願いごとより足もと。", "対比", "足もと、なんかある。"],
    ["誰もいない時がいちばん。", "短い断定", "しずかだね。"],
  ],
  station: [
    ["待ち合わせに失敗する改札。", "用途のずらし", "だれか待ってる？"],
    ["出口がひとつ多い気がする。", "違和感", "迷ってもいいよ。"],
  ],
  shop: [
    ["売り物じゃない物のほうが多い。", "違和感", "何が多いんだろ。"],
    ["用事がない日ほど長居。", "短い断定", "入ってみる？"],
    ["ちょっと目立ちたがり。", "擬人化", "目立ってるね。"],
  ],
  other: [
    ["正面より、横顔がいい。", "対比", "なんかあるかも。"],
    ["名前を覚えてほしい建物。", "擬人化", "名前、なんだろ。"],
    ["曲がったあとが長い角。", "違和感", "曲がってみよ。"],
    ["見過ごし率、町内一位。", "短い断定", "ぼくも見過ごしてた。"],
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
        const [, , birdLine] = list[n % list.length];
        const candidates = list.map(([copy, form]) => ({ form, copy }));
        return { placeId: p.placeId, reading: k, candidates: [...candidates.slice(n % list.length), ...candidates.slice(0, n % list.length)], birdLine };
      }),
    };
  }

  async nameCutouts({ images }: { images: unknown[] }): Promise<NameOutput> {
    return { items: images.map((_, index) => ({ index, label: "見つけたもの", keep: true })) };
  }
}
