import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

import { subscribeToRun } from '../lib/todo-stream'
import type { Todo } from '../types'

export const Route = createFileRoute('/')({
  component: TodosPage,
})

/** The optimistic card shown while a run is streaming its comment. */
interface StreamingTodo {
  runId: string
  title: string
  todoId: string | null
  createdAt: string | null
  comment: string
}

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
  const queryClient = useQueryClient()
  const [streaming, setStreaming] = useState<StreamingTodo | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)

  // Polling is the source of truth and never turns off: it covers todos added
  // in another tab, a stream that failed to connect, and the seconds between a
  // run finishing and its comment being saved. The live stream below is a
  // faster path onto the same data, not a replacement for it.
  const {
    data: todos,
    error,
    isPending,
  } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    refetchInterval: 2000,
  })

  useEffect(() => () => unsubscribe.current?.(), [])

  function watchRun(runId: string, title: string) {
    unsubscribe.current?.()
    setStreaming({ runId, title, todoId: null, createdAt: null, comment: '' })

    unsubscribe.current = subscribeToRun(runId, {
      onTodo: ({ todoId, createdAt }) =>
        setStreaming((current) =>
          current?.runId === runId ? { ...current, todoId, createdAt } : current,
        ),
      onDelta: (text) =>
        setStreaming((current) =>
          current?.runId === runId
            ? { ...current, comment: current.comment + text }
            : current,
        ),
      // Refetch first, then drop the optimistic card, so the saved comment is
      // already on screen when the streamed one disappears.
      onDone: () => {
        void queryClient
          .refetchQueries({ queryKey: ['todos'] })
          .finally(() =>
            setStreaming((current) =>
              current?.runId === runId ? null : current,
            ),
          )
      },
    })
  }

  // The list already carries the todo the stream is rendering (polling picks it
  // up the moment save-todo commits), so hide the persisted copy until the
  // optimistic card goes away.
  const listed = todos?.filter((todo) => todo.id !== streaming?.todoId) ?? []

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Todos</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Adding a todo starts a Mastra workflow: it saves the todo, asks an AI
          agent for a comment, and saves that too. The comment streams in as the
          model writes it.
        </p>

        <TodoForm onStarted={watchRun} />
      </section>

      <section>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error.message}
          </p>
        ) : null}

        {isPending ? <p className="text-sm text-neutral-500">Loading…</p> : null}

        {!isPending && !streaming && listed.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nothing here yet. Add the first todo above.
          </p>
        ) : null}

        <ul className="flex flex-col gap-3">
          {streaming ? (
            <TodoCard
              title={streaming.title}
              createdAt={streaming.createdAt}
              key={streaming.runId}
            >
              <Comment author="agent">
                {streaming.comment}
                <Caret />
              </Comment>
            </TodoCard>
          ) : null}

          {listed.map((todo) => (
            <TodoCard key={todo.id} title={todo.title} createdAt={todo.createdAt}>
              {todo.comments.length === 0 ? (
                <p className="animate-pulse text-sm text-neutral-400">
                  agent is thinking…
                </p>
              ) : (
                todo.comments.map((comment) => (
                  <Comment key={comment.id} author={comment.author}>
                    {comment.content}
                  </Comment>
                ))
              )}
            </TodoCard>
          ))}
        </ul>
      </section>
    </div>
  )
}

function TodoForm({
  onStarted,
}: {
  onStarted: (runId: string, title: string) => void
}) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      // Same-origin call to this app's own server route, which proxies to Mastra.
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })

      const body = (await response.json().catch(() => null)) as {
        runId?: string
        error?: string
      } | null

      if (!response.ok || !body?.runId) {
        throw new Error(body?.error ?? `Request failed (${response.status})`)
      }

      onStarted(body.runId, title.trim())
      setTitle('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
          maxLength={500}
          autoFocus
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={title.trim().length === 0 || isSubmitting}
          className="shrink-0 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? 'Adding…' : 'Add todo'}
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}

function TodoCard({
  title,
  createdAt,
  children,
}: {
  title: string
  createdAt: string | null
  children: ReactNode
}) {
  return (
    <li className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
      <div className="flex items-baseline justify-between gap-6">
        <h3 className="text-sm font-medium">{title}</h3>
        <time
          dateTime={createdAt ?? undefined}
          className="shrink-0 text-xs text-neutral-400"
        >
          {createdAt ? formatRelativeTime(createdAt) : 'saving…'}
        </time>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-l-2 border-neutral-100 pl-4">
        {children}
      </div>
    </li>
  )
}

function Comment({
  author,
  children,
}: {
  author: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="mt-0.5 h-fit shrink-0 rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-strong">
        {author}
      </span>
      <p className="text-neutral-700">{children}</p>
    </div>
  )
}

/** Blinking caret at the end of the text the model is still writing. */
function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-px translate-y-[0.15em] animate-pulse bg-accent"
    />
  )
}

function formatRelativeTime(isoDate: string): string {
  const seconds = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
