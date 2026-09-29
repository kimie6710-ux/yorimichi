import "server-only";

import type { InterpretationOutput, RetitleOutput, ShortlistOutput } from "@/lib/schemas";
import type { InterpretedIntent, Place } from "@/lib/types";

/**
 * Every AI backend implements this. To add OpenAI / Gemini, create a new file
 * next to anthropic.ts that implements AIProvider and register it in index.ts.
 * Nothing outside src/lib/ai knows which vendor is used.
 */
export interface AIProvider {
  readonly name: string;
  /** Stage 1: expand intent + shortlist from basic info (no reviews). */
  shortlist(input: { query: string; places: Place[] }): Promise<ShortlistOutput>;
  /** Stage 2: final "slightly off" interpretation over detailed places. */
  interpret(input: {
    query: string;
    intent: InterpretedIntent | null;
    places: Place[];
  }): Promise<InterpretationOutput>;
  /** Repair pass: rename only the titles when the set repeats itself. */
  retitle(input: {
    query: string;
    items: RetitleItem[];
    problems: string[];
  }): Promise<RetitleOutput>;
}

export interface RetitleItem {
  placeId: string;
  title: string;
  interpretationAxis: string;
  category: string | null;
  name: string;
  why: string;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly reason: "not_configured" | "refused" | "invalid_output" | "api_error" | "timeout",
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
