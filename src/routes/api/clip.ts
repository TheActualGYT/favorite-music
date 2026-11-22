import { createFileRoute } from "@tanstack/react-router";
import { buildClip } from "../../lib/clip.server";

export const Route = createFileRoute("/api/clip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const videoId = url.searchParams.get("v") ?? "";
        const start = Number(url.searchParams.get("start") ?? "0");
        if (!videoId) return Response.json({ error: "Missing video id" }, { status: 400 });
        try {
          const result = await buildClip(videoId, Number.isFinite(start) ? start : 0);
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not make the clip";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
