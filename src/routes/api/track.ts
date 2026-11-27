import { createFileRoute } from "@tanstack/react-router";

function plain(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export const Route = createFileRoute("/api/track")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const title = url.searchParams.get("title")?.trim() ?? "";
        const artist = url.searchParams.get("artist")?.trim() ?? "";
        const album = url.searchParams.get("album")?.trim() ?? "";
        if (!title) return Response.json({ error: "missing title" }, { status: 400 });
        const queries = [`${title} ${artist}`, album ? `${album} ${artist}` : "", title].filter(Boolean);
        const titleKey = plain(title);
        const artistKey = plain(artist);
        for (const term of queries) {
          try {
            const res = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8`,
            );
            if (!res.ok) continue;
            const data = (await res.json()) as {
              results?: {
                trackName?: string;
                artistName?: string;
                collectionName?: string;
                releaseDate?: string;
                artworkUrl100?: string;
                trackTimeMillis?: number;
              }[];
            };
            const results = data.results ?? [];
            const hits = results.filter((item) => {
              const track = plain(item.trackName || "");
              const by = plain(item.artistName || "");
              const titleOk = track === titleKey || track.startsWith(titleKey) || titleKey.startsWith(track) || track.includes(titleKey);
              const artistOk = !artistKey || artistKey.length < 2 || by.includes(artistKey) || artistKey.includes(by);
              return titleOk && artistOk;
            });
            const match =
              hits.find((item) => plain(item.trackName || "") === titleKey && !/english ver/i.test(item.trackName || "")) ??
              hits[0] ??
              results.find((item) => plain(item.trackName || "").includes(titleKey));
            if (!match) continue;
            return Response.json({
              album: (match.collectionName ?? album).replace(/\s*[-–]\s*single$/i, "").trim(),
              releaseDate: match.releaseDate?.slice(0, 10) ?? "",
              coverUrl: match.artworkUrl100?.replace("100x100bb", "600x600bb"),
              durationMs: match.trackTimeMillis,
            });
          } catch {
            // try the next query
          }
        }
        return Response.json(null);
      },
    },
  },
});
