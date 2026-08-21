import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'

export const Route = createFileRoute('/')({
  component: NewTodoPage,
})

function NewTodoPage() {
  const navigate = useNavigate()
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

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error ?? `Request failed (${response.status})`)
      }

      await navigate({ to: '/todos' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = title.trim().length > 0 && !isSubmitting

  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">New todo</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Submitting starts a Mastra workflow: it saves the todo, then an AI agent
        writes a comment on it. The comment shows up on the list a moment later.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
          maxLength={500}
          autoFocus
          className="w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-accent focus:ring-2 focus:ring-accent/20"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className="self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? 'Adding…' : 'Add todo'}
        </button>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  )
}
