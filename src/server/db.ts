import { openDb } from "../db/client.ts";

// One connection per server process; survives Next dev hot reloads.
const g = globalThis as unknown as { claimsDb?: ReturnType<typeof openDb> };

export const getDb = async () => (await (g.claimsDb ??= openDb())).db;
