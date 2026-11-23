import type { CaseStatus } from "../domain/schema.ts";

export const STATUS: Record<CaseStatus, { label: string; actor: string }> = {
  intake: { label: "Intake", actor: "Agent" },
  awaiting_information: { label: "Awaiting information", actor: "Customer / workshop" },
  broker_review: { label: "Broker review", actor: "Broker" },
  awaiting_approval: { label: "Awaiting approval", actor: "Broker" },
  submitting: { label: "Submitting", actor: "System" },
  submitted: { label: "Submitted", actor: "Nobody" },
};

export const fmt = (d: Date) =>
  d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "medium", timeZone: "Europe/Lisbon" });
