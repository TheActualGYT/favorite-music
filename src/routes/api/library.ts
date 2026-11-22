import { createFileRoute } from "@tanstack/react-router";
import { readLibrary, writeLibrary } from "../../lib/library.server";

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export const Route = createFileRoute("/api/library")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers }),
      GET: async () => {
        try {
          return json(await readLibrary());
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not load the library";
          return json({ error: message }, 500);
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { data?: unknown };
          await writeLibrary(body?.data);
          return json({ ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not save the library";
          return json({ error: message }, 500);
        }
      },
    },
  },
});
