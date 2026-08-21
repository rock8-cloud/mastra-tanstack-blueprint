import { asc, desc } from "drizzle-orm";

import { getDb } from "./client.js";
import { comments, todos } from "./schema.js";

/**
 * The complete data-access surface of this app. Workflow steps and API routes
 * call these named functions; they never touch Drizzle or SQL themselves.
 *
 * The payoff is testability and blast radius: a step is just "call a function,
 * return typed data", so swapping the persistence layer or adding an index
 * touches this file only.
 */

export async function insertTodo(title: string) {
  const [todo] = await getDb().insert(todos).values({ title }).returning();

  if (!todo) throw new Error("Failed to insert todo");

  return todo;
}

export async function insertComment(input: {
  todoId: string;
  content: string;
  author: string;
}) {
  const [comment] = await getDb().insert(comments).values(input).returning();

  if (!comment) throw new Error("Failed to insert comment");

  return comment;
}

/** Newest todo first; comments within a todo oldest first (reading order). */
export async function listTodosWithComments() {
  return getDb().query.todos.findMany({
    orderBy: desc(todos.createdAt),
    with: {
      comments: { orderBy: asc(comments.createdAt) },
    },
  });
}
