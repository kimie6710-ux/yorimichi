import "server-only";

import { MICHIBI_LINES } from "@/lib/character";
import { enrichPlaceDetails } from "@/lib/places/google";
import type { InterpretationOutput } from "@/lib/schemas";
import { serverEnv } from "@/lib/server/env";
import type {
  AIRecommendation,
  InterpretedIntent,
  LatLng,
  Place,
  RecommendedSpot,
  SearchMode,
} from "@/lib/types";
import { AIProviderError, getAIProvider } from "./index";
import { findTitleProblems } from "./title-lint";

const SHORTLIST_THRESHOLD = 8;
const MAX_RESULTS = 5;

export interface PipelineResult {
  interpretedIntent: InterpretedIntent | null;
  spots: RecommendedSpot[];
  mode: SearchMode;
  michibiComment: string;
  notice: string | null;
  /** Places after detail enrichment (for the client to cache). */
  places: Place[];
}

// ── helpers ───────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const trim = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Pick N places spread across categories, nearest first. Deterministic. */
function diverseNearest(places: Place[], n: number): Place[] {
  const byType = new Map<string, Place[]>();
  for (const p of [...places].sort((a, b) => a.distanceMeters - b.distanceMeters)) {
    const key = p.primaryType ?? "other";
    byType.set(key, [...(byType.get(key) ?? []), p]);
  }
  const buckets = [...byType.values()];
  const out: Place[] = [];
  for (let i = 0; out.length < n && buckets.some((b) => b.length > i); i++) {
    for (const b of buckets) {
      if (b[i] && out.length < n) out.push(b[i]);
    }
  }
  return out;
}

/**
 * Enforce the recommendation rules on whatever the model returned:
 * only known placeIds, no duplicates, clamped scores, bounded strings,
 * and ≤ MAX_RESULTS with at least one literal kept when available.
 */
export function validateInterpretation(
  output: InterpretationOutput,
  places: Place[],
): RecommendedSpot[] {
  const byId = new Map(places.map((p) => [p.placeId, p]));
  const seen = new Set<string>();
  const spots: RecommendedSpot[] = [];

  for (const r of output.places) {
    const place = byId.get(r.placeId);
    if (!place || seen.has(r.placeId)) continue; // rule 1 & 2: never invent / alter ids
    if (!r.title.trim() || !r.why.trim()) continue;
    seen.add(r.placeId);
    const recommendation: AIRecommendation = {
      id: crypto.randomUUID(),
      placeId: place.placeId,
      title: trim(r.title, 28),
      interpretation: trim(r.reinterpretedPurpose, 120),
      why: trim(r.why, 160),
      michibiLine: trim(r.michibiLine, 40),
      interpretationAxis: r.shiftType,
      realPurpose: trim(r.realPurpose, 60),
      hiddenUserNeed: trim(r.hiddenUserNeed, 60),
      reinterpretedPurpose: trim(r.reinterpretedPurpose, 80),
      kind: r.kind,
      surpriseScore: clamp(Math.round(r.surpriseScore), 1, 5),
      confidence: clamp(r.confidence, 0, 1),
    };
    spots.push({ recommendation, place });
  }

  if (spots.length <= MAX_RESULTS) return spots;
  const literal = spots.find((s) => s.recommendation.kind === "literal");
  const rest = spots.filter((s) => s !== literal);
  return literal ? [literal, ...rest.slice(0, MAX_RESULTS - 1)] : spots.slice(0, MAX_RESULTS);
}

/** Non-AI fallback: plain nearby spots so the user is never left with nothing. */
export function fallbackSpots(places: Place[]): RecommendedSpot[] {
  return diverseNearest(places, 4).map((place) => ({
    place,
    recommendation: {
      id: crypto.randomUUID(),
      placeId: place.placeId,
      title: `徒歩${place.walkMinutes}分の、まだ知らない場所`,
      interpretation: "近くにある、ふつうにいい場所。",
      why: `現在地から徒歩${place.walkMinutes}分。`,
      michibiLine: "ここは、ふつうにいいとこ。",
      interpretationAxis: "距離",
      realPurpose: "",
      hiddenUserNeed: "",
      reinterpretedPurpose: "",
      kind: "literal",
      surpriseScore: 1,
      confidence: 0,
    },
  }));
}

