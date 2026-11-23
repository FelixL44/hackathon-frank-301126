import { defineConfig } from "drizzle-kit";

// Only generates SQL from the schema; applying it is `npm run db:migrate`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
