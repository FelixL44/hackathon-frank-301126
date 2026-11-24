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
import { approve, openCase, resolveConflict, resumeCase, WorkflowError } from "../workflow/cases.ts";

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
    if (e instanceof WorkflowError) redirect(`/cases/${caseId}?error=${e.code}`);
    throw e;
  }
  revalidatePath("/");
  redirect(`/cases/${caseId}`);
}

/** Continues an interrupted extraction with the same fixture (or the configured model) and the budget check. */
export async function resumeExtraction(form: FormData) {
  const caseId = z.uuid().parse(form.get("caseId"));
  const db = await getDb();
  const [intake] = await db
    .select({ detail: events.detail })
    .from(events)
    .where(and(eq(events.caseId, caseId), eq(events.operation, "intake")));
  const fixtureId = String(intake?.detail?.fixtureId ?? "");
  await resumeCase(db, caseId, await extractorFor(db, fixtureId));
  revalidatePath("/");
  redirect(`/cases/${caseId}`);
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
  if (!input.success) redirect(`/cases/${z.uuid().safeParse(caseId).success ? caseId : ""}?error=invalid_resolution`);
  try {
    await resolveConflict(await getDb(), input.data.caseId, input.data.findingId, input.data);
  } catch (e) {
    if (e instanceof WorkflowError) redirect(`/cases/${input.data.caseId}?error=${e.code}`);
    throw e;
  }
  revalidatePath("/");
  redirect(`/cases/${input.data.caseId}`);
}
