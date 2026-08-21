import { registerApiRoute } from "@mastra/core/server";
import { z } from "zod";

import { listTodosWithComments } from "../db/queries.js";
import { toSseResponse } from "./todo-stream.js";

/**
 * The HTTP contract apps/web talks to. These three routes are the entire public
 * surface of the backend and live at the root (`/todos`): Mastra reserves the
 * `/api/*` prefix for its own REST API and refuses custom routes beneath it,
 * so custom routes get their own paths — the framework's convention.
 *
 * Routes do no business logic: they validate input, delegate to a workflow or a
 * query function, and shape the response.
 */

const createTodoBody = z.object({
  title: z.string().trim().min(1).max(500),
});

export const todoRoutes = [
  registerApiRoute("/todos", {
    method: "POST",
    handler: async (c) => {
      const parsed = createTodoBody.safeParse(await c.req.json().catch(() => null));

      if (!parsed.success) {
        return c.json({ error: "title must be a string of 1-500 characters" }, 400);
      }

      const workflow = c.get("mastra").getWorkflow("todo-workflow");
      const run = await workflow.createRun();

      // Fire-and-forget: the model call takes seconds, and the client should not
      // hold a request open for it. We answer 202 with the runId immediately and
      // the comment shows up on a later GET — the run itself is durable in
      // Postgres, so a crash mid-generation is recoverable and inspectable in
      // Studio rather than lost with the HTTP connection.
      //
      // `run.stream()` (not `run.startAsync()`) is what starts it. Both return
      // without waiting for the run, but `stream()` also records the run's
      // events, which is what makes GET /todos/stream/:runId an *observer*:
      // the run is driven here, by this request, and the SSE connection only
      // watches it. Nothing about the run depends on a browser being attached —
      // that is the durability story, and it is what the kill-the-client test
      // in the README exercises.
      run.stream({ inputData: { title: parsed.data.title } });

      return c.json({ runId: run.runId }, 202);
    },
  }),

  registerApiRoute("/todos/stream/:runId", {
    method: "GET",
    handler: async (c) => {
      const runId = c.req.param("runId");
      const workflow = c.get("mastra").getWorkflow("todo-workflow");

      // The snapshot POST /todos wrote is the proof the runId is real.
      if (!(await workflow.getWorkflowRunById(runId))) {
        return c.json({ error: `Unknown runId ${runId}` }, 404);
      }

      // `createRun({ runId })` hands back the *same* in-flight run object when
      // one is still executing in this process, so `observeStream()` replays
      // everything the run has emitted so far and then follows it live. Once a
      // run has finished, Mastra drops it and this returns an empty stream —
      // toSseResponse turns that into an immediate `done` and the browser
      // refetches. Polling stays the source of truth; this is the fast path.
      const run = await workflow.createRun({ runId });

      return toSseResponse(run.observeStream());
    },
  }),

  registerApiRoute("/todos", {
    method: "GET",
    handler: async (c) => {
      const todos = await listTodosWithComments();

      return c.json({
        todos: todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          createdAt: todo.createdAt.toISOString(),
          comments: todo.comments.map((comment) => ({
            id: comment.id,
            content: comment.content,
            author: comment.author,
            createdAt: comment.createdAt.toISOString(),
          })),
        })),
      });
    },
  }),
];
