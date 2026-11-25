import type { CaseStatus } from "../domain/schema.ts";

export const STATUS: Record<CaseStatus, { label: string; actor: string }> = {
  intake: { label: "Intake", actor: "Agent" },
  awaiting_information: { label: "Awaiting information", actor: "Customer" },
  broker_review: { label: "Broker review", actor: "Broker" },
  awaiting_approval: { label: "Awaiting approval", actor: "Broker" },
  submitting: { label: "Submitting", actor: "System" },
  submitted: { label: "Submitted", actor: "Complete" },
};

export function caseActor(status: CaseStatus, contacted: boolean) {
  if (status === "awaiting_information" && !contacted) return "Broker";
  return STATUS[status].actor;
}

export const fmt = (d: Date) =>
  d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Lisbon" });

/** Link to the source viewer, opened at the cited page with the quote highlighted. */
export function sourceHref(
  caseId: string,
  ref: { sourceId: string; version: number; locator?: { type: "text"; quote: string; page: number } | { type: "image" } },
) {
  const base = `/cases/${caseId}/sources/${ref.sourceId}/${ref.version}`;
  if (ref.locator?.type !== "text") return base;
  return `${base}?${new URLSearchParams({ page: String(ref.locator.page), quote: ref.locator.quote })}`;
}
