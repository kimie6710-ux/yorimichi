// The handwritten fonts only have 教育漢字. Words with other kanji are shown
// in hiragana where they're set in that font (sticker names in the notebook).
// Longer words first so e.g. 紫陽花 wins over 花.

const WORDS: [string, string][] = [
  ["紫陽花", "あじさい"],
  ["胡椒餅", "こしょうもち"],
  ["自販機", "じはんき"],
  ["唐揚げ", "からあげ"],
  ["贈られた", "おくられた"],
  ["揺れる", "ゆれる"],
  ["挿した", "さした"],
  ["出汁", "だし"],
  ["豆柴", "まめしば"],
  ["休憩", "きゅうけい"],
  ["台湾", "たいわん"],
  ["大洲", "おおず"],
  ["怖い", "こわい"],
  ["抹茶", "まっちゃ"],
  ["御膳", "ごぜん"],
  ["磨き", "みがき"],
  ["睡蓮", "すいれん"],
  ["煮干", "にぼし"],
  ["痩せ", "やせ"],
  ["太郎", "たろう"],
  ["禁煙", "きんえん"],
  ["花瓶", "かびん"],
  ["缶", "かん"],
  ["袋", "ふくろ"],
  ["壁", "かべ"],
  ["豚", "ぶた"],
  ["釜", "かま"],
  ["瓶", "びん"],
  ["猫", "ねこ"],
];

export function handFriendly(text: string): string {
  let out = text;
  for (const [kanji, kana] of WORDS) out = out.split(kanji).join(kana);
  return out;
}
