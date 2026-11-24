import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { FIXTURE_CASES, fixtureExtractor } from "../../fixtures/cases.ts";
import { openDb, type Db } from "../db/client.ts";
import { cases, events, observations } from "../db/schema.ts";
import { ExtractionError } from "../extraction/model-extractor.ts";
import { caseView, openCase, resumeCase, type Extractor } from "./cases.ts";

let db: Db;
let close: () => Promise<void>;
before(async () => {
  const opened = await openDb({ PGLITE_DIR: "memory://" });
  await opened.migrate();
  ({ db, close } = opened);
});
after(() => close());

const F1 = FIXTURE_CASES["F1-consistent"]!;
const fixture = fixtureExtractor("F1-consistent");
const F1_OBSERVATIONS = Object.values(F1.observations).flat().length;

/** Answers for the first file, then never answers again: the process "dies" mid-extraction. */
const dyingAfterFirstFile: Extractor = {
  name: "dying",
  extract: (a) => (a.sourceId === "estimate-1" ? fixture.extract(a) : new Promise(() => {})),
};

/** Starts a case whose extraction is abandoned halfway, like a request killed by a timeout or redeploy. */
async function interruptedCase() {
  void openCase(db, { ...F1, fixtureId: "F1-consistent" }, dyingAfterFirstFile);
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 10));
    const [row] = await db.select().from(cases).orderBy(cases.createdAt).limit(1).offset((await db.$count(cases)) - 1);
    if (row && (await db.$count(events, and(eq(events.caseId, row.id), eq(events.operation, "extract")))) === 1) return row.id;
  }
  throw new Error("first file was never extracted");
}

const countFor = async (caseId: string) => ({
  observations: await db.$count(observations, eq(observations.caseId, caseId)),
  extracts: await db.$count(events, and(eq(events.caseId, caseId), eq(events.operation, "extract"))),
});

test("an interrupted case stays in intake with only the finished file stored", async () => {
  const id = await interruptedCase();
  assert.equal((await caseView(db, id)).case.status, "intake");
  assert.deepEqual(await countFor(id), { observations: F1.observations["estimate-1"]!.length, extracts: 1 });
});

test("resume extracts only the missing files and ends like an uninterrupted run", async () => {
  const id = await interruptedCase();
  const calls: string[] = [];
  await resumeCase(db, id, { ...fixture, extract: (a) => (calls.push(a.sourceId), fixture.extract(a)) });
  assert.deepEqual(calls.sort(), ["message-1", "photo-1"]);
  assert.deepEqual(await countFor(id), { observations: F1_OBSERVATIONS, extracts: 3 });

  const straight = await openCase(db, F1, fixture);
  assert.equal((await caseView(db, id)).case.status, (await caseView(db, straight)).case.status);
  assert.equal((await caseView(db, id)).case.status, "awaiting_approval");
});

test("two resumes at once store each file once", async () => {
  const id = await interruptedCase();
  await Promise.all([resumeCase(db, id, fixture), resumeCase(db, id, fixture)]);
  assert.deepEqual(await countFor(id), { observations: F1_OBSERVATIONS, extracts: 3 });
});

test("an unexpected error is labelled provider_error, not invalid model output", async () => {
  const broken: Extractor = {
    name: "broken",
    extract: async (a) => {
      if (a.sourceId === "photo-1") throw new ExtractionError("refusal", "refused: cyber", 1);
      throw new TypeError("fetch failed");
    },
  };
  const view = await caseView(db, await openCase(db, F1, broken));
  const categories = view.events.filter((e) => e.operation === "extract").map((e) => e.errorCategory).sort();
  assert.deepEqual(categories, ["provider_error", "provider_error", "refusal"]);
  assert.equal(view.case.status, "broker_review");
});
