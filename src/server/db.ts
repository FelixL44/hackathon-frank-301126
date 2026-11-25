import { cache } from "react";
import { openDb } from "../db/client.ts";

// Cloudflare Workers forbid reusing a socket across requests, so there each request opens its own client.
const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
const perRequest = cache(() => openDb());

// Elsewhere: one connection per server process; survives Next dev hot reloads.
const g = globalThis as unknown as { claimsDb?: ReturnType<typeof openDb> };

export const getDb = async () => (await (onWorkers ? perRequest() : (g.claimsDb ??= openDb()))).db;
