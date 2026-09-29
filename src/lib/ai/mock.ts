import "server-only";

// ⚠️ DEVELOPMENT-ONLY mock interpreter ⚠️
// Used when NEXT_PUBLIC_USE_MOCK_DATA=true and no ANTHROPIC_API_KEY is set, or
// AI_PROVIDER=mock. Titles are hand-written short copies for the
// development-only mock places (mixed forms, no repeated patterns), and every
// internal "why" quotes a review that actually exists in the mock data.

import type { InterpretationOutput, RetitleOutput, ShortlistOutput } from "@/lib/schemas";
import type { Place } from "@/lib/types";
import type { AIProvider } from "./provider";

type IntentKey = "book" | "calm" | "sweet" | "coffee" | "food" | "walk" | "bored";
type CopyForm = InterpretationOutput["places"][number]["copyForm"];
type ShiftType = InterpretationOutput["places"][number]["shiftType"];

interface Pick {
  /** Mock place key (placeId without the "mock_" prefix). */
  key: string;
  title: string | ((object: string) => string);
  form: CopyForm;
  shift: ShiftType;
  /** Internal: the invented use. */
  use: string;
  /** Word used to find the supporting review (internal "why" only). */
  evidence: string;
  line: string;
}

interface MockIntent {
  literal: string;
  /** Associations shown as 「みちびの連想」. Empty = don't show the chip. */
  expanded: string[];
  comment: string;
  /** First entry is the literal pick. */
  picks: Pick[];
}

