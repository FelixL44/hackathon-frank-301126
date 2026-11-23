import { defineConfig } from "drizzle-kit";

// `generate` only needs the schema. `studio` also connects: DATABASE_URL if set, otherwise the local PGlite dir.
export default defineConfig(
  process.env.DATABASE_URL
    ? {
        dialect: "postgresql",
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: process.env.DATABASE_URL },
      }
    : {
        dialect: "postgresql",
        driver: "pglite",
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: process.env.PGLITE_DIR ?? ".data/pglite" },
      },
);
