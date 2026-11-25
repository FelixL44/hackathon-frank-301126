import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Resolved from the repo root, where every npm script runs. (new URL(..., import.meta.url) would be bundled by Next.)
const migrationsFolder = resolve("drizzle");

/**
 * DATABASE_URL set → any Postgres host. Unset → embedded PGlite, persisted in PGLITE_DIR
 * (default .data/pglite) so a restart resumes from stored state; "memory://" for tests.
 */
export async function openDb(
  env: Record<string, string | undefined> = process.env, // reads DATABASE_URL, PGLITE_DIR
): Promise<{ db: Db; migrate: () => Promise<void>; close: () => Promise<void> }> {
  if (env.DATABASE_URL) {
    // prepare: false — transaction poolers (Supabase :6543, PgBouncer) cannot hold prepared statements.
    const client = postgres(env.DATABASE_URL, { max: 10, prepare: false, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    return { db, migrate: () => migratePostgres(db, { migrationsFolder }), close: () => client.end() };
  }
  const dir = env.PGLITE_DIR ?? ".data/pglite";
  if (!dir.includes("://")) mkdirSync(dirname(dir), { recursive: true }); // PGlite creates only the last segment
  // Loaded only without DATABASE_URL, so the Cloudflare build never needs PGlite's WASM.
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate: migratePglite }] = await Promise.all([
    import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator"),
  ]);
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  return { db, migrate: () => migratePglite(db, { migrationsFolder }), close: () => client.close() };
}