const INTENTS: Record<IntentKey, MockIntent> = {
  book: {
    literal: "本を見たい",
    expanded: ["一人", "本棚", "漫画", "長居", "ページをめくる"],
    comment: "本屋じゃないとこのほうが、本だったりする。",
    picks: [
      { key: "bookstore", title: "店主の本棚、公開中", form: "名詞句", shift: "行動", use: "選んだ人の好みを覗く", evidence: "選書", line: "たまには、まっすぐ本屋でもいいよ。" },
      { key: "chuka", title: "麺つきの漫画喫茶", form: "新しい用途名", shift: "用途", use: "麺を待つ間に漫画を読む", evidence: "漫画", line: "麺が来るまで、ここは本屋。" },
      { key: "kissa", title: "BGMじゃなく、ページの音", form: "じゃなく", shift: "感情", use: "音の小さい店で読む", evidence: "BGM", line: "しーん。……この感じ、本屋に近くない？" },
      { key: "laundry", title: "乾くまで、ここ図書室にならない？", form: "疑問形", shift: "時間", use: "待ち時間に古雑誌を読む", evidence: "雑誌", line: "回ってる間は、読書の時間。" },
      { key: "zakka", title: "本未満、雑貨以上", form: "未満以上", shift: "詩的", use: "紙ものを本のように眺める", evidence: "紙もの", line: "ページの外にある本、みたいな。" },
    ],
  },
  calm: {
    literal: "ひと息つきたい",
    expanded: ["ひとり", "木陰", "ベンチ", "ぼーっと", "音が小さい"],
    comment: "ひと息つく先、カフェだけじゃないよ。",
    picks: [
      { key: "kissa", title: "カップの音だけの避難所", form: "新しい用途名", shift: "感情", use: "話し声のない店で休む", evidence: "BGM", line: "ここは、ちゃんとひと息つけるやつ。" },
      { key: "shrine", title: "今日は、店じゃないほう。", form: "短い断定", shift: "用途", use: "お金を使わずに休む", evidence: "木陰", line: "誰もいないの、ちょっとうれしい。" },
      { key: "laundry", title: "予定のない夜の待合室", form: "のない", shift: "時間", use: "夜に乾燥機の前で座る", evidence: "乾燥機", line: "ごうんごうん……で、ほっとするんだよね。" },
      { key: "park", title: "夕方のベンチ、空いてない？", form: "疑問形", shift: "行動", use: "夕方にベンチで休む", evidence: "夕方", line: "夕方になったら、また来て。" },
      { key: "sento", title: "富士山つきの考えない時間", form: "名詞句", shift: "詩的", use: "ペンキ絵を見上げて頭を休める", evidence: "富士山", line: "富士山、見てるだけでいいよ。" },
    ],
  },
  sweet: {
    literal: "甘いものを食べたい",
    expanded: ["甘い", "クリーム", "プリン", "焼きたて", "おやつ"],
    comment: "甘さにも、いろんな形があるみたい。",
    picks: [
      { key: "bakery", title: "朝いちばんのクリーム", form: "名詞句", shift: "時間", use: "朝のクリームパン", evidence: "クリームパン", line: "甘いの、ここは正攻法。" },
      { key: "kissa", title: "ケーキじゃなく、固めプリン", form: "じゃなく", shift: "行動", use: "プリンを目当てに行く", evidence: "プリン", line: "プリンは固い派？" },
      { key: "zakka", title: "お菓子未満、切手以上", form: "未満以上", shift: "詩的", use: "切手をお菓子のように眺める", evidence: "切手", line: "切手って、ちょっとお菓子の包み紙。" },
      { key: "chuka", title: "甘さのない満腹休憩", form: "のない", shift: "用途", use: "甘いものの代わりに一杯", evidence: "漫画", line: "甘くはない。でも満たされる。" },
      { key: "park", title: "持ち込みおやつの屋外席", form: "新しい用途名", shift: "感情", use: "買ったおやつをベンチで食べる", evidence: "ベンチ", line: "おやつは持ち込みでどうぞ。" },
    ],
  },
  coffee: {
    literal: "コーヒーを飲みたい",
    expanded: ["一杯", "カウンター", "ひと息", "香り", "座れる場所"],
    comment: "一杯の置き場所、いろいろあるよ。",
    picks: [
      { key: "kissa", title: "40年ものの一杯", form: "名詞句", shift: "時間", use: "古い店で一杯", evidence: "創業", line: "まずは、ちゃんとした一杯。" },
      { key: "bakery", title: "コーヒーのお供、先に買う？", form: "疑問形", shift: "行動", use: "パンを買ってから飲む", evidence: "焼きたて", line: "コーヒーのお供、先に買っとく？" },
      { key: "shrine", title: "テイクアウトの行き先", form: "新しい用途名", shift: "用途", use: "持ち帰りの一杯を木陰で飲む", evidence: "木陰", line: "ここで飲むと、ちょっと特別。" },
      { key: "park", title: "注文のない休憩席", form: "のない", shift: "感情", use: "買わずに座れる席", evidence: "ベンチ", line: "どのベンチにする？" },
    ],
  },
  food: {
    literal: "なにか食べたい",
    expanded: ["お腹すいた", "昔ながら", "一人でも入れる", "匂い"],
    comment: "食べたいものからは、ちょっとだけ遠回り。",
    picks: [
      { key: "chuka", title: (x) => `${x}じゃなく、ラーメン`, form: "じゃなく", shift: "用途", use: "別のもので満たす", evidence: "ラーメン", line: "ちょっと浮気しても、怒られないよ。" },
      { key: "kissa", title: "食後の固めプリン", form: "名詞句", shift: "時間", use: "ごはんのあとの一品", evidence: "プリン", line: "締めの一品って、大事でしょ。" },
      { key: "bakery", title: "今日は、匂いのするほう。", form: "短い断定", shift: "感情", use: "匂いで行き先を決める", evidence: "匂い", line: "匂いにつられるのも、アリ。" },
      { key: "sento", title: "ごはん前の空腹製造所", form: "新しい用途名", shift: "詩的", use: "食べる前にお腹をすかせる", evidence: "昔ながら", line: "空腹も、湯上がりだと楽しい。" },
    ],
  },
  walk: {
    literal: "少し歩きたい",
    expanded: ["曲がり角", "木陰", "ゴール", "見上げる"],
    comment: "目的地は、歩きながら決めればいい。",
    picks: [
      { key: "park", title: "桜の木までの目的地", form: "名詞句", shift: "行動", use: "木を目印に歩く", evidence: "桜", line: "まずは、あの木まで。" },
      { key: "shrine", title: "住宅街の折り返し地点", form: "新しい用途名", shift: "用途", use: "散歩のUターン地点", evidence: "住宅街", line: "ここで折り返そ。" },
      { key: "bakery", title: "いい匂いのほう、曲がる？", form: "疑問形", shift: "感情", use: "匂いで道を選ぶ", evidence: "匂い", line: "鼻で歩くの、けっこう楽しい。" },
      { key: "sento", title: "ゴールは湯船。", form: "短い断定", shift: "時間", use: "散歩の終点にする", evidence: "昔ながら", line: "歩いたぶん、あったまろ。" },
    ],
  },
  bored: {
    literal: "なにか面白いものに出会いたい",
    expanded: ["宝探し", "レトロ", "時間がつぶれる", "眺める"],
    comment: "暇って、街を見るのにちょうどいい。",
    picks: [
      { key: "usedbooks", title: "天井までの宝探し", form: "名詞句", shift: "行動", use: "棚の上まで探す", evidence: "天井", line: "上の方、まだ誰も見てないかも。" },
      { key: "sento", title: "脱衣所の漫画コーナー", form: "新しい用途名", shift: "用途", use: "湯上がりに漫画を読む", evidence: "漫画", line: "暇つぶしの天才がいる湯。" },
      { key: "laundry", title: "乾燥機、見に行かない？", form: "疑問形", shift: "詩的", use: "回るのを眺める", evidence: "乾燥機", line: "音を聴くだけの夜、あるよ。" },
      { key: "shrine", title: "ここ、みちびの基地。", form: "短い断定", shift: "感情", use: "誰もいない奥で過ごす", evidence: "住宅街", line: "ここ、ぼくの基地のひとつ。" },
      { key: "zakka", title: "買い物未満、散歩以上", form: "未満以上", shift: "時間", use: "眺めるだけで時間をつぶす", evidence: "時間", line: "気づいたら30分たってるやつ。" },
    ],
  },
};

