import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { openDb, type Db } from "../db/client.ts";
import { cases, events } from "../db/schema.ts";
import { costEur } from "../model/pricing.ts";
import { providerFromEnv } from "../model/from-env.ts";
import { extractionStatus, extractorFor } from "../server/extractor.ts";
import { spentTodayEur } from "./budget.ts";

let db: Db;
let close: () => Promise<void>;
let caseId: string;
before(async () => {
  const opened = await openDb({ PGLITE_DIR: "memory://" });
  await opened.migrate();
  ({ db, close } = opened);
  [{ id: caseId }] = await db.insert(cases).values({ reference: "CLM-BUDGET", replyToken: "token-budget-0123456789" }).returning();
});
after(() => close());

const local = { MODEL_PROVIDER: "openai-compatible", MODEL_ID: "qwen2.5vl", MODEL_BASE_URL: "http://localhost:1/v1" };
const spend = (eur: number, at = sql`now()`) =>
  db.insert(events).values({ caseId, caseRevision: 1, operation: "extract", result: "ok", costEur: eur, createdAt: at });

test("prices: Claude built in, local free, OpenAI needs a price before any call", () => {
  assert.ok(Math.abs(costEur("anthropic", "claude-opus-5-5", { inputTokens: 1e6, outputTokens: 0 }, {}) - 3.8) < 1e-9);
  assert.equal(costEur("openai-compatible", "qwen2.5vl", { inputTokens: 1e6, outputTokens: 1e6 }, {}), 0);
  assert.throws(() => providerFromEnv({ MODEL_PROVIDER: "openai", MODEL_ID: "gpt-5.5", OPENAI_API_KEY: "x" }), /No price known/);
  assert.ok(providerFromEnv({ MODEL_PROVIDER: "openai", MODEL_ID: "gpt-5.5", OPENAI_API_KEY: "x", MODEL_PRICE_USD_PER_MTOK: "1.25,10" }));
});

test("only today's spend counts, and reaching the budget switches to fixture data", async () => {
  await spend(5, sql`now() - interval '2 days'`); // yesterday's spend is irrelevant
  await spend(0.4);
  assert.ok(Math.abs((await spentTodayEur(db)) - 0.4) < 1e-9);
  assert.equal((await extractorFor(db, "F1-consistent", { ...local, MODEL_DAILY_BUDGET_EUR: "1" })).name, "openai-compatible:qwen2.5vl");

  await spend(0.7); // 1.1 € today
  const fallback = await extractorFor(db, "F1-consistent", { ...local, MODEL_DAILY_BUDGET_EUR: "1" });
  assert.match(fallback.name, /daily model budget reached/);
  assert.match(await extractionStatus(db, { ...local, MODEL_DAILY_BUDGET_EUR: "1" }), /1\.10 € of 1\.00 € · budget reached/);
});

test("a broken model config shows in the header instead of crashing pages", async () => {
  assert.match(await extractionStatus(db, { MODEL_PROVIDER: "antropic" }), /^model misconfigured: Unknown MODEL_PROVIDER/);
});
