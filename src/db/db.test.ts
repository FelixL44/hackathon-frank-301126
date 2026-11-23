import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { eq } from "drizzle-orm";
import { openDb, type Db } from "./client.ts";
import { approvals, artifacts, cases, messages, observations, submissions } from "./schema.ts";

let db: Db;
let close: () => Promise<void>;

before(async () => {
  const opened = await openDb({ PGLITE_DIR: "memory://" });
  await opened.migrate();
  ({ db, close } = opened);
});
after(() => close());

const newCase = async (reference: string) =>
  (await db.insert(cases).values({ reference, replyToken: `token-${reference}-0123456789` }).returning())[0]!;

const filing = {
  caseReference: "CLM-1",
  revision: 1,
  policyReference: "POL-1",
  vehicleId: "AA-00-AA",
  incidentDate: "2026-11-20",
  eventDescription: "x",
  damagedArea: ["bumper:front"],
  evidence: [{ sourceId: "estimate-1", version: 1 }],
};

test("corrected estimate keeps the original version", async () => {
  const c = await newCase("CLM-ART");
  const base = { caseId: c.id, sourceId: "estimate-1", kind: "estimate" as const, mediaType: "application/pdf" };
  await db.insert(artifacts).values({ ...base, version: 1, supersedesVersion: null, objectKey: "k/v1.pdf" });
  await db.insert(artifacts).values({ ...base, version: 2, supersedesVersion: 1, objectKey: "k/v2.pdf" });
  const rows = await db.select().from(artifacts).where(eq(artifacts.caseId, c.id));
  assert.deepEqual(rows.map((r) => r.version).sort(), [1, 2]);
  await assert.rejects(db.insert(artifacts).values({ ...base, version: 2, supersedesVersion: 1, objectKey: "dup" }));
});

test("observation must reference an existing artifact version", async () => {
  const c = await newCase("CLM-OBS");
  await assert.rejects(
    db.insert(observations).values({
      caseId: c.id,
      sourceId: "photo-1",
      version: 1,
      field: "damagedArea",
      value: null,
      normalized: null,
      locator: { type: "image", imageId: "photo-1", description: "blurry" },
      readability: "illegible",
    }),
  );
});

test("replayed inbound event is stored once", async () => {
  const c = await newCase("CLM-MSG");
  const reply = {
    caseId: c.id,
    direction: "inbound" as const,
    channel: "demo" as const,
    role: "workshop" as const,
    body: "Segue orçamento corrigido.",
    externalEventId: "evt-42",
    status: "received" as const,
  };
  const first = await db.insert(messages).values(reply).onConflictDoNothing().returning();
  const replay = await db.insert(messages).values(reply).onConflictDoNothing().returning();
  assert.equal(first.length, 1);
  assert.equal(replay.length, 0);
});

test("double approval click creates one approval", async () => {
  const c = await newCase("CLM-APR");
  const approval = { caseId: c.id, revision: 1, approvedBy: "demo-broker", payload: filing };
  assert.equal((await db.insert(approvals).values(approval).onConflictDoNothing().returning()).length, 1);
  assert.equal((await db.insert(approvals).values(approval).onConflictDoNothing().returning()).length, 0);
});

test("one submission per approved revision", async () => {
  const c = await newCase("CLM-SUB");
  await db.insert(submissions).values({ caseId: c.id, approvedRevision: 1, idempotencyKey: `${c.id}:1` });
  await assert.rejects(
    db.insert(submissions).values({ caseId: c.id, approvedRevision: 1, idempotencyKey: `${c.id}:1-again` }),
  );
});

test("failed transaction leaves no partial state", async () => {
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.insert(cases).values({ reference: "CLM-TX", replyToken: "token-CLM-TX-0123456789" });
      throw new Error("tool call failed");
    }),
  );
  assert.equal((await db.select().from(cases).where(eq(cases.reference, "CLM-TX"))).length, 0);
});

test("file-backed PGlite creates missing parent dirs and keeps data across restarts", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "claims-")), "nested", "pglite");
  const first = await openDb({ PGLITE_DIR: dir });
  await first.migrate();
  await first.db.insert(cases).values({ reference: "CLM-DISK", replyToken: "token-CLM-DISK-0123456789" });
  await first.close();
  const second = await openDb({ PGLITE_DIR: dir });
  assert.equal((await second.db.select().from(cases)).length, 1);
  await second.close();
});

// Exercises the DATABASE_URL path (postgres.js over the wire) without Docker: PGlite serves the Postgres protocol.
test("DATABASE_URL path migrates a real Postgres connection", async () => {
  const server = new PGLiteSocketServer({ db: await PGlite.create(), port: 54329 });
  await server.start();
  try {
    const remote = await openDb({ DATABASE_URL: "postgres://postgres@127.0.0.1:54329/postgres" });
    await remote.migrate();
    const [row] = await remote.db
      .insert(cases)
      .values({ reference: "CLM-WIRE", replyToken: "token-CLM-WIRE-0123456789" })
      .returning();
    assert.equal(row!.revision, 1);
    await remote.close();
  } finally {
    await server.stop();
  }
});
