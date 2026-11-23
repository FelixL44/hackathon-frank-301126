// Daily model budget (HAC-21): the providers only offer monthly limits, so the app enforces the day itself.
import { sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { events } from "../db/schema.ts";

export const dailyBudgetEur = (env: Record<string, string | undefined> = process.env) =>
  Number(env.MODEL_DAILY_BUDGET_EUR ?? 1); // a non-number makes every comparison false: no model calls (fail closed)

/** Model spend recorded since midnight Lisbon time. */
export async function spentTodayEur(db: Db): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${events.costEur}), 0)` })
    .from(events)
    .where(sql`${events.createdAt} >= date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon'`);
  return Number(row!.total);
}
