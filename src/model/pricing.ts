// Cost of a model call in EUR, for the daily budget guard (HAC-21).
import type { ModelProvider } from "./provider.ts";

/** USD per million tokens [input, output], from the Anthropic price list (Nov 2026). */
const CLAUDE_USD_PER_MTOK: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};
const UNKNOWN_CLAUDE: [number, number] = [8, 40]; // e.g. a fallback model: assume the most expensive tier

// shortcut: fixed rate, deliberately above the real one so the budget errs on the strict side; update if EUR weakens.
const EUR_PER_USD = 0.95;

/** Throws when no price is known, so a misconfigured model is caught before any money is spent. */
export function usdPerMTok(kind: ModelProvider["kind"], model: string, env: Record<string, string | undefined>): [number, number] {
  const override = env.MODEL_PRICE_USD_PER_MTOK?.split(",").map(Number);
  if (override?.length === 2 && override.every((n) => Number.isFinite(n) && n >= 0)) return [override[0]!, override[1]!];
  if (kind === "openai-compatible") return [0, 0]; // runs on your own machine
  if (kind === "anthropic") return CLAUDE_USD_PER_MTOK[model] ?? UNKNOWN_CLAUDE;
  throw new Error(
    `No price known for ${kind}:${model}. Set MODEL_PRICE_USD_PER_MTOK=<input>,<output> from the provider's pricing page.`,
  );
}

export function costEur(
  kind: ModelProvider["kind"],
  model: string,
  tokens: { inputTokens: number; outputTokens: number },
  env: Record<string, string | undefined> = process.env,
) {
  const [input, output] = usdPerMTok(kind, model, env);
  return ((tokens.inputTokens * input + tokens.outputTokens * output) / 1_000_000) * EUR_PER_USD;
}
