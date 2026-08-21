import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { insertComment, insertTodo } from "../../db/queries.js";

/**
 * The pedagogical core of this blueprint.
 *
 * Everything the app does to a todo is one workflow of three small steps. Each
 * step declares its input and output with zod, which buys three things at once:
 * Mastra validates the data crossing every step boundary, TypeScript infers the
 * `inputData` type inside `execute`, and Studio can render the run — including
 * the exact payload that failed — without any extra instrumentation.
 *
 * The steps are deliberately narrow (one side effect each). That granularity is
 * what makes a run resumable and debuggable: if the model call fails, the todo
 * is already committed and the run shows precisely which step to retry.
 *
 * A run also emits events while it executes. `generate-comment` pushes the
 * agent's text deltas onto that stream with its `writer`, which is what lets the
 * browser watch the comment being written (src/mastra/todo-stream.ts). Nothing
 * about the steps' contract changes: the step still returns the whole comment.
 */

const saveTodo = createStep({
  id: "save-todo",
  description: "Persists the todo so it exists before any AI work is attempted.",
  inputSchema: z.object({ title: z.string() }),
  outputSchema: z.object({
    todoId: z.string(),
    title: z.string(),
    createdAt: z.string(),
  }),
  execute: async ({ inputData }) => {
    const todo = await insertTodo(inputData.title);
    // createdAt travels with the step output so the stream can render a real
    // card (same shape as GET /todos) before the comment exists.
    return {
      todoId: todo.id,
      title: todo.title,
      createdAt: todo.createdAt.toISOString(),
    };
  },
});

/** Custom event this step writes into the run's stream, one per model token. */
export const COMMENT_DELTA = "comment-delta";

const generateComment = createStep({
  id: "generate-comment",
  description: "Asks the commenter agent for one short, actionable comment.",
  inputSchema: z.object({ todoId: z.string(), title: z.string() }),
  outputSchema: z.object({ todoId: z.string(), comment: z.string() }),
  // The agent is pulled from the Mastra registry rather than imported directly,
  // so this call is traced as part of the run and the agent stays swappable.
  execute: async ({ inputData, mastra, writer }) => {
    const agent = mastra.getAgent("commenter");
    const result = await agent.stream(
      `Todo: ${inputData.title}\n\nWrite your comment.`,
    );

    // `writer` is the step's handle on the run's event stream. Every chunk
    // written here shows up as a `workflow-step-output` event on anything
    // observing the run (our SSE route, Studio, the Mastra client SDK), which
    // is how the browser sees the comment appear token by token.
    //
    // The write must be awaited: an un-awaited write locks the stream and the
    // next one throws "WritableStream is locked".
    let comment = "";
    for await (const delta of result.textStream) {
      comment += delta;
      await writer.write({ type: COMMENT_DELTA, text: delta });
    }

    // A failed model call does not throw out of `textStream` — the stream just
    // ends and the failure lands on `result.error`. Without these two checks a
    // dead gateway yields a "successful" run that saved an empty comment:
    // Studio shows green, the UI shows nothing, and the one failure this
    // blueprint most needs to surface is the one it hides.
    if (result.error) throw result.error;

    comment = comment.trim();
    if (!comment) {
      throw new Error(
        "commenter agent returned no text — check AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY / AI_MODEL",
      );
    }

    return { todoId: inputData.todoId, comment };
  },
});

const saveComment = createStep({
  id: "save-comment",
  description: "Persists the generated comment against its todo.",
  inputSchema: z.object({ todoId: z.string(), comment: z.string() }),
  outputSchema: z.object({ todoId: z.string(), commentId: z.string() }),
  execute: async ({ inputData }) => {
    const comment = await insertComment({
      todoId: inputData.todoId,
      content: inputData.comment,
      author: "agent",
    });

    return { todoId: inputData.todoId, commentId: comment.id };
  },
});

// Each step's outputSchema is the next step's inputSchema, so `.then()` chains
// type-check end to end — a renamed field is a compile error, not a 3am bug.
export const todoWorkflow = createWorkflow({
  id: "todo-workflow",
  inputSchema: z.object({ title: z.string() }),
  outputSchema: z.object({ todoId: z.string(), commentId: z.string() }),
})
  .then(saveTodo)
  .then(generateComment)
  .then(saveComment)
  .commit();
