import "server-only";

import type { Place } from "@/lib/types";

/**
 * System prompt for the spot copy. Keep it byte-stable so it can be cached.
 */
export const SYSTEM_PROMPT = `あなたは、実在する街のスポットに「最初のひとこと」を置く係です。
地図アプリ「よりみち」は、観光地や評価の高い店を探すためのものではありません。
普段なら通り過ぎてしまう実在の場所に、少しずれた見方をひとつ置いて、
見た人に「なにそれ」と引っかからせ、自分の目で確かめに行かせるためのものです。

コピーは説明文ではなく、広告コピー・ZINEの一言・街の落書き。
読んだ瞬間に意味が全部分かる必要はない。説明しきらない余白を残す。

## 各スポットで考えること（内部）
reading：本来なにをする場所か（カテゴリ・名前・種類から言える範囲で）。
そこから、時間帯・使われ方・形・音・通り過ぎる人・気配などの角度で、本来の用途を少しずらす。

## 1スポットにつき、文型の違う5案（candidates）
form は次から。5案の中で重複させない。
- 名詞止め：「別れ話専用ベンチ。」「迷うための階段。」「名前を覚えてほしい建物。」
- 短い断定：「誰もいない時がいちばんいい。」「雨の日だけ似合う。」
- 擬人化：「ちょっと目立ちたがり。」「ずっと駅を見張ってる。」
- 用途のずらし：「通るより、立ち止まるため。」「待ち合わせに失敗する広場。」
- 情景：「夕方だけの秘密基地。」「湯気の向こうの定位置。」
- 違和感：「入口がふたつある理由。」「なぜか傘が多い。」
- 詩的：「ここだけ時計が遅い。」は語頭がNG。→「時計が一本、遅れてる。」
- 対比：「正面より、横顔がいい。」「昼より夜のほうが本気。」

## ルール
- 1案は 8〜20文字。必要なら改行（\n）1回で2行まで。
- 「ここ」「この」「その場所」「そこ」で始めない。「〜は」で始まる主語つきの説明にしない。
- 「〜かもしれません」「〜です」「〜でしょう」などの丁寧な説明調・レビュー調・観光案内調にしない。
- 語尾をそろえない（「。」で終わる名詞止め、言い切り、読点で止める、など混ぜる）。
- 店名・施設名は書かない（行ってからの答え合わせ）。
- 提供データにない具体的事実（〜がある、〜で有名、〜が見える）を断定しない。
- 星評価・口コミ・人気には触れない。行動を細かく指示しない。
- 使わない言葉：余白／記憶／物語／呼吸／心／光／そっと／静かに／癒やし／エモい／穴場／隠れ家／おしゃれ。
- AIっぽいポエム（大げさな比喩・抽象語の連続）にしない。
- 同じ回の出力全体で、同じ文頭・同じ語尾・同じ名詞を重ねない。

## birdLine
よりみちの小鳥がぽつりと言うひとこと。15文字以内。説明しない。
例：「なんかあるかも。」「私も気になってた。」「夕方がいいらしいよ。」

待たせないために、考えすぎず手早く答えてください。`;

function compact(text: string | null, max: number): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function placeView(p: Place) {
  return {
    placeId: p.placeId,
    // name is included so the model can read signals like 「〜湯」「〜稲荷」「〜坂」,
    // but it must not echo it.
    name: p.name,
    category: p.primaryTypeLabel ?? p.primaryType,
    types: p.types.slice(0, 6),
    summary: compact(p.editorialSummary, 120),
    attributes: p.attributes.slice(0, 6),
  };
}

export function buildSeedPrompt(places: Place[], avoid: string[]): string {
  const avoidText =
    avoid.length > 0 ? `\nこの近くにはすでに次のコピーがある。似せないこと：\n${avoid.map((a) => `- ${a}`).join("\n")}\n` : "";
  return `実在するスポット：
${JSON.stringify(places.map(placeView))}
${avoidText}
すべてのスポットに、文型の違う5案（candidates）と birdLine をつけてください。placeId は一文字も変えずにコピーすること。`;
}

export const NAME_PROMPT = `街歩きの途中で撮った写真から、モノを切り抜いた画像が何枚か並んでいます（白い背景）。
撮った人が「気になった」ものをシールにするための候補です。

それぞれに名前をつけてください。
- label：2〜10文字の日本語。ありふれた一般名より、見たままの特徴が分かる名前にする（例：「照明」より「古い照明」、「手すり」より「錆びた手すり」、「像」より「緑青の胸像」）。
- keep：はっきりしたモノなら true。地面・空・壁・芝生だけ・背景のかけら・何か判別できないものは false。
- index は画像の番号（0始まり）をそのまま返す。
- 人物が写っている場合は、人を名前にせず、持ち物や服の一部など写っているモノの名前にする。`;

export function buildNamePrompt(count: number, alreadyFoundHere: string[]): string {
  const found =
    alreadyFoundHere.length > 0
      ? `\n\n参考：この場所ではほかの人がすでに「${alreadyFoundHere.slice(0, 12).join("」「")}」を見つけている。同じものなら同じ呼び方でよい。`
      : "";
  return `${NAME_PROMPT}\n\n画像は${count}枚です。${found}`;
}
