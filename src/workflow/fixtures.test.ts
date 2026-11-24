// Runs every fixture-backed case through the workflow and checks it against the manifest's expected route.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURE_CASES, fixtureExtractor } from "../../fixtures/cases.ts";
import { FIXTURES } from "../../fixtures/manifest.ts";
import { openDb, type Db } from "../db/client.ts";
import { groundObservations } from "../extraction/grounding.ts";
import { pdfPages } from "../extraction/model-extractor.ts";
import { readObject } from "../storage/objects.ts";
import { caseView, openCase } from "./cases.ts";

let db: Db;
let close: () => Promise<void>;
before(async () => {
  const opened = await openDb({ PGLITE_DIR: "memory://" });
  await opened.migrate();
  ({ db, close } = opened);
});
after(() => close());

for (const [id, fixture] of Object.entries(FIXTURE_CASES)) {
  test(`${id}: every fixture quote occurs in its generated evidence file`, async () => {
    for (const a of fixture.artifacts.filter((a) => a.kind !== "photo")) {
      const bytes = await readObject(a.objectKey);
      const pages = a.mediaType === "application/pdf" ? await pdfPages(bytes) : [new TextDecoder().decode(bytes)];
      const raw = {
        observations: (fixture.observations[a.sourceId] ?? []).map((o) => ({
          field: o.field,
          value: o.value,
          normalized: o.normalized,
          readability: o.readability,
          quote: o.locator.type === "text" ? o.locator.quote : null,
          page: o.locator.type === "text" ? o.locator.page : null,
          visualDescription: null,
        })),
      };
      const grounded = groundObservations(a, pages, raw);
      assert.ok(grounded.ok, `${a.sourceId}: ${grounded.ok ? "" : grounded.errors.join("; ")}`);
    }
  });

  const expected = FIXTURES.find((f) => f.id === id);
  test(`${id}: ends where the manifest says, with the expected findings`, async () => {
    assert.ok(expected, `${id} is missing from fixtures/manifest.ts`);
    const view = await caseView(db, await openCase(db, fixture, fixtureExtractor(id)));
    assert.equal(view.case.status, expected.route.at(-1));
    const open = view.findings.filter((f) => f.status === "open").map((f) => ({ rule: f.rule, field: f.field }));
    assert.deepEqual(open, expected.expectedFindings);
  });
}
