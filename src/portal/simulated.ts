// SIMULATED insurer portal. Stands in for a foreign system: it validates its input and stores one receipt per
// idempotency key. A repeated call with the same key returns the original receipt instead of a second claim.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { portalReceipts } from "../db/schema.ts";
import { ClaimFiling } from "../domain/schema.ts";

export type Portal = {
  submit(idempotencyKey: string, payload: ClaimFiling): Promise<{ portalReference: string }>;
};

export const simulatedPortal = (db: Db): Portal => ({
  async submit(idempotencyKey, payload) {
    const filing = ClaimFiling.parse(payload);
    await db
      .insert(portalReceipts)
      .values({ idempotencyKey, portalReference: `SIM-${randomBytes(4).toString("hex").toUpperCase()}`, payload: filing })
      .onConflictDoNothing({ target: portalReceipts.idempotencyKey });
    const [receipt] = await db.select().from(portalReceipts).where(eq(portalReceipts.idempotencyKey, idempotencyKey));
    return { portalReference: receipt!.portalReference };
  },
});
