import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readObject } from "./objects.ts";

test("embedded fixture files match fixtures/files (run npm run fixtures:embed if this fails)", async () => {
  for (const name of ["F1/message-1.txt", "F1/estimate-1.pdf", "F5/estimate-1.v2.pdf"]) {
    assert.deepEqual(Buffer.from(await readObject(`fixtures/${name}`)), readFileSync(`fixtures/files/${name}`));
  }
  await assert.rejects(readObject("fixtures/F1/missing.jpg"), { code: "ENOENT" });
  await assert.rejects(readObject("../etc/passwd"), /escapes/);
});
