import { defineConfig } from "drizzle-kit";

import { requireEnv } from "./src/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: requireEnv("DATABASE_URL") },
});
