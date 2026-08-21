# Mastra + TanStack Agentic Workflow Monorepo

A small, complete blueprint for **agentic workflows in production**: a
[Mastra](https://mastra.ai) backend where every new todo is commented on by an AI
agent, a [TanStack Start](https://tanstack.com/start) frontend that shows the
comment arriving, and one PostgreSQL database holding both the app's data and
Mastra's own run state.

The todo domain is deliberately trivial. What the repository actually teaches is
the shape of the thing around it: an asynchronous workflow with typed steps, a UI
that stays responsive while a model is thinking, a model chosen entirely by
configuration, and a deployment story that a coding agent can execute.

| Layer     | Tech                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Monorepo  | [Turborepo](https://turborepo.dev) + [Bun](https://bun.sh) workspaces                                                        |
| Agents    | [Mastra](https://mastra.ai) workflows, agents, Studio                                                                       |
| Model     | [AI SDK](https://ai-sdk.dev) `@ai-sdk/openai-compatible` — any OpenAI-compatible gateway                                    |
| Database  | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team) + [Postgres.js](https://github.com/porsager/postgres)                  |
| Web       | [TanStack Start](https://tanstack.com/start) + [TanStack Query](https://tanstack.com/query) + [Tailwind](https://tailwindcss.com) on React 19 |
| Deploy    | [Rock8Cloud](https://rock8.cloud) — two Dockerfile services + managed Postgres                                              |

## Architecture

```
   Browser
     │                                                  │
     │  write path                                      │  read path
     │  POST /api/todos {"title"}                       │  GET /api/todos
     │  (/ page, on submit)                             │  (/todos page, every 2s)
     ▼                                                  ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ apps/web — TanStack Start server route   src/routes/api/todos.ts          │
  │            validates, then src/lib/mastra.ts fetches MASTRA_API_URL       │
  └───────────────────────────────────────────────────────────────────────────┘
     │                                                  │
     ▼                                                  ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ apps/mastra — Mastra server, custom routes   src/mastra/routes.ts         │
  │   POST /todos  →  start a run, answer 202 {"runId"} immediately           │
  │   GET  /todos  →  listTodosWithComments()                                 │
  └───────────────────────────────────────────────────────────────────────────┘
     │
     ▼  todo-workflow  (src/mastra/workflows/todo-workflow.ts)
  ┌───────────────┐   ┌──────────────────┐   ┌──────────────┐
  │  save-todo    │──▶│ generate-comment │──▶│ save-comment │
  └───────────────┘   └──────────────────┘   └──────────────┘
     │                    │        ▲                  │
     │                    ▼        │                  │
     │            commenter agent  │ text             │
     │         (src/mastra/agents) │                  │
     │                    │        │                  │
     │                    ▼        │                  │
     │         OpenAI-compatible gateway              │
     │         AI_GATEWAY_BASE_URL / _API_KEY / AI_MODEL
     ▼                                                ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │ PostgreSQL —  todos, comments   +   mastra_* (run snapshots, traces, …)   │
  └───────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │  reads runs, steps, payloads
                        Mastra Studio at http://localhost:4111/
```

Two things to notice in that picture. The browser has exactly one upstream — its
own server routes; it never reaches Mastra, the database or the gateway. And the
arrow out of `POST /api/todos` returns before the model has said anything: the
run keeps going, the UI polls, the comment shows up.

## Layout

```
apps/
  mastra/                    the agentic backend
    src/
      env.ts                 required-env helper, read lazily
      db/
        schema.ts            drizzle tables: todos, comments
        client.ts            the ONLY drizzle client — imported by queries.ts alone
        queries.ts           every SQL statement in the app, as named functions
      mastra/
        index.ts             the Mastra instance: storage, port, routes
        routes.ts            the HTTP contract apps/web consumes (/todos)
        agents/commenter.ts  the agent; its model comes from env vars only
        workflows/
          todo-workflow.ts   save-todo → generate-comment → save-comment
    drizzle/                 generated SQL migrations (committed)
    Dockerfile               how Rock8Cloud builds this service
  web/                       the TanStack Start frontend
    src/
      routes/
        index.tsx            "/"       new-todo form
        todos.tsx            "/todos"  polling list with agent comments
        api/todos.ts         server route: validate + proxy to Mastra
      lib/mastra.ts          the only place that knows MASTRA_API_URL
    Dockerfile
packages/
  typescript-config/         shared tsconfig base
docker-compose.yml           local PostgreSQL on host port 5437
.mcp.json                    Rock8Cloud MCP endpoint, for agent-driven deploys
```

## Quickstart

Prerequisites: [Bun](https://bun.sh) ≥ 1.3.14, Docker, and an OpenAI-compatible
AI gateway you can reach.

```sh
bun install
docker compose up -d          # PostgreSQL on localhost:5437
```

Create the two `.env` files. They are gitignored; `.env.example` at the root
documents every variable in one place.

`apps/mastra/.env`

```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5437/mastra_blueprint

# Any OpenAI-compatible endpoint. The base URL is the API root that has
# /chat/completions under it — usually the one ending in /v1.
AI_GATEWAY_BASE_URL=https://your-gateway.example.com/v1
AI_GATEWAY_API_KEY=sk-...
AI_MODEL=gpt-5

# Optional. The Mastra server binds this port explicitly; default is 4111.
# Set it if 4111 is taken on your machine — and update MASTRA_API_URL to match.
# PORT=4111
```

`apps/web/.env`

```sh
MASTRA_API_URL=http://localhost:4111
```

Then run:

```sh
bun run dev                   # turbo runs both apps
```

No migration step: the Mastra server applies pending migrations from
`apps/mastra/drizzle/` on every boot, before it takes a request — the same way
Mastra's own storage manages its tables. (`bun run db:migrate` still exists for
applying them without starting the server.)

| What                           | URL                              |
| ------------------------------ | -------------------------------- |
| Web app                        | http://localhost:3000            |
| Mastra Studio                  | http://localhost:4111/           |
| Blueprint API (custom routes)  | http://localhost:4111/todos      |
| Mastra's own REST API          | http://localhost:4111/api/*      |
| PostgreSQL                     | localhost:5437                   |

Open http://localhost:3000, add a todo, and watch `/todos`: the card appears
immediately with a pulsing *"agent is thinking…"*, and the comment replaces it a
second or two later. Then open Studio and look at the same run, step by step.

### Why the custom routes are not under `/api`

Mastra reserves its `apiPrefix` (default `/api`) for its own REST API —
`GET /api/workflows`, `GET /api/agents`, … — and refuses to register custom
routes underneath it. So the blueprint's routes live at the root (`/todos`),
which is Mastra's own convention for custom routes, and the framework API stays
where every Mastra doc, client and tool expects it. The browser still calls
`/api/todos` — that route belongs to apps/web, which proxies to Mastra's
`/todos`. Studio keeps the root path; registered routes take precedence over
its SPA fallback.

### About the port

`server.port` is set explicitly from `PORT` (default `4111`). Left unconfigured,
`mastra dev` scans ports 4111-4131 and silently starts on the first free one — so
a port already in use moves the server without telling you, and `apps/web` keeps
calling the old address. Configured, a busy port is a loud `EADDRINUSE` on both
`mastra dev` and `mastra start`. In production the platform injects `PORT`.

## Environment variables

| Variable              | Used by      | Purpose                                                                        |
| --------------------- | ------------ | ------------------------------------------------------------------------------ |
| `DATABASE_URL`        | `apps/mastra` | PostgreSQL for the app tables **and** Mastra's own storage                     |
| `AI_GATEWAY_BASE_URL` | `apps/mastra` | OpenAI-compatible API root (the `/v1`-style base)                              |
| `AI_GATEWAY_API_KEY`  | `apps/mastra` | Key for that gateway                                                           |
| `AI_MODEL`            | `apps/mastra` | Model id as the gateway knows it                                               |
| `PORT`                | both apps    | Port the server binds. Mastra defaults to `4111`, the web server to `3000`     |
| `MASTRA_API_URL`      | `apps/web`   | Base URL of the Mastra server. Read **server-side, per request** — never shipped to the browser |

`apps/mastra` reads its variables on first use, not at import time, so
`mastra build` (and `docker build`) needs no secrets. In development both apps
pick up their app-level `.env`; in production the platform supplies the
environment, which is why the Dockerfiles bake in no values beyond defaults.

## How the workflow works

Follow one request all the way down. Every step below is a real file you can open.

**1. The browser posts to its own origin.**
`apps/web/src/routes/index.tsx` does `fetch('/api/todos', { method: 'POST' })`.
That is the only endpoint the client knows. It has no idea Mastra exists.

**2. The web server route validates and proxies.**
`apps/web/src/routes/api/todos.ts` trims the title, rejects empty or >500-char
input, and hands off to `proxyToMastra` in `apps/web/src/lib/mastra.ts`, which is
the single place that reads `MASTRA_API_URL`. A connection failure there becomes
`502 {"error":"Mastra server unreachable"}`, so "upstream is down" is
distinguishable from "upstream said no".

> **Principle — the browser never touches Mastra, the database, or the gateway.**
> One indirection buys you: credentials that stay on the server, an upstream
> address that can change per environment, and one place to normalise failures.

**3. Mastra starts a run and answers immediately.**
`apps/mastra/src/mastra/routes.ts` parses the body with zod, then:

```ts
const run = await workflow.createRun()
const { runId } = await run.startAsync({ inputData: { title } })
return c.json({ runId }, 202)
```

`202` with a `runId`, not `201` with a comment. The model call takes seconds and
no HTTP connection should be held open for it.

> **Principle — async fire-and-forget plus a polling UI.** The run is durable in
> Postgres, so a crash mid-generation is recoverable and visible in Studio rather
> than lost with the socket. On the other side, `apps/web/src/routes/todos.tsx`
> uses TanStack Query with `refetchInterval: 2000` and renders *"agent is
> thinking…"* for any todo with no comments yet. No websockets, no SSE, nothing
> to explain — and the latency of the agent becomes a visible part of the UI
> instead of a hidden stall.

**4. The workflow runs three narrow steps.**
`apps/mastra/src/mastra/workflows/todo-workflow.ts`:

```
save-todo  →  generate-comment  →  save-comment
```

Each step declares `inputSchema` and `outputSchema` with zod, and each step's
output schema *is* the next one's input schema.

> **Principle — typed step chaining.** One declaration buys three things:
> Mastra validates the data crossing every step boundary at runtime, TypeScript
> infers `inputData` inside `execute`, and Studio can render the run — including
> the exact payload that failed — with no extra instrumentation. Renaming a field
> becomes a compile error rather than a 3am bug.
>
> The steps are narrow on purpose: one side effect each. That is what makes a run
> resumable and debuggable. `save-todo` commits first, so if the model call fails
> the todo still exists and the run tells you precisely which step to retry.

**5. The agent asks a model that is pure configuration.**
`generate-comment` pulls the agent out of the registry — `mastra.getAgent('commenter')`
— rather than importing it, so the call is traced as part of the run and the agent
stays swappable. `apps/mastra/src/mastra/agents/commenter.ts` builds its model with
`createOpenAICompatible({ baseURL: AI_GATEWAY_BASE_URL, apiKey: AI_GATEWAY_API_KEY }).chatModel(AI_MODEL)`.

> **Principle — env-driven model config.** No provider, endpoint, key or model id
> appears anywhere in `src/`. Switching from a hosted gateway to a self-hosted
> vLLM, or from one model to another, is an environment change and a restart. The
> model factory is also lazy (`model: () => (model ??= createGatewayModel())`),
> which is why the image can be built without credentials.

**6. Both writes go through one file.**
Steps call `insertTodo` / `insertComment` from `apps/mastra/src/db/queries.ts`.
`client.ts` — the only Drizzle client in the app — is imported by `queries.ts` and
nothing else.

> **Principle — DB-layer isolation.** Every statement the app can issue fits on
> one screen. A workflow step is "call a named function, get typed data back",
> which makes it testable, and swapping persistence or adding an index touches
> exactly one file.

**7. Everything lands in the same database.**
`todos` and `comments` sit next to Mastra's `mastra_workflow_snapshot`,
`mastra_ai_spans` and friends, because `PostgresStore` is configured with the same
`DATABASE_URL`.

> **Principle — everything on Postgres.** One database to provision, back up and
> inspect. A run and the rows it wrote are readable in a single `psql` session:
>
> ```sh
> docker exec mastra-blueprint-postgres psql -U postgres -d mastra_blueprint \
>   -c "select run_id, workflow_name, snapshot::jsonb->>'status' from mastra_workflow_snapshot order by \"createdAt\" desc limit 5;"
> ```
>
> The `runId` the browser received in step 3 is the `run_id` in that table.

**8. The read path is boring on purpose.**
`GET /api/todos` in the web app proxies to `GET /api/todos` on Mastra, which calls
`listTodosWithComments()` — one Drizzle relational query, newest todo first,
comments in reading order. The response shape is fixed:
`{"todos":[{id, title, createdAt, comments:[{id, content, author, createdAt}]}]}`.

## Commands

Run these at the repository root; Turborepo fans them out to both apps.

| Command              | What it does                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `bun run dev`        | Both dev servers (web `:3000`, Mastra + Studio `:4111`)            |
| `bun run build`      | `vite build` → `apps/web/.output`, `mastra build --studio` → `apps/mastra/.mastra/output` |
| `bun run typecheck`  | `tsc --noEmit` in every package                                     |
| `bun run db:generate`| Write a new migration into `apps/mastra/drizzle/` from the schema   |
| `bun run db:migrate` | Apply pending migrations to `DATABASE_URL` without booting the app (they also run automatically at server startup) |

To run the production builds locally, remember that the built servers read the
real environment rather than the app `.env` files:

```sh
bun run build
(cd apps/mastra && PORT=4111 bun run start)
(cd apps/web && PORT=3000 MASTRA_API_URL=http://localhost:4111 bun run start)
```

## Deploy on Rock8Cloud

This repository ships [`.mcp.json`](.mcp.json) with the Rock8Cloud MCP endpoint
already configured, so an MCP-capable coding agent can do the whole deployment.
Open the repo in your agent (Claude Code, for example), complete the OAuth login
when prompted, and ask:

```text
Deploy this project to Rock8Cloud.
```

No API key, deployment CLI, or GitHub Actions workflow is required. Both services
are built from the Dockerfiles checked in at `apps/mastra/Dockerfile` and
`apps/web/Dockerfile`.

These are the steps the agent follows — do them by hand in the Rock8Cloud UI if
you prefer:

1. **Push this repository to GitHub** and make sure Rock8Cloud can see it
   (`check_github_connection`).
2. **Create a project** to group the three services (`create_project`).
3. **Provision PostgreSQL** in that project (`provision_postgres`, version `17`).
   Wait for it to come up.
4. **Create the Mastra service** from the repo (`create_repo_service`):
   Dockerfile `apps/mastra/Dockerfile`, container port `4111`. The Dockerfile
   runs `bun install --frozen-lockfile` then `bun run build`
   (`mastra build --studio`) and starts the built entry — the same thing
   `bun run start` does locally.
5. **Create the web service** from the same repo (`create_repo_service`):
   Dockerfile `apps/web/Dockerfile`, container port `3000`. It runs
   `bun install --frozen-lockfile` then `bun run build`, and starts
   `node .output/server/index.mjs`.
6. **Link the database into Mastra** (`link_env_vars`): source = the Postgres
   service, target = the Mastra service, and the connection-string key the
   database exports (`list_linkable_keys` shows it) mapped to `DATABASE_URL`.
   The value resolves at deploy time — no connection string is copied by hand.
7. **Set the gateway variables on the Mastra service**
   (`write_manual_env_vars`): `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`,
   `AI_MODEL`. These are your credentials, so they are entered manually rather
   than linked.
8. **Point the web service at Mastra** (`write_manual_env_vars`):
   `MASTRA_API_URL` = the Mastra service's URL. Prefer the in-cluster address if
   your project has one; the public HTTPS URL also works, since only the web
   server calls it.
9. **Deploy both services** (`deploy_service`) and check
   `get_deployment_status` / `get_runtime_logs`. There is no migration step:
   the Mastra service applies its Drizzle migrations on boot, before it accepts
   traffic, so the provisioned database is set up by the first deploy and kept
   up to date by every one after it. Open the web service's URL to add a todo,
   and the Mastra service's URL to see the run in Studio.

`PORT` is injected by the platform — do not set it manually. Both apps bind
whatever they are given: Mastra through `server.port` in
`apps/mastra/src/mastra/index.ts`, the web app through Nitro's own `PORT`
handling.

## Extending the blueprint

- **Add a workflow step.** Write a `createStep` with an `inputSchema` matching the
  previous step's `outputSchema`, and add `.then(yourStep)` before `.commit()` in
  `todo-workflow.ts`. A tagging step, a moderation step, a notification step — the
  compiler tells you if the payload does not line up.
- **Give the agent a tool.** Create a tool with `createTool` and pass it in the
  `tools` option of `commenterAgent`. If it needs data, add a query function to
  `src/db/queries.ts` rather than importing the Drizzle client.
- **Switch models without touching code.** Change `AI_MODEL` — or point
  `AI_GATEWAY_BASE_URL` and `AI_GATEWAY_API_KEY` at a different OpenAI-compatible
  endpoint — and restart. Nothing in `src/` names a provider.
- **Add a second agent.** Drop a file next to `agents/commenter.ts`, register it in
  the `agents` map in `src/mastra/index.ts`, and reach it from a step with
  `mastra.getAgent('yourAgent')`. It shows up in Studio immediately.
- **Add an endpoint.** Add a `registerApiRoute('/api/…')` entry in
  `src/mastra/routes.ts`, and a matching server route in
  `apps/web/src/routes/api/` that proxies to it. Keep custom routes under `/api`
  and leave `/mastra` to Mastra.