async function shortlist(query: string, places: Place[]): Promise<{
  candidates: Place[];
  intent: InterpretedIntent | null;
}> {
  if (places.length <= SHORTLIST_THRESHOLD) return { candidates: places, intent: null };
  try {
    const out = await getAIProvider().shortlist({ query, places });
    const byId = new Map(places.map((p) => [p.placeId, p]));
    const picked = [...new Set(out.candidatePlaceIds)]
      .map((id) => byId.get(id))
      .filter((p): p is Place => Boolean(p))
      .slice(0, 8);
    if (picked.length >= 3) {
      // Top up with a couple of diverse extras so stage 2 still has room to surprise.
      const extras = diverseNearest(
        places.filter((p) => !picked.includes(p)),
        Math.max(0, 6 - picked.length),
      );
      return {
        candidates: [...picked, ...extras],
        intent: { literal: out.literal, expanded: out.expanded.slice(0, 12) },
      };
    }
  } catch (err) {
    console.warn("[pipeline] shortlist failed, using heuristic:", err);
  }
  return { candidates: diverseNearest(places, 8), intent: null };
}

/**
 * If the nicknames repeat themselves (same pattern / ending / noun),
 * ask the model once to rename just the titles. Best effort.
 */
async function polishTitles(query: string, spots: RecommendedSpot[]): Promise<RecommendedSpot[]> {
  const problems = findTitleProblems(spots.map((s) => s.recommendation.title));
  if (problems.length === 0) return spots;
  try {
    const out = await getAIProvider().retitle({
      query,
      problems,
      items: spots.map(({ recommendation: r, place }) => ({
        placeId: r.placeId,
        title: r.title,
        interpretationAxis: r.interpretationAxis,
        category: place.primaryTypeLabel,
        name: place.name,
        why: r.why,
      })),
    });
    const next = new Map(out.titles.map((t) => [t.placeId, t]));
    const renamed = spots.map((s) => {
      const t = next.get(s.place.placeId);
      if (!t || !t.title.trim()) return s;
      return {
        ...s,
        recommendation: {
          ...s.recommendation,
          title: trim(t.title, 28),
          interpretationAxis: trim(t.interpretationAxis || s.recommendation.interpretationAxis, 16),
        },
      };
    });
    // Keep the repair only if it actually reduced the problems.
    const after = findTitleProblems(renamed.map((s) => s.recommendation.title));
    return after.length < problems.length ? renamed : spots;
  } catch (err) {
    console.warn("[pipeline] retitle failed, keeping original titles:", err);
    return spots;
  }
}

// ── main ──────────────────────────────────────────────────

export async function runInterpretation(
  query: string,
  origin: LatLng,
  places: Place[],
): Promise<PipelineResult> {
  const isMockData = places.every((p) => p.isMock);

  // Stage 1 — shortlist on basic info.
  let stage1: Awaited<ReturnType<typeof shortlist>>;
  try {
    stage1 = await shortlist(query, places);
  } catch {
    stage1 = { candidates: diverseNearest(places, 8), intent: null };
  }

  // Details — reviews/atmosphere only for the shortlisted few.
  let candidates = stage1.candidates;
  if (!isMockData && serverEnv.placesApiKey) {
    try {
      candidates = await enrichPlaceDetails(candidates, origin);
    } catch (err) {
      console.warn("[pipeline] details failed, continuing with basic info:", err);
    }
  }
  const mergedPlaces = places.map((p) => candidates.find((c) => c.placeId === p.placeId) ?? p);

  // Stage 2 — final interpretation.
  try {
    const output = await getAIProvider().interpret({
      query,
      intent: stage1.intent,
      places: candidates,
    });
    const spots = await polishTitles(query, validateInterpretation(output, candidates));
    if (spots.length === 0) {
      return {
        interpretedIntent: output.interpretedIntent,
        spots: fallbackSpots(places),
        mode: "fallback",
        michibiComment: MICHIBI_LINES.aiEmpty,
        notice: "今日はうまく寄り道先が見つからなかったので、近くの場所を並べています。",
        places: mergedPlaces,
      };
    }
    return {
      interpretedIntent: {
        literal: trim(output.interpretedIntent.literal, 60),
        expanded: output.interpretedIntent.expanded.map((e) => trim(e, 20)).slice(0, 12),
      },
      spots,
      mode: isMockData ? "mock" : "ai",
      michibiComment: trim(output.michibiComment, 60),
      notice: null,
      places: mergedPlaces,
    };
  } catch (err) {
    const reason = err instanceof AIProviderError ? err.reason : "api_error";
    console.error("[pipeline] interpret failed:", err);
    return {
      interpretedIntent: stage1.intent,
      spots: fallbackSpots(places),
      mode: "fallback",
      michibiComment: MICHIBI_LINES.fallback,
      notice:
        reason === "not_configured"
          ? "いまは近くの場所をそのまま並べています。"
          : "今日はうまく寄り道先が見つからなかったので、近くの場所を並べています。",
      places: mergedPlaces,
    };
  }
}
