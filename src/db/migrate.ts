import { openDb } from "./client.ts";

const { migrate, close } = await openDb();
await migrate();
await close();
console.log(`migrations applied (${process.env.DATABASE_URL ? "DATABASE_URL" : "PGlite"})`);