/** Varied forms for places without a hand-written copy. */
const GENERIC_TITLES: { title: string; form: CopyForm }[] = [
  { title: "今日は、こっちのほう。", form: "短い断定" },
  { title: "予定のない5分の行き先", form: "のない" },
  { title: "ここ、寄ってもよくない？", form: "疑問形" },
  { title: "次の予定までの避難所", form: "新しい用途名" },
];

/**
 * Keyword intent detection for the development-only mock.
 * `matched: false` means we don't really understand the query — the mock then
 * hides its association chip instead of pretending (real Claude handles these).
 */
function detectIntent(query: string): { key: IntentKey; object: string; matched: boolean } {
  if (/甘|スイーツ|おやつ|ケーキ|デザート|パフェ/.test(query)) return { key: "sweet", object: "", matched: true };
  if (/本|読|書|漫画|マンガ/.test(query)) return { key: "book", object: "", matched: true };
  if (/落ち着|静|ひとり|一人|休|ぼー|癒|疲れ/.test(query)) return { key: "calm", object: "", matched: true };
  if (/コーヒー|珈琲|カフェ|喫茶|お茶/.test(query)) return { key: "coffee", object: "", matched: true };
  if (/散歩|さんぽ|歩|ぶらぶら|ぶらり/.test(query)) return { key: "walk", object: "", matched: true };
  const food = query.match(/^(.+?)(?:が|を)?(?:食べ|たべ|飲み|のみ)/);
  if (food || /ご飯|ごはん|ランチ|腹|お昼|夕飯|晩ごはん/.test(query)) {
    return { key: "food", object: food?.[1]?.trim() || "ごはん", matched: true };
  }
  if (/暇|ひま|面白|おもしろ|なんか|退屈|つまらな/.test(query)) return { key: "bored", object: "", matched: true };
  return { key: "bored", object: "", matched: false };
}

