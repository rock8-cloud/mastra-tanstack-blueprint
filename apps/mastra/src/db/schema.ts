import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * The application's own tables. Mastra keeps its runtime state (workflow runs,
 * snapshots, traces, memory) in the *same* Postgres database under its own
 * `mastra_*` tables — one database, one connection string, one backup story.
 * Drizzle only ever owns the tables declared here.
 */
export const todos = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  todoId: uuid("todo_id")
    .notNull()
    .references(() => todos.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  // The blueprint only ever writes 'agent', but the column exists so a human
  // comment feature can be added without a migration.
  author: text("author").notNull().default("agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Declared so `db.query.todos.findMany({ with: { comments: true } })` can load a
// todo and its comments in one round trip instead of an N+1 of manual queries.
export const todosRelations = relations(todos, ({ many }) => ({
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  todo: one(todos, { fields: [comments.todoId], references: [todos.id] }),
}));
