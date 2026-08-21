import { requireEnv } from "../env.js";

/**
 * DATABASE_URL, prepared for postgres.js.
 *
 * Managed platforms may append `uselibpqcompat=true` to their connection URLs —
 * a node-postgres-only hint (pg consumes it client-side to get libpq SSL
 * semantics). postgres.js forwards query parameters it does not recognize to
 * the server as startup parameters, and Postgres rejects the unknown setting
 * with `FATAL 42704: unrecognized configuration parameter`. So it is stripped
 * here; @mastra/pg receives the URL untouched (see src/mastra/index.ts).
 *
 * String surgery instead of `new URL()` on purpose: re-serializing could change
 * the percent-encoding of credentials the platform generated.
 */
export function databaseUrl() {
  const raw = requireEnv("DATABASE_URL");
  const q = raw.indexOf("?");
  if (q === -1) return raw;

  const kept = raw
    .slice(q + 1)
    .split("&")
    .filter((param) => param.split("=")[0] !== "uselibpqcompat");

  return kept.length ? `${raw.slice(0, q)}?${kept.join("&")}` : raw.slice(0, q);
}
