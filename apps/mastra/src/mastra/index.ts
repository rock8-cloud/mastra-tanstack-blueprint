import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { PinoLogger } from "@mastra/loggers";

import { requireEnv } from "../env.js";
import { runMigrations } from "../db/migrate.js";
import { commenterAgent } from "./agents/commenter.js";
import { todoRoutes } from "./routes.js";
import { todoWorkflow } from "./workflows/todo-workflow.js";

// The app schema is brought up to date before the server takes a request —
// the same guarantee PostgresStore gives Mastra's own tables below. A failed
// migration crashes the boot, which is the right failure mode: better no
// server than one running against the wrong schema. Assumes one instance;
// with replicas, move this into a release step instead.
await runMigrations();

const connectionString = requireEnv("DATABASE_URL");

// The two Postgres drivers in this app disagree about `sslmode=require`:
// postgres.js (src/db) encrypts without verifying the certificate — libpq
// semantics — while node-postgres (inside @mastra/pg) escalates it to
// verify-full and rejects the self-signed certificates managed Postgres
// offerings (Rock8Cloud's included) present. Setting DATABASE_SSL_NO_VERIFY
// tells the store to encrypt without verifying, matching postgres.js.
const relaxedSsl =
  process.env.DATABASE_SSL_NO_VERIFY === "true"
    ? { ssl: { rejectUnauthorized: false } }
    : {};

export const mastra = new Mastra({
  agents: { commenter: commenterAgent },
  workflows: { "todo-workflow": todoWorkflow },

  // Mastra's own state — run snapshots, traces, memory — goes into the same
  // Postgres as the app's todos. One database to provision, back up and inspect;
  // a workflow run and the rows it wrote can be read in a single psql session.
  storage: new PostgresStore({
    id: "mastra-blueprint",
    connectionString,
    ...relaxedSsl,
  }),

  logger: new PinoLogger({ name: "mastra-blueprint", level: "info" }),

  server: {
    // Bound explicitly, from the environment. Left unset, `mastra dev` scans
    // 4111-4131 and silently starts on the first free one — so a port already
    // taken by something else moves the server without saying so, and apps/web
    // (pointing at MASTRA_API_URL) ends up talking to the wrong thing or to
    // nothing. With a port configured here, a busy port is a loud EADDRINUSE.
    // `PORT` is what Rock8Cloud injects into a deployed service, and it is
    // honoured identically by `mastra dev` and `mastra start`.
    port: Number(process.env.PORT ?? 4111),

    // Custom routes live at the root (`/todos`); Mastra's own REST API keeps
    // its default `/api/*` prefix, where every Mastra doc, client and tool
    // expects it. (Mastra refuses to register custom routes under `apiPrefix`.)
    apiRoutes: todoRoutes,
  },
});
