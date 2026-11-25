"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FIXTURE_CASES } from "../../fixtures/cases.ts";
import { simulatedPortal } from "../portal/simulated.ts";
import { getDb } from "../server/db.ts";
import { extractorFor } from "../server/extractor.ts";
import { and, eq } from "drizzle-orm";
import { events } from "../db/schema.ts";
import { RequestTopic } from "../domain/customer-request.ts";
import { draftCustomerRequest, finishCustomerRequest } from "../workflow/customer-requests.ts";
import { approve, openCase, resolveConflict, resumeCase, retryExtraction, WorkflowError } from "../workflow/cases.ts";
import { caseHref } from "./case-navigation.ts";

export async function launchFixture(form: FormData) {
  const fixtureId = z.enum(Object.keys(FIXTURE_CASES) as [string, ...string[]]).parse(form.get("fixtureId"));
  const db = await getDb();
  const id = await openCase(db, { ...FIXTURE_CASES[fixtureId]!, fixtureId }, await extractorFor(db, fixtureId));
  revalidatePath("/");
  redirect(`/cases/${id}`);
}

export async function approveCase(form: FormData) {
  const { caseId, revision } = z
    .object({ caseId: z.uuid(), revision: z.coerce.number().int().min(1) })
    .parse({ caseId: form.get("caseId"), revision: form.get("revision") });
  const db = await getDb();
  try {
    await approve(db, caseId, revision, simulatedPortal(db));
  } catch (e) {
    if (e instanceof WorkflowError) redirect(caseHref(caseId, { from: form.get("from"), error: e.code }));
    throw e;
  }
  revalidatePath("/");
  redirect(caseHref(caseId, { from: form.get("from") }));
}

/** Continues interrupted extraction or retries failed files for the displayed case revision. */
export async function resumeExtraction(form: FormData) {
  const { caseId, revision } = z.object({
    caseId: z.uuid(), revision: z.coerce.number().int().min(1).optional(),
  }).parse({ caseId: form.get("caseId"), revision: form.get("revision") ?? undefined });
  const db = await getDb();
  const [intake] = await db
    .select({ detail: events.detail })
    .from(events)
    .where(and(eq(events.caseId, caseId), eq(events.operation, "intake")));
  const fixtureId = String(intake?.detail?.fixtureId ?? "");
  const extractor = await extractorFor(db, fixtureId);
  try {
    if (revision) await retryExtraction(db, caseId, revision, extractor);
    else await resumeCase(db, caseId, extractor);
  } catch (e) {
    if (e instanceof WorkflowError) redirect(caseHref(caseId, { from: form.get("from"), error: e.code }));
    throw e;
  }
  revalidatePath("/");
  redirect(caseHref(caseId, { from: form.get("from") }));
}

/** Broker records a resolution for a material conflict: a reason, and optionally the source that is right. */
export async function resolveFinding(form: FormData) {
  const input = z
    .object({
      caseId: z.uuid(),
      findingId: z.uuid(),
      reason: z.string().trim().min(1).max(1000),
      acceptedSourceId: z.string().max(64).transform((s) => s || null),
    })
    .safeParse({
      caseId: form.get("caseId"),
      findingId: form.get("findingId"),
      reason: form.get("reason"),
      acceptedSourceId: form.get("acceptedSourceId") ?? "",
    });
  const caseId = String(form.get("caseId"));
  if (!input.success) {
    const validId = z.uuid().safeParse(caseId).data;
    redirect(validId ? caseHref(validId, { from: form.get("from"), error: "invalid_resolution" }) : "/");
  }
  try {
    await resolveConflict(await getDb(), input.data.caseId, input.data.findingId, input.data);
  } catch (e) {
    if (e instanceof WorkflowError) redirect(caseHref(input.data.caseId, { from: form.get("from"), error: e.code }));
    throw e;
  }
  revalidatePath("/");
  redirect(caseHref(input.data.caseId, { from: form.get("from") }));
}

const requestTarget = z.object({ caseId: z.uuid(), revision: z.coerce.number().int().positive() });

export async function createRequestDraft(form: FormData) {
  const target = requestTarget.parse(Object.fromEntries(form));
  const topic = RequestTopic.parse(form.get("topic"));
  const location = { from: form.get("from"), tab: "messages", topic, anchor: "customer-request" } as const;
  const instruction = z.string().trim().max(500).safeParse(form.get("instruction") ?? "");
  if (!instruction.success || (topic === "other" && !instruction.data)) {
    redirect(caseHref(target.caseId, { ...location, error: "invalid_request" }));
  }
  try {
    await draftCustomerRequest(await getDb(), { ...target, topic, instruction: instruction.data });
  } catch (e) {
    if (e instanceof WorkflowError) redirect(caseHref(target.caseId, { ...location, error: e.code }));
    throw e;
  }
  revalidatePath("/");
  redirect(caseHref(target.caseId, location));
}

export async function confirmRequestDraft(form: FormData) {
  const target = requestTarget.parse(Object.fromEntries(form));
  const draftId = z.uuid().parse(form.get("draftId"));
  const location = { from: form.get("from"), tab: "messages", anchor: "customer-request" } as const;
  // The WhatsApp outbox sends the same drafts and returns there instead of to the case.
  const back = (error?: string) => form.get("returnTo") === "/whatsapp"
    ? `/whatsapp${error ? `?error=${error}` : ""}` : caseHref(target.caseId, { ...location, error });
  const intent = z.enum(["send", "discard"]).parse(form.get("intent"));
  const body = intent === "send" ? z.string().trim().min(1).max(2000).safeParse(form.get("body")) : null;
  if (body && !body.success) redirect(back("invalid_request"));
  try {
    await finishCustomerRequest(await getDb(), { ...target, draftId, body: body?.data ?? null });
  } catch (e) {
    if (e instanceof WorkflowError) redirect(back(e.code));
    throw e;
  }
  revalidatePath("/");
  redirect(back());
}
