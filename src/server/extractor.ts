import { fixtureExtractor } from "../../fixtures/cases.ts";
import type { Db } from "../db/client.ts";
import { modelExtractor } from "../extraction/model-extractor.ts";
import { providerFromEnv } from "../model/from-env.ts";
import { dailyBudgetEur, spentTodayEur } from "../workflow/budget.ts";
import type { Extractor } from "../workflow/cases.ts";

type Env = Record<string, string | undefined>;

/**
 * The configured model while today's budget lasts; otherwise the fixture's pre-extracted observations.
 * shortcut: checked once per case, so one case (or two started at once) can overshoot by its own cost, about 0.1–0.2 €.
 */
export async function extractorFor(db: Db, fixtureId: string, env: Env = process.env): Promise<Extractor> {
  const provider = providerFromEnv(env);
  if (!provider) return fixtureExtractor(fixtureId);
  if ((await spentTodayEur(db)) >= dailyBudgetEur(env)) {
    return { ...fixtureExtractor(fixtureId), name: `fixture:${fixtureId} (daily model budget reached)` };
  }
  return modelExtractor(provider);
}

/** Header text, so nobody mistakes fixture data for a model run. Never throws: a config error must not take pages down. */
export async function extractionStatus(db: Db, env: Env = process.env): Promise<string> {
  try {
    const provider = providerFromEnv(env);
    if (!provider) return "fixture data (no model configured)";
    const [spent, budget] = [await spentTodayEur(db), dailyBudgetEur(env)];
    const state = spent >= budget ? " · budget reached, using fixture data" : "";
    return `${provider.id} · today ${spent.toFixed(2)} € of ${budget.toFixed(2)} €${state}`;
  } catch (e) {
    return `model misconfigured: ${e instanceof Error ? e.message : String(e)}`;
  }
}
