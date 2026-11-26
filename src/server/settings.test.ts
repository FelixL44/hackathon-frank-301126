import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { openDb, type Db } from "../db/client.ts";
import { agents } from "../db/schema.ts";
import {
  configFromSettings,
  integrationState,
  saveIntegrationFields,
  settingRows,
  writeSetting,
} from "./settings.ts";

let db: Db;
let close: () => Promise<void>;
before(async () => {
  const opened = await openDb({ PGLITE_DIR: "memory://" });
  await opened.migrate();
  ({ db, close } = opened);
});
after(() => close());

test("a saved secret wins over the environment and is only shown masked", async () => {
  await writeSetting(db, "anthropic_api_key", "sk-ant-demo-9876", true);
  const state = await integrationState(db, { ANTHROPIC_API_KEY: "env-key-0000" });
  const field = state.find((group) => group.id === "model")!.fields.find((item) => item.key === "anthropic_api_key")!;
  assert.equal(field.source, "database");
  assert.equal(field.display, "••••••••9876");
  assert.ok(!field.display.includes("demo"));

  const config = await configFromSettings(db, { ANTHROPIC_API_KEY: "env-key-0000" });
  assert.equal(config.ANTHROPIC_API_KEY, "sk-ant-demo-9876");
});

test("an empty secret field keeps the stored key; the clear checkbox removes it", async () => {
  await writeSetting(db, "openai_api_key", "sk-openai-1234", true);
  const keep = new FormData();
  keep.set("openai_api_key", "");
  await saveIntegrationFields(db, keep);
  assert.equal((await settingRows(db)).get("openai_api_key")?.value, "sk-openai-1234");

  const clear = new FormData();
  clear.set("clear:openai_api_key", "on");
  await saveIntegrationFields(db, clear);
  assert.equal((await settingRows(db)).get("openai_api_key")?.value, "");
});

test("non-secret values are stored as typed and fall back to the environment when empty", async () => {
  await writeSetting(db, "model_id", "claude-opus-5-5", false);
  assert.equal((await configFromSettings(db)).MODEL_ID, "claude-opus-5-5");
  await writeSetting(db, "model_id", "", false);
  assert.equal((await configFromSettings(db, { MODEL_ID: "from-env" })).MODEL_ID, "from-env");
});

test("the migration ships the three default claim agents", async () => {
  const rows = await db.select().from(agents);
  assert.deepEqual(rows.map((agent) => agent.slug).sort(), ["home-water", "motor", "personal-injury"]);
  assert.ok(rows.every((agent) => agent.status === "active" && agent.requiredDocuments.length > 0));
});
