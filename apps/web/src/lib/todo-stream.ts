/**
 * Client-side reader for the run stream (`GET /api/todos/stream?runId=...`).
 *
 * `fetch` + a small SSE parser rather than `EventSource`, for two reasons: an
 * AbortController lets React cancel cleanly on unmount, and a failed request
 * surfaces as a rejected promise instead of EventSource's silent auto-retry
 * loop — which matters because the fallback here is "give up and let polling
 * show the comment", not "reconnect forever".
 */

export interface TodoStreamHandlers {
  onTodo(todo: { todoId: string; title: string; createdAt: string }): void
  onDelta(text: string): void
  onDone(): void
}

export function subscribeToRun(
  runId: string,
  handlers: TodoStreamHandlers,
): () => void {
  const controller = new AbortController()

  void readStream(runId, handlers, controller.signal).catch(() => {
    // Any failure — network, proxy, upstream 404 — ends the live view and
    // hands the job back to the polling query. Nothing is lost: the comment is
    // saved by the workflow either way.
    handlers.onDone()
  })

  return () => controller.abort()
}

async function readStream(
  runId: string,
  handlers: TodoStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `/api/todos/stream?runId=${encodeURIComponent(runId)}`,
    { signal, headers: { Accept: 'text/event-stream' } },
  )

  if (!response.ok || !response.body) {
    throw new Error(`Stream failed (${response.status})`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += value

    // SSE frames are separated by a blank line; anything after the last one is
    // a partial frame and stays in the buffer until the rest arrives.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const event = dispatch(frame, handlers)
      if (event === 'done') return
    }
  }

  handlers.onDone()
}

function dispatch(frame: string, handlers: TodoStreamHandlers): string | null {
  let event = ''
  let data = ''

  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7)
    else if (line.startsWith('data: ')) data += line.slice(6)
  }

  if (!event) return null

  switch (event) {
    case 'todo':
      handlers.onTodo(JSON.parse(data))
      return event
    case 'delta':
      handlers.onDelta(JSON.parse(data).text)
      return event
    case 'done':
    case 'error':
      handlers.onDone()
      return 'done'
    default:
      return event
  }
}
