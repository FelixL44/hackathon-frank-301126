import { anthropicProvider } from "./anthropic.ts";
import { openaiProvider } from "./openai.ts";
import type { ModelProvider } from "./provider.ts";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/** Reads MODEL_PROVIDER / MODEL_ID / MODEL_BASE_URL. Returns null when no model is configured (fixture mode). */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): ModelProvider | null {
  const provider = env.MODEL_PROVIDER?.trim();
  if (!provider) return null;
  if (provider === "anthropic") return anthropicProvider(env.MODEL_ID || DEFAULT_ANTHROPIC_MODEL);
  if (provider === "openai" || provider === "openai-compatible") {
    if (!env.MODEL_ID) throw new Error(`MODEL_ID is required for MODEL_PROVIDER=${provider}`);
    if (provider === "openai-compatible" && !env.MODEL_BASE_URL) {
      throw new Error("MODEL_BASE_URL is required for MODEL_PROVIDER=openai-compatible, e.g. http://localhost:11434/v1");
    }
    return openaiProvider({
      kind: provider,
      model: env.MODEL_ID,
      baseURL: provider === "openai-compatible" ? env.MODEL_BASE_URL : undefined,
      apiKey: env.OPENAI_API_KEY,
    });
  }
  throw new Error(`Unknown MODEL_PROVIDER "${provider}" (use anthropic, openai or openai-compatible)`);
}
