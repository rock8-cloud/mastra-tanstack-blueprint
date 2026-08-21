import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { Todo } from '../types'

export const Route = createFileRoute('/todos')({
  component: TodosPage,
})

async function fetchTodos(): Promise<Todo[]> {
  const response = await fetch('/api/todos')

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }

  const body = (await response.json()) as { todos: Todo[] }
  return body.todos
}

function TodosPage() {
  // The agent's comment is produced by an async workflow, so creating a todo
  // returns before the comment exists. Polling is the simplest way to surface
  // that — no websockets, no server-sent events, nothing to explain.
  const {
    data: todos,
    error,
    isPending,
  } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    refetchInterval: 2000,
  })

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Todos</h1>
        <Link to="/" className="text-sm text-accent hover:text-accent-strong">
          New todo
        </Link>
      </div>

      {isPending ? <p className="mt-6 text-sm text-neutral-500">Loading…</p> : null}

      {error ? (
        <p className="mt-6 text-sm text-red-600" role="alert">
          {error.message}
        </p>
      ) : null}

      {todos?.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          Nothing here yet. <Link to="/" className="text-accent hover:text-accent-strong">Add the first todo.</Link>
        </p>
      ) : null}

      <ul className="mt-6 flex flex-col gap-3">
        {todos?.map((todo) => (
          <TodoCard key={todo.id} todo={todo} />
        ))}
      </ul>
    </section>
  )
}

function TodoCard({ todo }: { todo: Todo }) {
  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium">{todo.title}</h2>
        <time
          dateTime={todo.createdAt}
          className="shrink-0 text-xs text-neutral-400"
        >
          {formatRelativeTime(todo.createdAt)}
        </time>
      </div>

      {todo.comments.length === 0 ? (
        <p className="mt-3 animate-pulse text-xs text-neutral-400">
          agent is thinking…
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2 border-t border-neutral-100 pt-3">
          {todo.comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5 text-sm">
              <span className="mt-0.5 h-fit shrink-0 rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-strong">
                {comment.author}
              </span>
              <p className="text-neutral-700">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function formatRelativeTime(isoDate: string): string {
  const seconds = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
