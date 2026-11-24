import { FIXTURE_CASES } from "../../fixtures/cases.ts";
import { extractorFor } from "../server/extractor.ts";
import { openCase } from "../workflow/cases.ts";
import { openDb } from "./client.ts";

const { db, close } = await openDb();
for (const fixtureId of Object.keys(FIXTURE_CASES)) {
  const id = await openCase(db, { ...FIXTURE_CASES[fixtureId]!, fixtureId }, await extractorFor(db, fixtureId));
  console.log(`seeded ${fixtureId} → /cases/${id}`);
}
await close();
