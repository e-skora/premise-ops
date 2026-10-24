import { NextRequest } from "next/server";
import { executeActiveProbes } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let tick = 0;
      let closed = false;

      const sendTick = async () => {
        if (closed) return;
        try {
          tick += 1;
          const result = await executeActiveProbes({
            applyMicroDrift: true,
          });
          const payload = JSON.stringify({
            type: "probe_tick",
            tick,
            timestamp: new Date().toISOString(),
            probesExecuted: result.probesExecuted,
            artifacts: result.artifacts,
            invalidationEvents: result.invalidationEvents,
          });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // Ignore stream errors after client disconnect
        }
      };

      // Emit initial tick immediately
      await sendTick();

      const interval = setInterval(sendTick, 4500);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
