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
 */

const saveTodo = createStep({
  id: "save-todo",
  description: "Persists the todo so it exists before any AI work is attempted.",
  inputSchema: z.object({ title: z.string() }),
  outputSchema: z.object({ todoId: z.string(), title: z.string() }),
  execute: async ({ inputData }) => {
    const todo = await insertTodo(inputData.title);
    return { todoId: todo.id, title: todo.title };
  },
});

const generateComment = createStep({
  id: "generate-comment",
  description: "Asks the commenter agent for one short, actionable comment.",
  inputSchema: z.object({ todoId: z.string(), title: z.string() }),
  outputSchema: z.object({ todoId: z.string(), comment: z.string() }),
  // The agent is pulled from the Mastra registry rather than imported directly,
  // so this call is traced as part of the run and the agent stays swappable.
  execute: async ({ inputData, mastra }) => {
    const agent = mastra.getAgent("commenter");
    const result = await agent.generate(
      `Todo: ${inputData.title}\n\nWrite your comment.`,
    );

    return { todoId: inputData.todoId, comment: result.text.trim() };
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
