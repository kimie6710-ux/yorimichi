import "server-only";

import type { NameOutput, SeedOutput } from "@/lib/schemas";
import type { Place } from "@/lib/types";

/**
 * Every AI backend implements this. To add another vendor, create a file next
 * to anthropic.ts that implements AIProvider and register it in index.ts.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** The first "なにそれ？" line for each real place. */
  seedCopies(input: { places: Place[]; avoid: string[] }): Promise<SeedOutput>;
  /** Name the things cut out of a photo (and say which are real "things"). */
  nameCutouts(input: { images: { data: string; mediaType: "image/jpeg" | "image/png" }[]; foundHere: string[] }): Promise<NameOutput>;
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
