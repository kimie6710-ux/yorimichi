import "server-only";

// Checks a batch of spot copies for the naming rules: no place names
// (spoilers), no crutch words, and not all the same shape.

const TRAILING = /[？?！!。…、\s]+$/u;
const CRUTCH = /余白|記憶|物語|呼吸|心|光|そっと|静かに|癒|エモ|穴場|隠れ家|おしゃれ/;
/** Openings / endings the copy must avoid (explanatory tone). */
const BAD_OPENING = /^(ここ|この|その|そこ|あの)/;
const BAD_TONE = /(かもしれません|でしょう|です。?$|ます。?$|おすすめ)/;

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

/** A single copy is usable: short, not explanatory, no name, no crutch words. */
export function copyIsUsable(copy: string, name: string): boolean {
  const flat = copy.replace(/\n/g, "");
  if (flat.length < 4 || flat.length > 24) return false;
  if (BAD_OPENING.test(flat) || BAD_TONE.test(flat)) return false;
  return !leaksName(flat, name) && !usesCrutch(flat);
}

/**
 * Pick one copy per spot from its candidates so the set reads varied:
 * avoid repeating an opening, an ending or a form already used nearby.
 */
export function pickVaried<T extends { copy: string; form: string }>(
  options: T[][],
  already: string[] = [],
): (T | null)[] {
  const openings = new Set(already.map((c) => c.slice(0, 2)));
  const endings = new Set(already.map((c) => c.replace(TRAILING, "").slice(-2)));
  const forms = new Map<string, number>();
  return options.map((list) => {
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const [i, o] of list.entries()) {
      const flat = o.copy.replace(/\n/g, "");
      let score = -i * 0.3; // the model's own order is a weak hint
      if (openings.has(flat.slice(0, 2))) score -= 2;
      if (endings.has(flat.replace(TRAILING, "").slice(-2))) score -= 2;
      score -= (forms.get(o.form) ?? 0) * 1.5;
      if (score > bestScore) {
        best = o;
        bestScore = score;
      }
    }
    if (best) {
      const flat = best.copy.replace(/\n/g, "");
      openings.add(flat.slice(0, 2));
      endings.add(flat.replace(TRAILING, "").slice(-2));
      forms.set(best.form, (forms.get(best.form) ?? 0) + 1);
    }
    return best;
  });
}
