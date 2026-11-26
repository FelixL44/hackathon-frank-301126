import { fixtureExtractor } from "../../fixtures/cases.ts";
import type { Db } from "../db/client.ts";
import { modelExtractor } from "../extraction/model-extractor.ts";
import { providerFromEnv } from "../model/from-env.ts";
import { dailyBudgetEur, spentTodayEur } from "../workflow/budget.ts";
import type { Extractor } from "../workflow/cases.ts";
import { configFromSettings } from "./settings.ts";

type Env = Record<string, string | undefined>;

/**
 * The configured model while today's budget lasts; otherwise the fixture's pre-extracted observations.
 * Values saved in the admin view win over the environment, so a pasted key works on the next case.
 * shortcut: checked once per case, so one case (or two started at once) can overshoot by its own cost, about 0.1–0.2 €.
 */
export async function extractorFor(db: Db, fixtureId: string, env: Env = process.env): Promise<Extractor> {
  const config = await configFromSettings(db, env);
  let provider: ReturnType<typeof providerFromEnv>;
  try {
    provider = providerFromEnv(config);
  } catch {
    // A half-filled admin form (provider without key) must not take intake down: fall back like fixture mode.
    return { ...fixtureExtractor(fixtureId), name: "fixture data (model misconfigured)" };
  }
  if (!provider) return fixtureExtractor(fixtureId);
  if ((await spentTodayEur(db)) >= dailyBudgetEur(config)) {
    return { ...fixtureExtractor(fixtureId), name: `fixture:${fixtureId} (daily model budget reached)` };
  }
  return modelExtractor(provider);
}

/** Header text, so nobody mistakes fixture data for a model run. Never throws: a config error must not take pages down. */
export async function extractionStatus(db: Db, env: Env = process.env): Promise<string> {
  try {
    const config = await configFromSettings(db, env);
    const provider = providerFromEnv(config);
    if (!provider) return "fixture data (no model configured)";
    const [spent, budget] = [await spentTodayEur(db), dailyBudgetEur(config)];
    const state = spent >= budget ? " · budget reached, using fixture data" : "";
    return `${provider.id} · today ${spent.toFixed(2)} € of ${budget.toFixed(2)} €${state}`;
  } catch (e) {
    return `model misconfigured: ${e instanceof Error ? e.message : String(e)}`;
  }
}