function quoteFor(place: Place, word: string): string | null {
  const texts = [...place.reviews.map((r) => r.text), place.editorialSummary ?? ""];
  const hit = texts.find((t) => t.includes(word));
  if (!hit) return null;
  const sentence = hit.split(/[。！？]/).find((s) => s.includes(word)) ?? hit;
  return sentence.length > 32 ? `${sentence.slice(0, 32)}…` : sentence;
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async shortlist({ query, places }: Parameters<AIProvider["shortlist"]>[0]): Promise<ShortlistOutput> {
    const detected = detectIntent(query);
    const intent = INTENTS[detected.key];
    const wanted = new Set(intent.picks.map((p) => `mock_${p.key}`));
    const ordered = [
      ...places.filter((p) => wanted.has(p.placeId)),
      ...places.filter((p) => !wanted.has(p.placeId)),
    ];
    return {
      literal: detected.matched ? intent.literal : query,
      expanded: detected.matched ? intent.expanded : [],
      candidatePlaceIds: ordered.slice(0, 8).map((p) => p.placeId),
    };
  }

  async interpret({ query, places }: Parameters<AIProvider["interpret"]>[0]): Promise<InterpretationOutput> {
    const { key, object, matched } = detectIntent(query);
    const intent = INTENTS[key];
    const byId = new Map(places.map((p) => [p.placeId, p]));

    const curated = intent.picks
      .map((pick, i) => ({ pick, place: byId.get(`mock_${pick.key}`), literal: i === 0 }))
      .filter((x): x is { pick: Pick; place: Place; literal: boolean } => Boolean(x.place));

    const results: InterpretationOutput["places"] = curated.map(({ pick, place, literal }) => {
      const label = place.primaryTypeLabel ?? "場所";
      const quote = quoteFor(place, pick.evidence);
      return {
        placeId: place.placeId,
        realPurpose: label,
        hiddenUserNeed: intent.literal,
        reinterpretedPurpose: pick.use,
        shiftType: pick.shift,
        copyForm: pick.form,
        title: typeof pick.title === "function" ? pick.title(object) : pick.title,
        // internal evidence only — never shown to users
        why: quote ? `口コミ:「${quote}」` : `${label}・徒歩${place.walkMinutes}分`,
        michibiLine: pick.line,
        kind: literal ? "literal" : "shifted",
        surpriseScore: literal ? 1 : 3,
        confidence: literal ? 0.9 : 0.7,
      };
    });

    // Non-mock places (AI_PROVIDER=mock with real data): varied generic copies.
    if (results.length < 3) {
      const used = new Set(results.map((r) => r.placeId));
      places
        .filter((p) => !used.has(p.placeId))
        .slice(0, 4 - results.length)
        .forEach((p, i) => {
          const g = GENERIC_TITLES[i % GENERIC_TITLES.length];
          const label = p.primaryTypeLabel ?? "場所";
          results.push({
            placeId: p.placeId,
            realPurpose: label,
            hiddenUserNeed: query,
            reinterpretedPurpose: "",
            shiftType: "用途",
            copyForm: g.form,
            title: g.title,
            why: `${label}・徒歩${p.walkMinutes}分`,
            michibiLine: "なんとなく、気になる。",
            kind: results.length === 0 ? "literal" : "shifted",
            surpriseScore: 2,
            confidence: 0.4,
          });
        });
    }

    return {
      interpretedIntent: matched
        ? { literal: intent.literal, expanded: intent.expanded }
        : { literal: query, expanded: [] },
      michibiComment: matched ? intent.comment : "ちゃんと分かってないかも。でも、行ってみたら分かるかも。",
      places: results,
    };
  }

  async retitle({ items }: Parameters<AIProvider["retitle"]>[0]): Promise<RetitleOutput> {
    return {
      titles: items.map((i) => ({ placeId: i.placeId, title: i.title, interpretationAxis: i.interpretationAxis })),
    };
  }
}
