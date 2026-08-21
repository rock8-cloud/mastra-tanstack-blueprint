# AGENTS.md

Instructions for coding agents working in this repository. Read
[README.md](README.md) for what the blueprint *is*; this file is the short list
of things that will break if you ignore them.

## Layout

| Path                     | What lives there                                              |
| ------------------------ | ------------------------------------------------------------- |
| `apps/mastra`            | `@repo/mastra` — Mastra server, agent, workflow, database      |
| `apps/web`               | `@repo/web` — TanStack Start frontend and its server routes    |
| `packages/typescript-config` | Shared `tsconfig` base                                    |

## Architecture rules

- **Database access only through `apps/mastra/src/db/queries.ts`.** `client.ts` is
  the one Drizzle client and is imported by `queries.ts` and nothing else.
  Workflow steps and API routes call named query functions. Need new data? Add a
  function to `queries.ts` — do not import `drizzle-orm` or `getDb()` elsewhere.
- **`apps/web` never imports Drizzle, never talks to the database, and never
  calls the AI gateway.** Its only upstream is `MASTRA_API_URL`, read in
  `apps/web/src/lib/mastra.ts`, which is imported exclusively from server route
  handlers. The browser calls same-origin `/api/*` and nothing else.
- **Route prefixes are not interchangeable.** Custom routes live in
  `apps/mastra/src/mastra/routes.ts` at the **root** (`/todos`) — that is the
  contract `apps/web` proxies to. Mastra's own REST API keeps its default
  `/api/*` prefix (`/api/workflows`, `/api/agents`, …). Never register a custom
  route starting with `/api` — Mastra refuses it at startup — and don't change
  `apiPrefix`: tooling and docs assume the default.
- **The server port is explicit.** `server.port` is
  `Number(process.env.PORT ?? 4111)`. Do not remove it — without it `mastra dev`
  silently scans 4111-4131 and starts somewhere else, while `apps/web` keeps
  calling the configured address.
- **No hardcoded endpoints, keys or model ids in `src/`.** Everything external is
  an environment variable read through `requireEnv` in `apps/mastra/src/env.ts`,
  and read *lazily* so `mastra build` and `docker build` work without secrets.
  Keep new configuration lazy.
- **New agents and workflows must be registered** in the `agents` / `workflows`
  maps in `apps/mastra/src/mastra/index.ts`, and reached from steps via
  `mastra.getAgent(...)` / `mastra.getWorkflow(...)` rather than direct imports,
  so runs stay traceable in Studio.

## The web ↔ Mastra contract (frozen)

Both sides implement these paths. Changing either side means changing both, plus
`apps/web/src/types.ts`.

The browser calls `/api/todos` on apps/web, which proxies to `/todos` on the
Mastra server — same method, body and response either way:

| Method | Path (web → Mastra)      | Request                | Response                                                                                        |
| ------ | ------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `POST` | `/api/todos` → `/todos`  | `{"title": string}` (1–500 chars, trimmed) | `202 {"runId": string}`; `400 {"error": string}` on invalid input                |
| `GET`  | `/api/todos` → `/todos`  | —                      | `200 {"todos":[{id, title, createdAt, comments:[{id, content, author, createdAt}]}]}`, newest first |

`POST` is asynchronous by design: it returns before the agent comment exists.
Do not make it wait for the model. A connection failure between web and Mastra is
normalised to `502 {"error":"Mastra server unreachable"}`.

## Commands

Run at the repository root unless noted; Turborepo fans them out.

| Command               | Notes                                                                    |
| --------------------- | ------------------------------------------------------------------------ |
| `bun install`         | Bun workspaces; commit `bun.lock`                                        |
| `docker compose up -d`| Local PostgreSQL on host port 5437                                        |
| `bun run dev`         | Both dev servers: web `:3000`, Mastra + Studio `:4111`                    |
| `bun run build`       | `apps/web/.output` and `apps/mastra/.mastra/output`                       |
| `bun run typecheck`   | `tsc --noEmit` everywhere — run this before you call a change done        |
| `bun run db:generate` | Generate a migration into `apps/mastra/drizzle/` after editing the schema |
| `bun run db:migrate`  | Apply migrations without booting the app (optional — see below)           |

**After any change to `apps/mastra/src/db/schema.ts`, run `bun run db:generate`
and commit the generated files in `apps/mastra/drizzle/` (including `meta/`).**
Migrations are checked in and applied automatically at server startup
(`apps/mastra/src/db/migrate.ts`, called from `src/mastra/index.ts`), so a
deploy never runs against a stale schema; the database is never changed by
hand. This assumes a single Mastra instance — if the service is ever scaled to
replicas, move the migration into a release step instead.

`apps/web/src/routeTree.gen.ts` is generated by the TanStack Start plugin and is
committed on purpose so `typecheck` passes on a fresh clone. Regenerate it by
running `dev` or `build`; do not edit it.

## Environment variables

Local values go in `apps/mastra/.env` and `apps/web/.env` (both gitignored).
`.env.example` at the root documents all of them. Never commit real secrets, and
add any new variable to `.env.example` **and** to `globalEnv` in `turbo.json`.

| Variable              | Used by       | Purpose                                                        |
| --------------------- | ------------- | -------------------------------------------------------------- |
| `DATABASE_URL`        | `apps/mastra` | PostgreSQL for app tables and Mastra's own storage             |
| `AI_GATEWAY_BASE_URL` | `apps/mastra` | OpenAI-compatible API root                                     |
| `AI_GATEWAY_API_KEY`  | `apps/mastra` | Key for that gateway                                           |
| `AI_MODEL`            | `apps/mastra` | Model id as the gateway knows it                               |
| `PORT`                | both apps     | Port to bind; Mastra defaults to `4111`, web to `3000`. Injected by Rock8Cloud in production |
| `MASTRA_API_URL`      | `apps/web`    | Base URL of the Mastra server, read server-side per request    |

In production the environment comes from the platform, not from `.env` — the
built servers do not read app-level `.env` files.

## Deployment

Rock8Cloud builds each service from a checked-in Dockerfile
(`apps/mastra/Dockerfile`, `apps/web/Dockerfile`), each built from the repository
root. If you change the workspace layout or a build script, update both
Dockerfiles and `.dockerignore` in the same change. The deployment steps are in
the README; `.mcp.json` wires up the Rock8Cloud MCP server.
