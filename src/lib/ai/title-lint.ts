import "server-only";

// Checks a batch of spot copies for the naming rules: no place names
// (spoilers), no crutch words, and not all the same shape.

const TRAILING = /[？?！!。…、\s]+$/u;
const CRUTCH = /余白|記憶|物語|呼吸|心|光|そっと|静かに|癒|秘密|エモ|穴場|隠れ家|おしゃれ/;

/** True if the copy leaks the place's real name. */
export function leaksName(copy: string, name: string): boolean {
  const n = name.replace(/\s+/g, "");
  if (n.length < 2) return false;
  // Any 3+ char chunk of the name (or the whole name if shorter) appearing in the copy.
  const size = Math.min(3, n.length);
  for (let i = 0; i + size <= n.length; i++) {
    if (copy.includes(n.slice(i, i + size))) return true;
  }
  return false;
}

export function usesCrutch(copy: string): boolean {
  return CRUTCH.test(copy);
}

export function findCopyProblems(copies: string[]): string[] {
  const clean = copies.map((t) => t.replace(TRAILING, ""));
  const problems: string[] = [];
  const endings = new Map<string, number>();
  for (const t of clean) endings.set(t.slice(-2), (endings.get(t.slice(-2)) ?? 0) + 1);
  for (const [e, n] of endings) if (n >= 3) problems.push(`語尾「${e}」が${n}件`);
  const openings = new Map<string, number>();
  for (const t of clean) if (t.length >= 4) openings.set(t.slice(0, 3), (openings.get(t.slice(0, 3)) ?? 0) + 1);
  for (const [o, n] of openings) if (n >= 3) problems.push(`書き出し「${o}」が${n}件`);
  return problems;
}
