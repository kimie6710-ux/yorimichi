import { loadDefaultJapaneseParser } from "budoux";
import { Fragment } from "react";

const parser = loadDefaultJapaneseParser();
const cache = new Map<string, string[]>();

/** Phrases a line may break between: never inside a word, never one lone character on its own line. */
export function phrases(text: string): string[] {
  const hit = cache.get(text);
  if (hit) return hit;
  const parts = parser.parse(text).filter(Boolean);
  // Glue 1-character pieces onto a neighbour (「袋」 alone on a line looks broken).
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && (p.length <= 1 || out[out.length - 1].length <= 1)) out[out.length - 1] += p;
    else out.push(p);
  }
  if (cache.size > 2000) cache.clear();
  cache.set(text, out);
  return out;
}

/**
 * Japanese text that wraps only between phrases (BudouX). Works on iPhone Safari
 * too, where `word-break: auto-phrase` isn't supported.
 */
export function Wrap({ children }: { children: string | null | undefined }) {
  if (!children) return null;
  const parts = phrases(children);
  return (
    <span className="wrap-phrase">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {p}
        </Fragment>
      ))}
    </span>
  );
}
