import "server-only";

import { isMockModeServer, serverEnv } from "@/lib/server/env";
import { AnthropicProvider } from "./anthropic";
import { MockAIProvider } from "./mock";
import { AIProviderError, type AIProvider } from "./provider";

let cached: AIProvider | null = null;

/**
 * Resolve the AI backend from AI_PROVIDER.
 * - "anthropic" (default): Claude via @anthropic-ai/sdk
 * - "mock": development-only keyword interpreter (refused in production)
 * In mock-data mode without an Anthropic key we fall back to the mock
 * interpreter so the whole flow can be demoed with zero keys.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  if (serverEnv.aiProvider === "off") throw new AIProviderError("AI is turned off (AI_PROVIDER=off)", "not_configured");

  const wantsMock =
    serverEnv.aiProvider === "mock" || ((isMockModeServer() || !serverEnv.anthropicApiKey) && process.env.VERCEL_ENV !== "production");

  if (wantsMock) {
    if (process.env.VERCEL_ENV === "production") {
      throw new AIProviderError("Mock AI provider is disabled in production", "not_configured");
    }
    cached = new MockAIProvider();
    return cached;
  }

  switch (serverEnv.aiProvider) {
    case "anthropic":
      cached = new AnthropicProvider();
      return cached;
    // case "openai": cached = new OpenAIProvider(); return cached;
    // case "gemini": cached = new GeminiProvider(); return cached;
    default:
      throw new AIProviderError(`Unknown AI_PROVIDER: ${serverEnv.aiProvider}`, "not_configured");
  }
}

export { AIProviderError } from "./provider";
export type { AIProvider } from "./provider";
