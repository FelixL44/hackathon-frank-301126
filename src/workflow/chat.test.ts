import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { FIXTURE_CASES, fixtureExtractor } from "../../fixtures/cases.ts";
import { openDb, type Db } from "../db/client.ts";
import { artifacts, messages } from "../db/schema.ts";
import { caseView, addEvidence, openCase, WorkflowError } from "./cases.ts";
import { caseThread, chatCases, sendBrokerMessage, sendCustomerMessage } from "./messaging.ts";

let db: Db;
let close: () => Promise<void>;
before(async () => {
  const opened = await openDb({ PGLITE_DIR: "memory://" });
  await opened.migrate();
  ({ db, close } = opened);
});
after(() => close());

const openF1 = () => openCase(db, FIXTURE_CASES["F1-consistent"]!, fixtureExtractor("F1-consistent"));

test("the broker reply is stored in the same thread as the customer report", async () => {
  const caseId = await openF1();
  const sent = await sendBrokerMessage(db, { caseId, body: "Thanks, we are checking the photos." });
  const thread = await caseThread(db, caseId);
  assert.equal(thread.at(-1)?.id, sent.id);
  assert.equal(sent.direction, "outbound");
  assert.equal(sent.channel, "whatsapp"); // the customer's own channel
  assert.equal(sent.status, "sent");
  assert.ok(thread.some((message) => message.direction === "inbound"));
});

test("a customer can only write into their own case", async () => {
  const caseId = await openF1();
  const view = await caseView(db, caseId);
  await assert.rejects(
    sendCustomerMessage(db, { caseId, customerId: "00000000-0000-0000-0000-000000000000", body: "hello" }),
    (error: unknown) => error instanceof WorkflowError && error.code === "not_found",
  );
  const message = await sendCustomerMessage(db, { caseId, customerId: view.customer!.id, body: "Here is another photo." });
  assert.equal(message.direction, "inbound");
  assert.equal(message.channel, "web");
});

test("the inbox lists cases with their latest visible message", async () => {
  const caseId = await openF1();
  await sendBrokerMessage(db, { caseId, body: "Latest reply for the inbox." });
  const rows = await chatCases(db);
  const row = rows.find((item) => item.id === caseId);
  assert.equal(row?.lastMessage, "Latest reply for the inbox.");
  assert.equal(row?.customerName, "Ana Ferreira");
});

test("new evidence keeps the original estimate, increments the revision and links the files", async () => {
  const caseId = await openF1();
  const revision = await addEvidence(
    db,
    caseId,
    {
      message: "The workshop sent the corrected estimate and a second photo.",
      files: [
        { kind: "estimate", mediaType: "application/pdf", objectKey: "uploads/test/estimate-v2.pdf", name: "estimate-v2.pdf" },
        { kind: "photo", mediaType: "image/jpeg", objectKey: "uploads/test/photo-2.jpg", name: "photo-2.jpg" },
      ],
    },
    fixtureExtractor("F1-consistent"),
  );
  assert.equal(revision, 2);
  const estimates = (await db.select().from(artifacts).where(eq(artifacts.caseId, caseId))).filter(
    (artifact) => artifact.kind === "estimate",
  );
  assert.deepEqual(estimates.map((artifact) => [artifact.version, artifact.supersedesVersion]), [[1, null], [2, 1]]);
  const [message] = (await db.select().from(messages).where(eq(messages.caseId, caseId))).filter(
    (row) => row.direction === "inbound" && row.attachments.length > 0,
  ).slice(-1);
  assert.deepEqual(message!.attachments.map((file) => [file.sourceId, file.version]), [["estimate-1", 2], ["photo-2", 1]]);
});
