import type { WorkflowStreamEvent } from "@mastra/core/workflows";

import { COMMENT_DELTA } from "./workflows/todo-workflow.js";

/**
 * Translates a workflow run's event stream into the four Server-Sent Events the
 * browser understands. The web app never sees Mastra's internal event shapes —
 * this file is the whole translation layer, and the event names below are the
 * frozen contract with apps/web.
 *
 *   todo   { todoId, title, createdAt }   save-todo committed
 *   delta  { text }                       one chunk of the agent's comment
 *   done   { todoId?, commentId? }        run reached its end; refetch the list
 *   error  { message }                    the run failed; fall back to polling
 *
 * `done` is always the last event, including when the run had already finished
 * before this request attached. The browser reacts to it by refetching GET
 * /todos, so a stream that carried nothing still lands the user in the right
 * place — the stream is an optimisation over polling, never the source of truth.
 */

const encoder = new TextEncoder();

export function toSseResponse(events: ReadableStream<WorkflowStreamEvent>): Response {
  // Read through an explicit reader (not `for await`) so the reader can be
  // cancelled from `cancel()` when the browser disconnects. Cancelling only
  // detaches this observer; the run itself keeps going and still saves the
  // comment — see the note on POST /todos in routes.ts.
  const reader = events.getReader();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;

      const send = (event: string, data: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          open = false;
        }
      };

      let ended = false;

      try {
        while (!ended) {
          const { done, value } = await reader.read();
          if (done) break;

          switch (value.type) {
            case "workflow-step-output": {
              const chunk = value.payload.output as
                | { type?: string; text?: string }
                | undefined;
              if (chunk?.type === COMMENT_DELTA && chunk.text) {
                send("delta", { text: chunk.text });
              }
              break;
            }

            case "workflow-step-result": {
              const { id, status, output } = value.payload;

              if (status === "failed") {
                send("error", { message: errorMessage(value.payload) });
                ended = true;
              } else if (status === "success" && id === "save-todo") {
                send("todo", output);
              } else if (status === "success" && id === "save-comment") {
                send("done", output);
                ended = true;
              }
              break;
            }

            case "workflow-finish": {
              if (value.payload.workflowStatus !== "success") {
                send("error", { message: errorMessage(value.payload.metadata) });
              }
              ended = true;
              break;
            }
          }
        }
      } catch (cause) {
        send("error", { message: errorMessage(cause) });
        ended = true;
      }

      if (!ended) send("done", {});

      await reader.cancel().catch(() => {});
      if (open) {
        try {
          controller.close();
        } catch {
          /* already closed by a disconnect */
        }
      }
    },

    cancel(reason) {
      void reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      // `no-transform` and `X-Accel-Buffering` ask intermediaries (nginx, CDNs,
      // Rock8Cloud's ingress) not to buffer or gzip the response. Without them
      // every delta arrives at once when the run finishes, which looks exactly
      // like the streaming being broken.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function errorMessage(source: unknown): string {
  if (source instanceof Error) return source.message;

  if (source && typeof source === "object") {
    const record = source as Record<string, unknown>;
    const candidate = record.errorMessage ?? record.message ?? record.error;
    if (typeof candidate === "string") return candidate;
    if (candidate instanceof Error) return candidate.message;
  }

  return "The workflow run failed";
}
