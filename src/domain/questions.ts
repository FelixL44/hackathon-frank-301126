// Who can answer what is missing. HAC-11 adds the Portuguese question text per gap.
import type { Gap } from "./filing.ts";

export type Recipient = "customer" | "workshop";

/** The workshop writes the estimate; everything else (photos, account, policy, plate, date) comes from the customer. */
export const recipientFor = (gap: Gap): Recipient => (gap.document === "estimate" ? "workshop" : "customer");
