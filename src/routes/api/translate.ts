import { createFileRoute } from "@tanstack/react-router";
import { translateLyricLines } from "../../lib/lyrics.server";

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export const Route = createFileRoute("/api/translate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { lines?: string[] };
          const lines = Array.isArray(body.lines) ? body.lines.map((line) => String(line ?? "")) : [];
          const english = await translateLyricLines(lines);
          return json({ english });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not translate";
          return json({ error: message }, 500);
        }
      },
    },
  },
});
