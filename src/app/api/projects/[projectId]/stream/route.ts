import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";

/**
 * Server-sent stream of agent activity.
 *
 * Replaces polling `messages.getMany` every 2 seconds — which re-sent every
 * generated source file on every tick — with a cursor tail over the AgentEvent
 * log. Events are durable rows, so a refresh mid-generation replays the history
 * rather than showing a blank spinner.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 700;
const HEARTBEAT_MS = 15_000;
const MAX_DURATION_MS = 10 * 60 * 1000;

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const { userId } = await auth();

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) {
    return new Response("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  // EventSource reconnects on its own and cannot carry a query string it did
  // not open with, so the resume point has to come from `Last-Event-ID`.
  // Without it every reconnect replayed the same tail and the activity list
  // showed each step two or three times.
  const resumeFrom = Number(request.headers.get("last-event-id") ?? "");
  let cursor =
    Number.isFinite(resumeFrom) && resumeFrom > 0
      ? resumeFrom
      : Number(url.searchParams.get("cursor") ?? 0) || 0;

  // Default to only new activity so opening a finished project doesn't replay
  // its entire history.
  if (cursor === 0) {
    const latest = await prisma.agentEvent.findFirst({
      where: { projectId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    cursor = Math.max(0, (latest?.seq ?? 0) - 30);
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let lastBeat = Date.now();

      const send = (event: string, data: unknown, id?: number) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(
            `${id === undefined ? "" : `id: ${id}\n`}` +
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", close);

      const tick = async () => {
        if (closed) return;

        if (Date.now() - startedAt > MAX_DURATION_MS) {
          send("expired", {});
          close();
          return;
        }

        try {
          const events = await prisma.agentEvent.findMany({
            where: { projectId, seq: { gt: cursor } },
            orderBy: { seq: "asc" },
            take: 50,
          });

          if (events.length) {
            cursor = events[events.length - 1].seq;
            for (const event of events) {
              send(
                "activity",
                {
                  seq: event.seq,
                  type: event.type,
                  label: event.label,
                  detail: event.detail,
                  // Which run this step belongs to, so the chat can show it
                  // against the right turn instead of mixing in the last one.
                  messageId: event.messageId,
                  at: event.createdAt.toISOString(),
                },
                event.seq,
              );
            }
            lastBeat = Date.now();
          } else if (Date.now() - lastBeat > HEARTBEAT_MS) {
            // Keeps intermediaries from closing an idle connection.
            controller.enqueue(encoder.encode(": ping\n\n"));
            lastBeat = Date.now();
          }
        } catch {
          close();
        }
      };

      const timer = setInterval(tick, POLL_MS);
      send("open", { cursor });
      await tick();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disables proxy buffering, without which nothing arrives until the end.
      "x-accel-buffering": "no",
    },
  });
}
