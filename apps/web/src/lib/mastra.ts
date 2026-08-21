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
  // Read the env var per request rather than at module scope so the value is
  // picked up from the runtime environment wherever this is deployed.
  const baseUrl = process.env.MASTRA_API_URL ?? DEFAULT_MASTRA_API_URL

  let upstream: Response
  try {
    upstream = await fetch(`${baseUrl}${path}`, init)
  } catch {
    return Response.json({ error: 'Mastra server unreachable' }, { status: 502 })
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
