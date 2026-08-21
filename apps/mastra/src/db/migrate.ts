import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { requireEnv } from "../env.js";

/**
 * Resolved relative to this module, never the working directory — `mastra dev`
 * runs the bundle with an unrelated cwd. Two layouts exist: the Docker image
 * flattens the bundle and puts `drizzle/` beside it; everywhere else this code
 * runs from `src/db/` or `.mastra/output/`, both two levels above `drizzle/`.
 */
function migrationsFolder() {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "drizzle"), join(here, "../../drizzle")]) {
    if (existsSync(join(candidate, "meta", "_journal.json"))) return candidate;
  }
  throw new Error(`Cannot find the drizzle/ migrations folder near ${here}`);
}

/**
 * Applies any pending SQL files from drizzle/. Called once at server startup
 * (see src/mastra/index.ts), so a deploy is never running against a stale
 * schema. Applied migrations are journaled in `drizzle.__drizzle_migrations` —
 * the same ledger `bun run db:migrate` writes — so a boot with nothing pending
 * is a cheap no-op.
 */
export async function runMigrations() {
  // Its own single connection, closed immediately: migration is a boot step,
  // not part of the app's pool in client.ts.
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: migrationsFolder() });
  } finally {
    await sql.end();
  }
}
