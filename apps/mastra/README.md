# @repo/mastra

The agentic backend: a todo API where every new todo gets a comment written by an
AI agent, produced by a three-step Mastra workflow.

## Shape of the code

```
src/
  env.ts                       required-env helper (clear failure, read lazily)
  db/
    schema.ts                  drizzle tables: todos, comments
    client.ts                  the ONLY drizzle client in the app
    queries.ts                 every SQL statement, as named functions
  mastra/
    index.ts                   the Mastra instance: storage, agent, workflow, routes
    routes.ts                  the HTTP contract apps/web consumes
    agents/commenter.ts        the agent, model configured purely from env
    workflows/todo-workflow.ts save-todo -> generate-comment -> save-comment
drizzle/                       generated migrations (committed)
Dockerfile                     how Rock8Cloud builds this service (from the repo root)
```

Two rules carry most of the design:

- **The DB layer is isolated.** `client.ts` is imported by `queries.ts` and
  nothing else. Workflow steps and API routes call query functions, so the entire
  set of statements the app can issue fits on one screen.
- **Everything lives on PostgreSQL.** Mastra's own storage (run snapshots,
  traces, memory) uses the same `DATABASE_URL` as the app tables, so a workflow
  run and the rows it wrote can be inspected in one `psql` session.

Migrations apply themselves at startup: `src/db/migrate.ts` runs the Drizzle
migrator before the server accepts a request, mirroring how Mastra's storage
manages its own tables. A boot with nothing pending is a no-op (journaled in
`drizzle.__drizzle_migrations`); a failed migration crashes the boot on
purpose. Single-instance assumption — with replicas, migrate in a release step.

## HTTP API

| Method | Path       | Response                                                                                               |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| POST   | `/todos`   | `202 {"runId": string}` — body `{"title": string}` (1–500 chars); `400 {"error": string}` when invalid |
| GET    | `/todos`   | `200 {"todos": [{id, title, createdAt, comments: [{id, content, author, createdAt}]}]}`, newest first  |

`POST` starts the workflow and returns immediately — the agent comment appears on
a later `GET`, usually within a couple of seconds.

The custom routes live at the **root path**, not under `/api`: Mastra reserves
its `apiPrefix` (default `/api`) for its own REST API — `GET /api/workflows`,
`GET /api/agents`, … — and refuses to register custom routes beneath it. Keeping
the default prefix means every Mastra doc, client and tool finds the framework
API where it expects it.

## Studio

Studio is served at the **root path** (`/`) in both dev and production; custom
routes registered via `apiRoutes` take precedence over its SPA fallback.

- `bun run dev` → Studio on `http://localhost:4111`, Mastra API on `http://localhost:4111/api`
- `bun run build` runs `mastra build --studio`, which bundles the Studio UI into
  `.mastra/output/studio`
- `bun run start` runs `mastra start`, which serves the built API **and** Studio
  from `.mastra/output`. There is no `--studio` flag on `start` — Studio is baked
  in at build time.

## Port

`server.port` in `src/mastra/index.ts` is `Number(process.env.PORT ?? 4111)`, and
that is deliberate. With no port configured, `mastra dev` scans 4111-4131 and
starts on the first free one without saying so — a stale process on 4111 quietly
moves the server while `apps/web` keeps calling the old address. Configured, a
busy port is an `EADDRINUSE` you cannot miss, on both `mastra dev` and
`mastra start`. `PORT` is what Rock8Cloud injects into a deployed service.

## Scripts

| Script        | What it does                                            |
| ------------- | ------------------------------------------------------- |
| `dev`         | `mastra dev` — hot-reloading server + Studio             |
| `build`       | `mastra build --studio` → `.mastra/output`               |
| `start`       | `mastra start` — serve the built output                  |
| `typecheck`   | `tsc --noEmit`                                           |
| `db:generate` | `drizzle-kit generate` — write a migration to `drizzle/` |
| `db:migrate`  | `drizzle-kit migrate` — apply migrations without booting the app (they also run at startup) |

## Environment

Copy the `apps/mastra` block of the repo-root `.env.example` into
`apps/mastra/.env` (gitignored):

| Variable              | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`        | Postgres for both app tables and Mastra storage              |
| `AI_GATEWAY_BASE_URL` | OpenAI-compatible API root (the `/v1`-style base)            |
| `AI_GATEWAY_API_KEY`  | Key for that gateway                                         |
| `AI_MODEL`            | Model id as the gateway knows it                             |
| `PORT`                | Port to bind; defaults to `4111`. Injected by the platform in production |

No provider is hardcoded — any OpenAI-compatible endpoint works by changing
configuration. Credentials are read on first use, so `mastra build` needs none of
them and CI can build without production secrets (`Dockerfile` relies on this: it
builds the image with no environment at all).
