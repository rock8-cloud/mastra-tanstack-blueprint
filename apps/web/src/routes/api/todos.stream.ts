import { createFileRoute } from '@tanstack/react-router'
import { streamFromMastra } from '../../lib/mastra'

/**
 * Live view of one workflow run: `GET /api/todos/stream?runId=...`.
 *
 * Same rule as the rest of the app — the browser never talks to Mastra
 * directly, so the SSE connection is proxied through here too. This route only
 * observes a run that POST /api/todos already started; closing the connection
 * does not cancel anything.
 */
export const Route = createFileRoute('/api/todos/stream')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const runId = new URL(request.url).searchParams.get('runId')?.trim()

        if (!runId) {
          return Response.json({ error: 'runId is required' }, { status: 400 })
        }

        return streamFromMastra(`/todos/stream/${encodeURIComponent(runId)}`)
      },
    },
  },
})
