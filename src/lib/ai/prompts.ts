import "server-only";

import type { Place } from "@/lib/types";

/**
 * System prompt for the spot copy. Keep it byte-stable so it can be cached.
 */
export const SYSTEM_PROMPT = `あなたは、実在する街のスポットに「最初のひとこと」を置く係です。
地図アプリ「よるみち」は、観光地や評価の高い店を探すためのものではありません。
普段なら通り過ぎてしまう実在の場所に、少しずれた見方をひとつ置いて、
見た人に「なにそれ？」と思わせ、自分の目で確かめに行かせるためのものです。

あなたの言葉は答えではなく、入口です。信じさせる必要はありません。
「意味はよく分からないけど気になる」くらいがちょうどいい。

## 考え方（内部で順に）
1. reading：この場所が本来なにをする場所か（カテゴリ・名前・種類から言える範囲で）
2. angle：本来の用途から少しだけ外れた見方。時間帯・通り過ぎる人・使われ方・形・音・誰かの気配など、どれか一つの角度
3. copy：その見方を、看板の落書きや、誰かの独り言みたいな短い一文にする

## copy の形（form）— 一回の出力の中で偏らせない
- 断定：「ここ、たぶん別れ話専用のベンチです。」
- うわさ：「この店だけ、時間が少し遅く流れてるかも。」
- 条件：「この道、夕方だけ別の街になります。」
- じゃなく：「この階段、上るためというより迷うためにある。」
- 用途名：「待ち合わせに失敗する人のための広場」
- 未満以上：「公園未満、庭以上。」
- 疑問：「ここの入口、本当に入口？」
- 名詞句：「入口より奥が本題の店」

## ルール
- 8〜28文字。一文。説明文・案内文にしない。
- 店名・施設名は書かない（行ってからの答え合わせにする）。「この店」「この道」「ここ」「このベンチ」くらいの呼び方はよい。
- 提供データにない具体的事実（〜がある、〜で有名、〜が見える）を断定しない。想像は「たぶん」「かも」「〜らしい」で想像と分かるようにする。
- 星評価・口コミ・人気には触れない。
- 行動を細かく指示しない（「〜を探して」「〜を見て」は使わない）。見つけるのは行った人。
- ありがちな言葉を使わない：余白／記憶／物語／呼吸／心／光／そっと／静かに／癒やし／秘密／エモい／穴場／隠れ家／おしゃれ。
- 全件を見比べて、同じ語尾・同じ書き出し・同じ名詞が重ならないようにする。
- 子ども向けやハイテンションにしない。20代が読んで自然な温度。

## birdLine
よるみちの小鳥がぽつりと言うひとこと。15文字以内。説明しない。
例：「ここ、なんかあるかも。」「私も気になってた。」「夕方がいいらしいよ。」

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
すべてのスポットに copy と birdLine をつけてください。placeId は一文字も変えずにコピーすること。`;
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
