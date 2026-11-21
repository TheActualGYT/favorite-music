import { createServerFn } from "@tanstack/react-start";

type ArtistIndex = { id: string; name: string; key: string };

let artistCache: { at: number; artists: ArtistIndex[] } | null = null;
const songCache = new Map<string, { at: number; songs: Record<string, number> }>();
const DAY = 12 * 60 * 60 * 1000;

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function artistIndex(): Promise<ArtistIndex[]> {
  if (artistCache && Date.now() - artistCache.at < DAY) return artistCache.artists;
  const res = await fetch("https://kworb.net/spotify/artists.html", {
    headers: { "user-agent": "GarrettKpopDatabase/1.0" },
  });
  if (!res.ok) return artistCache?.artists ?? [];
  const html = await res.text();
  const artists = [...html.matchAll(/href="\/spotify\/artist\/([A-Za-z0-9]+)_songs\.html">([^<]+)</g)].map(
    (match) => ({ id: match[1], name: match[2], key: norm(match[2]) }),
  );
  artistCache = { at: Date.now(), artists };
  return artists;
}

function findArtist(artists: ArtistIndex[], name: string) {
  const key = norm(name);
  const aliases = [key, key.replace(/^g/, ""), key.replace(/idle$/, "idle")].filter(Boolean);
  return (
    artists.find((artist) => aliases.includes(artist.key)) ??
    artists.find((artist) => artist.key.includes(key) || key.includes(artist.key))
  );
}

export const getSpotifyStreams = createServerFn({ method: "POST" })
  .inputValidator((data: { artist: string }) => data)
  .handler(async ({ data }) => {
    const artists = await artistIndex();
    const artist = findArtist(artists, data.artist);
    if (!artist) return { songs: {} as Record<string, number> };
    const cached = songCache.get(artist.id);
    if (cached && Date.now() - cached.at < DAY) return { songs: cached.songs };
    const res = await fetch(`https://kworb.net/spotify/artist/${artist.id}_songs.html`, {
      headers: { "user-agent": "GarrettKpopDatabase/1.0" },
    });
    if (!res.ok) return { songs: cached?.songs ?? {} };
    const html = await res.text();
    const songs: Record<string, number> = {};
    for (const match of html.matchAll(
      /<tr><td class="text"><div>(?:\* )?[^<]*<a [^>]*>([^<]+)<\/a><\/div><\/td><td>([\d,]+)<\/td>/g,
    )) {
      songs[norm(match[1])] = Number(match[2].replace(/,/g, ""));
    }
    songCache.set(artist.id, { at: Date.now(), songs });
    return { songs };
  });
