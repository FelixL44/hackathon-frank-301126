import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

/**
 * DATABASE_URL set → any Postgres host. Unset → embedded PGlite, persisted in PGLITE_DIR
 * (default .data/pglite) so a restart resumes from stored state; "memory://" for tests.
 */
export async function openDb(
  env: { DATABASE_URL?: string; PGLITE_DIR?: string } = process.env,
): Promise<{ db: Db; migrate: () => Promise<void>; close: () => Promise<void> }> {
  if (env.DATABASE_URL) {
    const client = postgres(env.DATABASE_URL, { max: 10, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    return { db, migrate: () => migratePostgres(db, { migrationsFolder }), close: () => client.end() };
  }
  const client = new PGlite(env.PGLITE_DIR ?? ".data/pglite");
  const db = drizzlePglite(client, { schema });
  return { db, migrate: () => migratePglite(db, { migrationsFolder }), close: () => client.close() };
}
