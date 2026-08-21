import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { requireEnv } from "../env.js";
import * as schema from "./schema.js";

/**
 * The one and only place a Drizzle client is created.
 *
 * Nothing outside `src/db/` imports this module — workflow steps and API routes
 * import named functions from `queries.ts` instead. Keeping the client private
 * means the query surface is enumerable in a single file: you can read
 * `queries.ts` and know every statement this app can issue.
 */
let db: ReturnType<typeof createDb> | undefined;

function createDb() {
  const sql = postgres(requireEnv("DATABASE_URL"), { max: 10 });
  return drizzle(sql, { schema });
}

/** Connects on first use so the app can be bundled without a live database. */
export function getDb() {
  return (db ??= createDb());
}
