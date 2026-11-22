type ArtistIndex = { id: string; name: string; key: string };

let artistCache: { at: number; artists: ArtistIndex[] } | null = null;
const songCache = new Map<string, { at: number; songs: Record<string, number> }>();
const DAY = 12 * 60 * 60 * 1000;

const ALIASES: Record<string, string[]> = {
  gidle: ["idle"],
  idle: ["gidle"],
};

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looseTitle(value: string) {
  return norm(value.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+[-–].*$/, ""));
}

async function getJson(url: string) {
  const res = await fetch(url, {
    headers: { "user-agent": "GarrettKpopDatabase/1.0 (personal kpop database)", accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function artistIndex(): Promise<ArtistIndex[]> {
  if (artistCache && Date.now() - artistCache.at < DAY) return artistCache.artists;
  const res = await fetch("https://kworb.net/spotify/artists.html", {
    headers: { "user-agent": "GarrettKpopDatabase/1.0" },
  });
  if (!res.ok) return artistCache?.artists ?? [];
  const html = await res.text();
  const artists = [...html.matchAll(/href="\/spotify\/artist\/([A-Za-z0-9]+)_songs\.html">([^<]+)</g)]
    .map((match) => ({ id: match[1], name: match[2], key: norm(match[2]) }))
    .filter((artist) => artist.key.length > 0);
  artistCache = { at: Date.now(), artists };
  return artists;
}

function findArtist(artists: ArtistIndex[], name: string) {
  const key = norm(name);
  if (!key) return undefined;
  const exact = artists.find((artist) => artist.key === key);
  if (exact) return exact;
  const alias = artists.find((artist) => (ALIASES[key] ?? []).includes(artist.key));
  if (alias) return alias;
  let best: ArtistIndex | undefined;
  for (const artist of artists) {
    if (artist.key.length < 5 || key.length < 5) continue;
    const shorter = Math.min(artist.key.length, key.length);
    const longer = Math.max(artist.key.length, key.length);
    if (shorter / longer < 0.9) continue;
    if (artist.key.includes(key) || key.includes(artist.key)) {
      if (!best || Math.abs(artist.key.length - key.length) < Math.abs(best.key.length - key.length)) best = artist;
    }
  }
  return best;
}

async function spotifyIdFromMusicBrainz(name: string) {
  const wanted = norm(name);
  const search = (await getJson(
    `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=8`,
  )) as { artists?: { id: string; name: string; type?: string; country?: string }[] } | null;
  const artists = search?.artists ?? [];
  const match =
    artists.find((item) => item.type === "Group" && norm(item.name) === wanted && item.country === "KR") ??
    artists.find((item) => item.type === "Group" && norm(item.name) === wanted) ??
    artists.find((item) => norm(item.name) === wanted && item.type !== "Person");
  if (!match) return null;
  const detail = (await getJson(`https://musicbrainz.org/ws/2/artist/${match.id}?inc=url-rels&fmt=json`)) as {
    relations?: { url?: { resource?: string } }[];
  } | null;
  const url = (detail?.relations ?? []).find((rel) => rel.url?.resource?.includes("open.spotify.com/artist/"))?.url?.resource;
  return url?.match(/artist\/([A-Za-z0-9]+)/)?.[1] ?? null;
}

async function spotifyIdFromWiki(name: string) {
  const wanted = norm(name);
  const search = (await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${name} south korean group`)}&srlimit=5&format=json`,
  )) as { query?: { search?: { title: string }[] } } | null;
  const title = (search?.query?.search ?? []).find((hit) => norm(hit.title.replace(/\s*\([^)]*\)/g, "")) === wanted)?.title;
  if (!title) return null;
  const parsed = (await getJson(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1&format=json`,
  )) as { parse?: { wikitext?: { "*"?: string } } } | null;
  const text = parsed?.parse?.wikitext?.["*"] ?? "";
  return text.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/)?.[1] ?? null;
}

function readSongs(html: string) {
  const songs: Record<string, number> = {};
  for (const match of html.matchAll(
    /<tr><td class="text"><div>(?:\* )?[^<]*<a [^>]*>([^<]+)<\/a><\/div><\/td><td>([\d,]+)<\/td>/g,
  )) {
    const streams = Number(match[2].replace(/,/g, ""));
    if (!streams) continue;
    for (const key of [norm(match[1]), looseTitle(match[1])]) {
      if (!key) continue;
      if (!songs[key] || streams > songs[key]) songs[key] = streams;
    }
  }
  return songs;
}

async function songsFor(id: string) {
  const cached = songCache.get(id);
  if (cached && Date.now() - cached.at < DAY) return cached.songs;
  const res = await fetch(`https://kworb.net/spotify/artist/${id}_songs.html`, {
    headers: { "user-agent": "GarrettKpopDatabase/1.0" },
  });
  if (!res.ok) return cached?.songs ?? {};
  const songs = readSongs(await res.text());
  if (Object.keys(songs).length > 0) songCache.set(id, { at: Date.now(), songs });
  return songs;
}

async function spotifyIdFromKpopping(name: string) {
  const clean = name.trim();
  const slugs = [...new Set([clean, clean.replace(/\s+/g, "-"), clean.replace(/\s+/g, "")])];
  for (const slug of slugs) {
    const res = await fetch(`https://r.jina.ai/https://kpopping.com/profiles/group/${encodeURIComponent(slug)}`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/plain" },
    });
    if (!res.ok) continue;
    const text = await res.text();
    const id = text.match(/open\.spotify\.com\/artist\/([A-Za-z0-9]+)/)?.[1];
    if (id) return id;
  }
  return null;
}

export async function fetchSpotifyStreams(artistName: string) {
  const artists = await artistIndex();
  const artist = findArtist(artists, artistName);
  const id =
    artist?.id ??
    (await spotifyIdFromMusicBrainz(artistName)) ??
    (await spotifyIdFromWiki(artistName)) ??
    (await spotifyIdFromKpopping(artistName));
  if (!id) return { songs: {} as Record<string, number> };
  return { songs: await songsFor(id) };
}