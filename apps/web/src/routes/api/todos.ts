import { createFileRoute } from '@tanstack/react-router'
import { proxyToMastra } from '../../lib/mastra'

const MAX_TITLE_LENGTH = 500

/**
 * The app's own todo API. It validates input, then proxies to Mastra.
 * Nothing here touches a database or an AI provider directly.
 */
export const Route = createFileRoute('/api/todos')({
  server: {
    handlers: {
      GET: () => proxyToMastra('/todos'),

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          title?: unknown
        } | null
        const title = typeof body?.title === 'string' ? body.title.trim() : ''

        if (title.length === 0) {
          return Response.json(
            { error: 'title is required' },
            { status: 400 },
          )
        }
        if (title.length > MAX_TITLE_LENGTH) {
          return Response.json(
            { error: `title must be ${MAX_TITLE_LENGTH} characters or fewer` },
            { status: 400 },
          )
        }

        // Mastra answers 202 immediately: the workflow that saves the todo and
        // asks the agent for a comment keeps running after this response.
        return proxyToMastra('/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        })
      },
    },
  },
})
