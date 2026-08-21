/**
 * Server-side access to the Mastra API.
 *
 * Blueprint principle: the browser never talks to Mastra, the database or the AI
 * gateway. Every call goes browser -> this app's /api/* server route -> Mastra ->
 * workflow. The indirection keeps the upstream URL (and any future credentials)
 * on the server and gives us a single place to normalise upstream failures.
 *
 * This module must only ever be imported from a server route handler.
 */

const DEFAULT_MASTRA_API_URL = 'http://localhost:4111'

/**
 * Forwards a request to Mastra and passes the upstream status and body straight
 * through. A connection failure (Mastra not running) becomes a 502 so the UI can
 * tell "upstream is down" apart from "upstream rejected the request".
 */
export async function proxyToMastra(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(`${mastraUrl()}${path}`, init)
  } catch {
    return Response.json({ error: 'Mastra server unreachable' }, { status: 502 })
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * The same proxy for Server-Sent Events, with one difference that is the whole
 * point: the upstream body is handed back untouched instead of being buffered
 * with `text()`. Buffering would collect every token and deliver them in one
 * burst when the run ends, which looks identical to streaming being broken.
 *
 * The headers matter as much as the body. `no-transform` and `X-Accel-Buffering`
 * tell intermediaries (nitro's node server, nginx, a CDN, Rock8Cloud's ingress)
 * not to compress or buffer the response — a gzip layer with a 4KB window would
 * hold the first tokens hostage exactly the same way.
 */
export async function streamFromMastra(path: string): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(`${mastraUrl()}${path}`, {
      headers: { Accept: 'text/event-stream' },
    })
  } catch {
    return Response.json({ error: 'Mastra server unreachable' }, { status: 502 })
  }

  // Errors upstream (404 for an unknown run) come back as JSON, not a stream.
  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/**
 * Read per request rather than at module scope so the value is picked up from
 * the runtime environment wherever this is deployed.
 */
function mastraUrl(): string {
  return process.env.MASTRA_API_URL ?? DEFAULT_MASTRA_API_URL
}
