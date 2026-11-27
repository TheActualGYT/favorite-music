import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/thumb")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("v") ?? "";
        if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return new Response("Bad video id", { status: 400 });
        for (const name of ["maxresdefault.jpg", "hq720.jpg", "mqdefault.jpg"]) {
          const res = await fetch(`https://i.ytimg.com/vi/${id}/${name}`);
          if (!res.ok) continue;
          const type = res.headers.get("content-type") ?? "";
          if (!type.startsWith("image/")) continue;
          const bytes = await res.arrayBuffer();
          if (bytes.byteLength < 2000) continue;
          return new Response(bytes, {
            headers: { "content-type": type, "cache-control": "public, max-age=86400" },
          });
        }
        return new Response("No thumbnail", { status: 404 });
      },
    },
  },
});
