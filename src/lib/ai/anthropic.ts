import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

import {
  interpretationOutputSchema,
  retitleOutputSchema,
  shortlistOutputSchema,
  type InterpretationOutput,
  type RetitleOutput,
  type ShortlistOutput,
} from "@/lib/schemas";
import { serverEnv } from "@/lib/server/env";
import { buildInterpretPrompt, buildRetitlePrompt, buildShortlistPrompt, SYSTEM_PROMPT } from "./prompts";
import { AIProviderError, type AIProvider } from "./provider";

/** Models that accept `output_config.effort` and server-side refusal fallbacks. */
function supportsEffortAndFallbacks(model: string): boolean {
  return /^claude-(opus-5|opus-4-[678]|fable|sonnet-5)/.test(model);
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor() {
    if (!serverEnv.anthropicApiKey) {
      throw new AIProviderError("ANTHROPIC_API_KEY is not set", "not_configured");
    }
    this.client = new Anthropic({
      apiKey: serverEnv.anthropicApiKey,
      timeout: 30_000,
      maxRetries: 1,
    });
  }

  private async call<S extends z.ZodType>(
    model: string,
    schema: S,
    prompt: string,
  ): Promise<z.infer<S>> {
    const modern = supportsEffortAndFallbacks(model);
    try {
      const response = await this.client.beta.messages.parse({
        model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        output_config: {
          format: betaZodOutputFormat(schema),
          ...(modern ? { effort: serverEnv.anthropicEffort } : {}),
        },
        // On a safety decline, let the API re-run on Anthropic's recommended fallback.
        ...(modern
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      });

      if (response.stop_reason === "refusal") {
        throw new AIProviderError("The model declined this request", "refused");
      }
      if (response.parsed_output == null) {
        throw new AIProviderError(
          `No structured output (stop_reason=${response.stop_reason})`,
          "invalid_output",
        );
      }
      return response.parsed_output as z.infer<S>;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        throw new AIProviderError("Anthropic API timed out", "timeout");
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new AIProviderError("Invalid ANTHROPIC_API_KEY", "not_configured");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new AIProviderError("Anthropic rate limit", "api_error");
      }
      if (err instanceof Anthropic.APIError) {
        throw new AIProviderError(`Anthropic API error ${err.status}: ${err.message}`, "api_error");
      }
      throw new AIProviderError(
        `Failed to parse model output: ${err instanceof Error ? err.message : String(err)}`,
        "invalid_output",
      );
    }
  }

  shortlist({ query, places }: Parameters<AIProvider["shortlist"]>[0]): Promise<ShortlistOutput> {
    return this.call(
      serverEnv.anthropicShortlistModel,
      shortlistOutputSchema,
      buildShortlistPrompt(query, places),
    );
  }

  interpret({
    query,
    intent,
    places,
  }: Parameters<AIProvider["interpret"]>[0]): Promise<InterpretationOutput> {
    return this.call(
      serverEnv.anthropicModel,
      interpretationOutputSchema,
      buildInterpretPrompt(query, intent, places),
    );
  }

  retitle({ query, items, problems }: Parameters<AIProvider["retitle"]>[0]): Promise<RetitleOutput> {
    return this.call(
      serverEnv.anthropicModel,
      retitleOutputSchema,
      buildRetitlePrompt(query, items, problems),
    );
  }
}
