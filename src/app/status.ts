import type { CaseStatus } from "../domain/schema.ts";
import { caseListHref } from "./case-navigation.ts";

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
  from?: string,
  returnTab?: "activity",
) {
  const base = `/cases/${caseId}/sources/${ref.sourceId}/${ref.version}`;
  const query = new URLSearchParams();
  if (ref.locator?.type === "text") {
    query.set("page", String(ref.locator.page));
    query.set("quote", ref.locator.quote);
  }
  const list = caseListHref(from);
  if (list !== "/") query.set("from", list);
  if (returnTab) query.set("tab", returnTab);
  return query.size ? `${base}?${query}` : base;
}

export function nextCaseAction(status: CaseStatus, contacted: boolean) {
  switch (status) {
    case "broker_review": return "Review evidence";
    case "awaiting_information": return contacted ? "Wait for reply" : "Request information";
    case "awaiting_approval": return "Review and forward";
    case "intake": return "Check evidence";
    case "submitting": return "Forward claim";
    case "submitted": return "Receipt available";
  }
}
