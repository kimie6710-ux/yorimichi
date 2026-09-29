import "server-only";

// Detects when a result set's nicknames repeat themselves, per the naming
// rules: 「っぽい」×2+, the same ending ×3+, a shared noun, or the same opening.

const NOUN_RUN = /[\p{Script=Han}\p{Script=Katakana}ー]{2,}|[A-Za-z]{3,}/gu;
const TRAILING = /[？?！!。…、\s]+$/u;

export function findTitleProblems(titles: string[]): string[] {
  const problems: string[] = [];
  const clean = titles.map((t) => t.replace(TRAILING, ""));

  const ppoi = clean.filter((t) => t.includes("っぽ")).length;
  if (ppoi >= 2) problems.push(`「っぽい」が${ppoi}件ある（1件まで）`);

  const endings = new Map<string, number>();
  for (const t of clean) {
    const e = t.slice(-2);
    endings.set(e, (endings.get(e) ?? 0) + 1);
  }
  for (const [e, n] of endings) if (n >= 3) problems.push(`語尾「${e}」が${n}件ある`);

  const nounOwners = new Map<string, Set<number>>();
  clean.forEach((t, i) => {
    for (const m of t.matchAll(NOUN_RUN)) {
      const set = nounOwners.get(m[0]) ?? new Set<number>();
      set.add(i);
      nounOwners.set(m[0], set);
    }
  });
  for (const [noun, owners] of nounOwners) {
    if (owners.size >= 2) problems.push(`「${noun}」が${owners.size}つのタイトルに出ている`);
  }

  const openings = new Map<string, number>();
  for (const t of clean) {
    if (t.length < 4) continue;
    const o = t.slice(0, 3);
    openings.set(o, (openings.get(o) ?? 0) + 1);
  }
  for (const [o, n] of openings) if (n >= 2) problems.push(`書き出し「${o}」が${n}件同じ`);

  // Same sentence shape: many titles ending in a plain verb (…る／…する).
  const verbEnding = clean.filter((t) => /(る|う|く|す|む|ぶ|つ|ぐ)$/.test(t)).length;
  if (verbEnding >= 2) problems.push(`動詞で終わる説明文のタイトルが${verbEnding}件ある（短いコピーにする）`);
  const woPattern = clean.filter((t) => /^[^、。]{1,8}を[^、。]+(る|する)$/.test(t)).length;
  if (woPattern >= 2) problems.push(`「〇〇を〇〇する」の形が${woPattern}件ある（1件まで）`);

  // Crutch words should stay under ~10% of the set.
  const crutch = /っぽ|寄り道|落ち着|静か|癒|穴場|隠れ家|おしゃれ|余白|記憶|物語|呼吸|心|光|そっと|秘密|な場所|な時間|する場所|してみる/;
  const crutchCount = clean.filter((t) => crutch.test(t)).length;
  if (crutchCount > Math.floor(clean.length * 0.1)) {
    problems.push(`ありがちな言葉（っぽい・静か・余白・記憶・物語・光・心・〜な場所 など）に頼ったタイトルが${crutchCount}件ある`);
  }

  // Category words mean the copy is describing, not inventing a use.


  return problems;
}
