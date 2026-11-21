import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSpotifyStreams } from "../lib/counts.server";

export const Route = createFileRoute("/")({ component: Home });

type Song = {
  id: number;
  title: string;
  artist: string;
  album: string;
  releaseDate: string;
  rating: number;
  notes: string;
  coverUrl?: string;
  videoId?: string;
  spotifyStreams?: number;
  spotifyAt?: number;
  youtubeViews?: number;
  youtubeAt?: number;
};

type View =
  | "songs"
  | "top-songs"
  | "top-artists"
  | "top-albums"
  | "all-artists"
  | "all-albums";

const STORAGE_KEY = "favoriteSongs";
const YOUTUBE_KEY = "AIzaSyDHKgMCN9N1tuTX42EwAzx2phuS4hisW9k";
const COUNT_STALE = 12 * 60 * 60 * 1000;

const MENUS = [
  {
    id: "rankings",
    label: "Rankings",
    items: [
      { view: "top-songs" as View, label: "Top Songs" },
      { view: "top-artists" as View, label: "Top Artists" },
      { view: "top-albums" as View, label: "Top Albums" },
    ],
  },
  {
    id: "directory",
    label: "Directory",
    items: [
      { view: "songs" as View, label: "All Songs" },
      { view: "all-artists" as View, label: "All Artists" },
      { view: "all-albums" as View, label: "All Albums" },
    ],
  },
];

function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Song & { year?: string; genre?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album ?? "",
      releaseDate: song.releaseDate || song.year || "",
      rating: song.rating ?? 5,
      notes: song.notes ?? "",
      coverUrl: song.coverUrl,
      videoId: song.videoId,
      spotifyStreams: song.spotifyStreams,
      spotifyAt: song.spotifyAt,
      youtubeViews: song.youtubeViews,
      youtubeAt: song.youtubeAt,
    }));
  } catch {
    return [];
  }
}

