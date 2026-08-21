/**
 * Every external dependency of this app is configured through environment
 * variables — there are no hardcoded endpoints, keys or model names anywhere in
 * `src/`. That is what lets the same build run locally against docker-compose
 * and in production against a managed Postgres + AI gateway.
 *
 * `requireEnv` is deliberately called lazily (on first use), not at import time:
 * `mastra build` bundles this code in CI where the database and gateway
 * credentials are not available, and a build must not need production secrets.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to apps/mastra/.env and fill it in (see the repo README).`,
    );
  }

  return value;
}
