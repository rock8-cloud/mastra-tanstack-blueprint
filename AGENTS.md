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
- **postgres.js connections must use `databaseUrl()`** from
  `apps/mastra/src/db/database-url.ts`, never raw `DATABASE_URL`: it strips the
  node-postgres-only `uselibpqcompat` parameter that postgres.js would forward
  to the server (fatal `42704`). `@mastra/pg` keeps the raw URL on purpose.
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
- **Live output goes through the run's own event stream, not a side channel.**
  A step that wants to stream calls `agent.stream(...)` and forwards each chunk
  with the `writer` its `execute` receives: `await writer.write({ type, … })`.
  The write must be awaited — an un-awaited one locks the stream and the next
  throws `WritableStream is locked`. Every observer of the run then sees the
  chunk as a `workflow-step-output` event, including Studio and the Mastra
  client SDK. Never add an EventEmitter, socket or global map to move this data.

## The web ↔ Mastra contract (frozen)

Both sides implement these paths. Changing either side means changing both, plus
`apps/web/src/types.ts`.

The browser calls `/api/todos` on apps/web, which proxies to `/todos` on the
Mastra server — same method, body and response either way:

| Method | Path (web → Mastra)      | Request                | Response                                                                                        |
| ------ | ------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `POST` | `/api/todos` → `/todos`  | `{"title": string}` (1–500 chars, trimmed) | `202 {"runId": string}`; `400 {"error": string}` on invalid input                |
| `GET`  | `/api/todos` → `/todos`  | —                      | `200 {"todos":[{id, title, createdAt, comments:[{id, content, author, createdAt}]}]}`, newest first |
| `GET`  | `/api/todos/stream?runId=` → `/todos/stream/:runId` | — | `200 text/event-stream` (see events below); `400`/`404 {"error": string}` |

`POST` is asynchronous by design: it returns before the agent comment exists.
Do not make it wait for the model. A connection failure between web and Mastra is
normalised to `502 {"error":"Mastra server unreachable"}`.

The stream carries exactly four event names. They are part of the frozen
contract; `apps/mastra/src/mastra/todo-stream.ts` writes them and
`apps/web/src/lib/todo-stream.ts` reads them.

| Event   | Data                              | When                                             |
| ------- | --------------------------------- | ------------------------------------------------ |
| `todo`  | `{todoId, title, createdAt}`      | `save-todo` committed                            |
| `delta` | `{text}`                          | one chunk of the agent's comment                 |
| `done`  | `{todoId?, commentId?}`           | always last; the browser refetches `GET /todos`  |
| `error` | `{message}`                       | the run failed; the browser falls back to polling |

**The stream is an observer, never the driver.** `POST /todos` starts the run
with `run.stream()` and returns immediately; `GET /todos/stream/:runId`
re-attaches with `workflow.createRun({ runId })` + `run.observeStream()`.
Disconnecting the client does not cancel the run and the comment is still saved.
Do not move run creation into the stream route, and do not remove the polling
`refetchInterval` in `apps/web/src/routes/index.tsx` — it is the fallback for
runs that finished before a client attached, and for todos created elsewhere.

Both proxy hops must stay unbuffered: `streamFromMastra` in
`apps/web/src/lib/mastra.ts` returns `upstream.body` directly (never `.text()`)
and both hops set `Cache-Control: no-transform` and `X-Accel-Buffering: no`.

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
| `DATABASE_SSL_NO_VERIFY` | `apps/mastra` | `true` = Mastra storage encrypts without cert verification (self-signed managed Postgres) |
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