function Stars({ rating, className }: { rating: number; className?: string }) {
  const n = Math.max(0, Math.min(5, Math.round((rating || 0) * 2) / 2));
  const count = Math.ceil(n);
  return (
    <span className={className ? `star-row ${className}` : "star-row"} aria-label={`${n} out of 5`}>
      {Array.from({ length: count }, (_, i) => {
        const fill = Math.max(0, Math.min(1, n - i));
        return (
          <span key={i} className="star" aria-hidden="true">
            {fill < 1 ? <span className="star-empty">★</span> : null}
            <span className={fill < 1 ? "star-fill" : "star-fill is-full"} style={{ width: `${fill * 100}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

type TrackInfo = {
  album: string;
  releaseDate: string;
  coverUrl?: string;
};

async function fetchTrack(title: string, artist: string, album = ""): Promise<TrackInfo | null> {
  const queries = [`${title} ${artist}`, album ? `${album} ${artist}` : "", title].filter(Boolean);
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
        }[];
      };
      const results = data.results ?? [];
      const titleKey = title.toLowerCase();
      const artistKey = artist.toLowerCase();
      const match =
        results.find(
          (item) =>
            item.trackName?.toLowerCase().includes(titleKey) &&
            (artistKey.length < 2 || item.artistName?.toLowerCase().includes(artistKey.slice(0, 3))),
        ) ??
        results.find((item) => item.trackName?.toLowerCase().includes(titleKey)) ??
        results[0];
      if (!match) continue;
      return {
        album: match.collectionName ?? album,
        releaseDate: match.releaseDate?.slice(0, 10) ?? "",
        coverUrl: match.artworkUrl100?.replace("100x100bb", "300x300bb"),
      };
    } catch {
      // try the next query
    }
  }
  return null;
}

async function fetchVideo(title: string, artist: string): Promise<string | null> {
  const query = `${title} ${artist} official music video`;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=6&q=${encodeURIComponent(query)}&key=${YOUTUBE_KEY}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[];
    };
    const items = data.items ?? [];
    const titleKey = title.toLowerCase();
    const artistKey = artist.toLowerCase().slice(0, 3);
    const scored = items
      .map((item) => {
        const name = item.snippet?.title?.toLowerCase() ?? "";
        const channel = item.snippet?.channelTitle?.toLowerCase() ?? "";
        let score = 0;
        if (name.includes(titleKey)) score += 3;
        if (artistKey && (name.includes(artistKey) || channel.includes(artistKey))) score += 2;
        if (/official|music video|\bmv\b|m\/v/.test(name)) score += 4;
        if (/live|dance practice|karaoke|audio only|lyric|cover|reaction/.test(name)) score -= 5;
        return { id: item.id?.videoId, score };
      })
      .filter((item) => item.id && item.score >= 4)
      .sort((a, b) => b.score - a.score);
    return scored[0]?.id ?? null;
  } catch {
    return null;
  }
}

function formatCount(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [view, setView] = useState<View>("top-songs");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const coverTried = useRef(new Set<number>());
  const countsTried = useRef(new Set<string>());

  useEffect(() => {
    setSongs(loadSongs());
  }, []);

  useEffect(() => {
    const missing = songs.filter(
      (song) =>
        (!song.coverUrl || !song.album || !song.releaseDate || !song.videoId) &&
        !coverTried.current.has(song.id),
    );
    if (missing.length === 0) return;
    missing.forEach((song) => coverTried.current.add(song.id));
    let cancelled = false;
    (async () => {
      const found = new Map<number, Partial<Song>>();
      for (const song of missing) {
        const [track, videoId] = await Promise.all([
          !song.coverUrl || !song.album || !song.releaseDate
            ? fetchTrack(song.title, song.artist, song.album)
            : Promise.resolve(null),
          !song.videoId ? fetchVideo(song.title, song.artist) : Promise.resolve(null),
        ]);
        const patch: Partial<Song> = {};
        if (track?.coverUrl && !song.coverUrl) patch.coverUrl = track.coverUrl;
        if (track?.album && !song.album) patch.album = track.album;
        if (track?.releaseDate && !song.releaseDate) patch.releaseDate = track.releaseDate;
        if (videoId && !song.videoId) patch.videoId = videoId;
        if (Object.keys(patch).length > 0) found.set(song.id, patch);
      }
      if (cancelled || found.size === 0) return;
      setSongs((prev) => {
        const next = prev.map((song) => (found.has(song.id) ? { ...song, ...found.get(song.id) } : song));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [songs]);

  useEffect(() => {
    const now = Date.now();
    const staleYouTube = songs.filter(
      (song) => song.videoId && (!song.youtubeAt || now - song.youtubeAt > COUNT_STALE),
    );
    const staleArtists = [
      ...new Set(
        songs
          .filter((song) => !song.spotifyAt || now - song.spotifyAt > COUNT_STALE)
          .map((song) => song.artist),
      ),
    ].filter((artist) => !countsTried.current.has(artist));
    if (staleYouTube.length === 0 && staleArtists.length === 0) return;
    staleArtists.forEach((artist) => countsTried.current.add(artist));
    let cancelled = false;
    (async () => {
      const youtube = new Map<string, number>();
      if (staleYouTube.length > 0) {
        const ids = [...new Set(staleYouTube.map((song) => song.videoId).filter(Boolean))].slice(0, 50);
        try {
          const res = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(",")}&key=${YOUTUBE_KEY}`,
          );
          if (res.ok) {
            const data = (await res.json()) as {
              items?: { id?: string; statistics?: { viewCount?: string } }[];
            };
            for (const item of data.items ?? []) {
              if (item.id && item.statistics?.viewCount) youtube.set(item.id, Number(item.statistics.viewCount));
            }
          }
        } catch {
          // keep the last cached count
        }
      }
      const spotify = new Map<string, Record<string, number>>();
      for (const artist of staleArtists) {
        try {
          const result = await getSpotifyStreams({ data: { artist } });
          spotify.set(artist, result.songs);
        } catch {
          spotify.set(artist, {});
        }
      }
      if (cancelled) return;
      setSongs((prev) => {
        const next = prev.map((song) => {
          const patch: Partial<Song> = {};
          if (song.videoId && youtube.has(song.videoId)) {
            patch.youtubeViews = youtube.get(song.videoId);
            patch.youtubeAt = now;
          } else if (song.videoId && staleYouTube.some((item) => item.id === song.id)) {
            patch.youtubeAt = now;
          }
          if (spotify.has(song.artist)) {
            const key = song.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            const streams = spotify.get(song.artist)?.[key];
            if (streams) patch.spotifyStreams = streams;
            patch.spotifyAt = now;
          }
          return Object.keys(patch).length ? { ...song, ...patch } : song;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [songs]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function persist(next: Song[]) {
    setSongs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function open(id: string) {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpenMenu(id);
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 280);
  }

  const q = query.trim().toLowerCase();

  const filteredSongs = useMemo(() => {
    return songs.filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q),
    );
  }, [songs, q]);

  const artistRows = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const song of songs) {
      const key = song.artist || "Unknown";
      if (q && !key.toLowerCase().includes(q) && !song.title.toLowerCase().includes(q)) continue;
      const bucket = map.get(key) ?? [];
      bucket.push(song);
      map.set(key, bucket);
    }
    const rows = [...map.entries()].map(([name, items]) => ({
      name,
      count: items.length,
      rating: items.reduce((sum, s) => sum + s.rating, 0) / items.length,
      items,
    }));
    if (view === "top-artists") {
      rows.sort((a, b) => b.rating - a.rating || b.count - a.count);
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [songs, q, view]);

  const albumRows = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const song of songs) {
      const key = song.album || "Single";
      if (q && !key.toLowerCase().includes(q) && !song.title.toLowerCase().includes(q)) continue;
      const bucket = map.get(key) ?? [];
      bucket.push(song);
      map.set(key, bucket);
    }
    const rows = [...map.entries()].map(([name, items]) => ({
      name,
      count: items.length,
      rating: items.reduce((sum, s) => sum + s.rating, 0) / items.length,
      artist: items[0]?.artist ?? "",
      items,
    }));
    if (view === "top-albums") {
      rows.sort((a, b) => b.rating - a.rating || b.count - a.count);
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [songs, q, view]);

  const showingSongs = view === "songs" || view === "top-songs";
  const showingArtists = view === "top-artists" || view === "all-artists";
  const selected = songs.find((s) => s.id === selectedId) ?? null;
  const heading =
    view === "top-songs" || view === "songs"
      ? "TOP SONGS"
      : (MENUS.flatMap((m) => m.items).find((item) => item.view === view)?.label ?? "TOP SONGS");

  function chooseView(next: View) {
    setView(next);
    setSelectedId(null);
    setGroupName(null);
    setOpenMenu(null);
    setEditing(false);
  }

  function removeSong(id: number) {
    persist(songs.filter((s) => s.id !== id));
    setSelectedId(null);
  }

  function saveSong(updated: Song, position: number) {
    const previous = songs.find((song) => song.id === updated.id);
    const changedLookup =
      !previous ||
      previous.title !== updated.title ||
      previous.artist !== updated.artist ||
      previous.album !== updated.album;
    const nextSong = changedLookup
      ? { ...updated, coverUrl: undefined, album: "", releaseDate: "", videoId: undefined }
      : updated;
    if (changedLookup) coverTried.current.delete(updated.id);
    const rest = songs.filter((song) => song.id !== updated.id);
    const index = Math.max(0, Math.min(position - 1, rest.length));
    rest.splice(index, 0, nextSong);
    persist(rest);
    setEditing(false);
  }

  return (
    <div className="app-shell">
      <header className="nav">
        <div className="brand">
          <img className="avatar" src="/avatar.png" alt="Garrett Jahnke" />
          <div>
            <div className="brand-name">Garrett Jahnke</div>
            <div className="brand-sub">My KPOP Database</div>
          </div>
        </div>
        <nav className="nav-links" aria-label="Library">
          {MENUS.map((menu) => (
            <div
              key={menu.id}
              className={openMenu === menu.id ? "menu is-open" : "menu"}
              onMouseEnter={() => open(menu.id)}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                className="menu-trigger"
                aria-expanded={openMenu === menu.id}
                aria-haspopup="true"
                onFocus={() => open(menu.id)}
              >
                {menu.label}
              </button>
              {openMenu === menu.id ? (
                <div
                  className="menu-panel"
                  role="menu"
                  onMouseEnter={() => open(menu.id)}
                  onMouseLeave={scheduleClose}
                >
                  <div className="menu-card">
                    {menu.items.map((item) => (
                      <button
                        key={item.view}
                        type="button"
                        role="menuitem"
                        className={view === item.view ? "is-active" : undefined}
                        onClick={() => chooseView(item.view)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </header>
      <div className="edge edge-h" aria-hidden="true">
        <div className="edge-fill" />
        <div className="edge-stroke" />
      </div>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>{heading}</h2>
            <button type="button" className="add-btn" onClick={() => setAdding(true)}>
              + Add
            </button>
          </div>
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            aria-label="Search"
          />
          {showingSongs ? (
            filteredSongs.length === 0 ? (
              <p className="empty">
                No favorite songs yet.
                <br />
                Click <strong>+ Add</strong> to get started.
              </p>
            ) : (
              <div className="list">
                {filteredSongs.map((song, index) => (
                  <div
                    key={song.id}
                    className={song.id === selectedId ? "row is-selected" : "row"}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(song.id);
                      setGroupName(null);
                      setEditing(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(song.id);
                        setGroupName(null);
                      }
                    }}
                  >
                    <span className="rank">#{index + 1}</span>
                    <span className="cover-frame">
                      {song.coverUrl ? (
                        <img className="cover" src={song.coverUrl} alt="" />
                      ) : (
                        <span className="cover cover-fallback" aria-hidden="true">
                          {song.title.slice(0, 1)}
                        </span>
                      )}
                    </span>
                    <div className="row-copy">
                      <div className="row-title">{song.title}</div>
                      <div className="row-sub">{song.artist}</div>
                    </div>
                    <div className="row-rating">
                      <span className="row-sub">RATING</span>
                      <Stars rating={song.rating} className="row-stars" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : null}

          {showingArtists ? (
            artistRows.length === 0 ? (
              <p className="empty">No artists yet.</p>
            ) : (
              <div className="list">
                {artistRows.map((row) => (
                  <button
                    key={row.name}
                    type="button"
                    className={groupName === row.name ? "row is-selected" : "row"}
                    onClick={() => {
                      setGroupName(row.name);
                      setSelectedId(null);
                    }}
                  >
                    <div className="row-title">{row.name}</div>
                    <div className="row-sub">
                      {row.count} song{row.count === 1 ? "" : "s"} · <Stars rating={row.rating} />
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : null}

          {!showingSongs && !showingArtists ? (
            albumRows.length === 0 ? (
              <p className="empty">No albums yet.</p>
            ) : (
              <div className="list">
                {albumRows.map((row) => (
                  <button
                    key={row.name}
                    type="button"
                    className={groupName === row.name ? "row is-selected" : "row"}
                    onClick={() => {
                      setGroupName(row.name);
                      setSelectedId(null);
                    }}
                  >
                    <div className="row-title">{row.name}</div>
                    <div className="row-sub">
                      {row.artist} · {row.count} song{row.count === 1 ? "" : "s"}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : null}
          <div className="edge edge-v" aria-hidden="true">
            <div className="edge-fill" />
            <div className="edge-stroke" />
          </div>
        </aside>

        <main className="main">
          {selected ? (
            editing ? (
              <SongForm
                song={selected}
                position={songs.findIndex((song) => song.id === selected.id) + 1}
                total={songs.length}
                onCancel={() => setEditing(false)}
                onDelete={() => {
                  removeSong(selected.id);
                  setEditing(false);
                }}
                onSave={saveSong}
              />
            ) : (
            <article className="detail">
              <div className="detail-hero">
                {selected.coverUrl ? <img className="detail-cover" src={selected.coverUrl} alt="" /> : null}
                <div className="detail-copy">
                  <div className="detail-kicker">#{songs.findIndex((song) => song.id === selected.id) + 1}</div>
                  <h1>{selected.title}</h1>
                  <p className="byline">{selected.artist}</p>
                  <Stars rating={selected.rating} className="detail-stars" />
                </div>
                <button type="button" className="edit-btn" onClick={() => setEditing(true)}>
                  Edit
                </button>
              </div>
              <div className="grid">
                {selected.album ? (
                  <div className="card">
                    <span>Album</span>
                    {selected.album}
                  </div>
                ) : null}
                {selected.releaseDate ? (
                  <div className="card">
                    <span>Release date</span>
                    {formatDate(selected.releaseDate)}
                  </div>
                ) : null}
              </div>
              <div className="counts">
                {selected.spotifyStreams ? (
                  <div className="count">
                    <span>Spotify</span>
                    <strong>{formatCount(selected.spotifyStreams)}</strong>
                  </div>
                ) : null}
                {selected.videoId && selected.youtubeViews ? (
                  <div className="count">
                    <span>YouTube</span>
                    <strong>{formatCount(selected.youtubeViews)}</strong>
                  </div>
                ) : null}
              </div>
              {selected.videoId ? (
                <div className="video">
                  <iframe
                    src={`https://www.youtube.com/embed/${selected.videoId}`}
                    title={`${selected.title} music video`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : null}
              <section className="thoughts">
                <div className="thoughts-head">
                  <img className="thoughts-avatar" src="/avatar.png" alt="Garrett Jahnke" />
                  <span className="bulb" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                      <path
                        fill="currentColor"
                        d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zm2.2 11.2-.2.1V15h-4v-1.7l-.2-.1A5 5 0 1 1 14.2 13.2z"
                      />
                    </svg>
                  </span>
                  <span>My Thoughts</span>
                </div>
                <div className="thoughts-box">
                  {selected.notes || "Nothing here yet. Add it from Edit."}
                </div>
              </section>
            </article>
            )
          ) : groupName && showingArtists ? (
            <GroupDetail
              title={groupName}
              subtitle="Artist"
              songs={artistRows.find((r) => r.name === groupName)?.items ?? []}
              onOpen={(id) => setSelectedId(id)}
            />
          ) : groupName ? (
            <GroupDetail
              title={groupName}
              subtitle="Album"
              songs={albumRows.find((r) => r.name === groupName)?.items ?? []}
              onOpen={(id) => setSelectedId(id)}
            />
          ) : (
            <div className="placeholder">Select something from the list to view details</div>
          )}
        </main>
      </div>

      {adding ? (
        <AddModal
          nextPosition={songs.length + 1}
          onClose={() => setAdding(false)}
          onSave={(song, position) => {
            const next = [...songs];
            const index = Math.max(0, Math.min(position - 1, next.length));
            next.splice(index, 0, song);
            persist(next);
            setView("top-songs");
            setSelectedId(song.id);
            setGroupName(null);
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}

function GroupDetail({
  title,
  subtitle,
  songs,
  onOpen,
}: {
  title: string;
  subtitle: string;
  songs: Song[];
  onOpen: (id: number) => void;
}) {
  return (
    <article className="detail">
      <div className="detail-kicker">{subtitle}</div>
      <h1>{title}</h1>
      <p className="byline">{songs.length} song{songs.length === 1 ? "" : "s"}</p>
      <div className="song-links">
        {songs.map((song) => (
          <button key={song.id} type="button" onClick={() => onOpen(song.id)}>
            {song.coverUrl ? <img className="link-cover" src={song.coverUrl} alt="" /> : null}
            <div>
              <div className="row-title">{song.title}</div>
              <div className="row-sub">
                {song.artist}
                {song.album ? ` · ${song.album}` : ""}
              </div>
            </div>
            <Stars rating={song.rating} />
          </button>
        ))}
      </div>
    </article>
  );
}

function SongForm({
  song,
  position,
  total,
  onCancel,
  onDelete,
  onSave,
}: {
  song: Song;
  position: number;
  total: number;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (song: Song, position: number) => void;
}) {
  function submit(form: FormData) {
    const title = String(form.get("title") ?? "").trim();
    const artist = String(form.get("artist") ?? "").trim();
    if (!title || !artist) return;
    const nextPosition = Number(form.get("position") ?? position);
    onSave(
      {
        ...song,
        title,
        artist,
        album: String(form.get("album") ?? "").trim(),
        releaseDate: String(form.get("releaseDate") ?? "").trim(),
        rating: Number(form.get("rating") ?? song.rating),
        notes: String(form.get("notes") ?? "").trim(),
      },
      Number.isFinite(nextPosition) ? nextPosition : position,
    );
  }

  return (
    <form
      className="detail edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget));
      }}
    >
      <h1>Edit {song.title}</h1>
      <div className="field">
        <label htmlFor="edit-title">Title</label>
        <input id="edit-title" name="title" defaultValue={song.title} required />
      </div>
      <div className="field">
        <label htmlFor="edit-artist">Artist</label>
        <input id="edit-artist" name="artist" defaultValue={song.artist} required />
      </div>
      <div className="field">
        <label htmlFor="edit-album">Album</label>
        <input id="edit-album" name="album" defaultValue={song.album} />
      </div>
      <div className="field">
        <label htmlFor="edit-release">Release date</label>
        <input id="edit-release" name="releaseDate" type="date" defaultValue={song.releaseDate} />
      </div>
      <div className="field">
        <label htmlFor="edit-rating">Rating</label>
        <select id="edit-rating" name="rating" defaultValue={String(song.rating)}>
          <option value="5">★★★★★ (5)</option>
          <option value="4.5">★★★★½ (4.5)</option>
          <option value="4">★★★★☆ (4)</option>
          <option value="3.5">★★★½☆ (3.5)</option>
          <option value="3">★★★☆☆ (3)</option>
          <option value="2.5">★★½☆☆ (2.5)</option>
          <option value="2">★★☆☆☆ (2)</option>
          <option value="1.5">★½☆☆☆ (1.5)</option>
          <option value="1">★☆☆☆☆ (1)</option>
          <option value="0.5">½☆☆☆☆ (0.5)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="edit-notes">My Thoughts</label>
        <textarea id="edit-notes" name="notes" defaultValue={song.notes} />
      </div>
      <div className="field">
        <label htmlFor="edit-position">Position on the list</label>
        <input
          id="edit-position"
          name="position"
          type="number"
          min={1}
          max={total}
          defaultValue={position}
          required
        />
      </div>
      <div className="actions">
        <button className="primary" type="submit">
          Save
        </button>
        <button className="ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="danger" type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </form>
  );
}

function AddModal({
  onClose,
  onSave,
  nextPosition,
}: {
  onClose: () => void;
  onSave: (song: Song, position: number) => void;
  nextPosition: number;
}) {
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    const title = String(form.get("title") ?? "").trim();
    const artist = String(form.get("artist") ?? "").trim();
    if (!title || !artist) return;
    setBusy(true);
    const [track, videoId] = await Promise.all([fetchTrack(title, artist), fetchVideo(title, artist)]);
    const position = Number(form.get("position") ?? nextPosition);
    onSave(
      {
        id: Date.now(),
        title,
        artist,
        album: track?.album ?? "",
        releaseDate: track?.releaseDate ?? "",
        rating: Number(form.get("rating") ?? 5),
        notes: String(form.get("notes") ?? "").trim(),
        coverUrl: track?.coverUrl,
        videoId: videoId ?? undefined,
      },
      Number.isFinite(position) ? position : nextPosition,
    );
  }

  return (
    <div className="modal" role="presentation" onClick={onClose}>
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit(new FormData(e.currentTarget));
        }}
      >
        <h2>Add a Song</h2>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required />
        </div>
        <div className="field">
          <label htmlFor="artist">Artist</label>
          <input id="artist" name="artist" required />
        </div>
        <div className="field">
          <label htmlFor="rating">Rating</label>
          <select id="rating" name="rating" defaultValue="5">
            <option value="5">★★★★★ (5)</option>
            <option value="4.5">★★★★½ (4.5)</option>
            <option value="4">★★★★☆ (4)</option>
            <option value="3.5">★★★½☆ (3.5)</option>
            <option value="3">★★★☆☆ (3)</option>
            <option value="2.5">★★½☆☆ (2.5)</option>
            <option value="2">★★☆☆☆ (2)</option>
            <option value="1.5">★½☆☆☆ (1.5)</option>
            <option value="1">★☆☆☆☆ (1)</option>
            <option value="0.5">½☆☆☆☆ (0.5)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" placeholder="Why do you love this song?" />
        </div>
        <div className="field">
          <label htmlFor="position">List placement</label>
          <input id="position" name="position" type="number" min={1} defaultValue={nextPosition} required />
        </div>
        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Looking up..." : "Add Song"}
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
