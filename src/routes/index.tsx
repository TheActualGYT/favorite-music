import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { getSpotifyStreams } from "../lib/spotify";
import { getLyrics, englishFromSource } from "../lib/lyrics";
import { getCompany } from "../lib/company";
import { getGroup, getIdolPhoto } from "../lib/group";

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
  coverManual?: boolean;
  videoId?: string;
  videoUrl?: string;
  clipStart?: number;
  clipUrl?: string;
  company?: string;
  subLabel?: string;
  lyrics?: string;
  geniusUrl?: string;
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
      coverManual: song.coverManual,
      videoId: song.videoId,
      videoUrl: song.videoUrl,
      clipStart: song.clipStart,
      clipUrl: song.clipUrl,
      company: isPersonCompany(song.company) ? undefined : song.company?.replace(/\s*\([^)]*\)/g, "").trim() || undefined,
      subLabel: undefined,
      lyrics: song.lyrics && /"v":11/.test(song.lyrics) ? song.lyrics : undefined,
      geniusUrl: song.geniusUrl,
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
      const plain = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
      const titleKey = plain(title);
      const artistKey = plain(artist);
      const hits = results.filter((item) => {
        const track = plain(item.trackName || "");
        const by = plain(item.artistName || "");
        const titleOk = track === titleKey || track.startsWith(titleKey);
        const artistOk = artistKey.length > 1 && (by.includes(artistKey) || artistKey.includes(by));
        return titleOk && artistOk;
      });
      const match =
        hits.find((item) => plain(item.trackName || "") === titleKey && !/english ver/i.test(item.trackName || "")) ??
        hits[0];
      if (!match) continue;
      return {
        album: (match.collectionName ?? album).replace(/\s*[-–]\s*single$/i, "").trim(),
        releaseDate: match.releaseDate?.slice(0, 10) ?? "",
        coverUrl: match.artworkUrl100?.replace("100x100bb", "600x600bb"),
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
  if (value >= 1_000_000_000) return { n: (value / 1_000_000_000).toFixed(2), unit: "B" };
  if (value >= 1_000_000) return { n: (value / 1_000_000).toFixed(1), unit: "M" };
  if (value >= 1_000) return { n: (value / 1_000).toFixed(1), unit: "K" };
  return { n: String(value), unit: "" };
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

const PEOPLE = /j\.?\s*y\.?\s*park|bang si[- ]hyuk|lee soo[- ]man|park jin[- ]young|yang hyun[- ]suk/;

function isPersonCompany(value?: string) {
  return Boolean(value && PEOPLE.test(value));
}

function knownLabel(artist: string, title?: string) {
  const name = artist.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const song = (title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (name === "nmixx" || name === "엔믹스" || (song === "runforroses" && /nmixx|enix|엔믹스/i.test(artist))) {
    return { company: "JYP Entertainment" };
  }
  if (name === "kissoflife" || name === "키스오브라이프") return { company: "S2 Entertainment" };
  if (name === "ateez" || name === "에이티즈") return { company: "KQ Entertainment" };
  return null;
}

async function lookupCompany(artist: string, title?: string) {
  const known = knownLabel(artist, title);
  if (known) return known;
  try {
    return await getCompany({ data: { artist, title } });
  } catch {
    return null;
  }
}

function CountValue({ value }: { value?: number }) {
  if (!value) return <>—</>;
  const count = formatCount(value);
  return (
    <>
      {count.n}
      {count.unit ? <small> {count.unit}</small> : null}
    </>
  );
}

function albumInfo(name?: string) {
  const raw = name ?? "";
  const cleaned = raw
    .replace(/\s*[-–—]\s*(single|eps?)\s*$/i, "")
    .replace(/\s*\((single|eps?)\)\s*$/i, "")
    .trim();
  return { name: cleaned || raw };
}

function spotifySearch(query: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

function SpotifyMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1DB954" />
      <path
        fill="#121212"
        d="M17.2 16.3a.7.7 0 0 1-1 .2c-2.6-1.6-5.9-2-9.8-1.1a.7.7 0 0 1-.3-1.4c4.2-1 7.9-.5 10.9 1.3a.7.7 0 0 1 .2 1zm1.2-2.7a.9.9 0 0 1-1.2.3c-3-1.8-7.6-2.4-11.1-1.3a.9.9 0 1 1-.5-1.7c4.1-1.2 9.1-.6 12.5 1.5a.9.9 0 0 1 .3 1.2zm.1-2.8C15.2 8.7 9.3 8.5 6.3 9.4a1 1 0 1 1-.6-2c3.4-1 10-1.2 13.9.7a1 1 0 0 1-1.1 1.7z"
      />
    </svg>
  );
}

function YouTubeMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="17" y="3.5" rx="4" fill="#FF0033" />
      <path fill="#fff" d="M10 8.4v7.2l6.2-3.6z" />
    </svg>
  );
}

const MEMBER_COLORS: Record<string, string> = {
  bangchan: "#ff3b30",
  leeknow: "#ff8a1e",
  changbin: "#f5d000",
  hyunjin: "#3dcc6a",
  han: "#00ffff",
  felix: "#3aa8e6",
  seungmin: "#a855f7",
  in: "#ff4d9a",
};

function memberColor(artist: string, name: string, fallback: string) {
  const custom = loadColors()[cropId(artist, name)] || loadColors()[cropId(artist, name.replace(/[,:;]+$/g, ""))];
  if (custom) return custom;
  return MEMBER_COLORS[name.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? fallback;
}

const CROP_KEY = "gyt-lyric-crops";
const PROFILE_CROP_KEY = "gyt-profile-crops";

type Crop = { x: number; y: number; zoom: number; photo?: string };

function cropId(artist: string, name: string) {
  return `${artist.toLowerCase().replace(/[^a-z0-9]/g, "")}:${name.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

const COLOR_KEY = "gyt-member-colors";
const IDOL_PHOTO_KEY = "gyt-idol-photos";

function loadColors() {
  try {
    return JSON.parse(localStorage.getItem(COLOR_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveColor(artist: string, name: string, color: string) {
  const all = loadColors();
  all[cropId(artist, name)] = color;
  localStorage.setItem(COLOR_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("gyt-roster"));
  return all;
}

function loadIdolPhotos() {
  try {
    return JSON.parse(localStorage.getItem(IDOL_PHOTO_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function loadStore(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as Record<string, Crop>;
  } catch {
    return {};
  }
}

function nameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function profileShot(artist: string, name: string) {
  const wanted = nameKey(name);
  const artistKey = nameKey(artist);
  const preset = GROUP_PROFILES[artistKey]?.find((member) => {
    const key = nameKey(member.name);
    return key === wanted || (wanted.length >= 3 && (key.includes(wanted) || wanted.includes(key)));
  });
  let photo = preset?.photo || "";
  let matched = preset?.name || name;
  if (!photo) {
    try {
      const roster = JSON.parse(localStorage.getItem("gyt-group-roster") || "{}") as Record<string, { name: string; photo?: string }[]>;
      const member = (roster[artistKey] ?? []).find((item) => {
        const key = nameKey(item.name);
        return key === wanted || (wanted.length >= 3 && (key.includes(wanted) || wanted.includes(key)));
      });
      if (member?.photo) {
        photo = member.photo;
        matched = member.name;
      }
    } catch {
      photo = "";
    }
  }
  if (!photo) return null;
  const crop = loadStore(PROFILE_CROP_KEY)[cropId(artist, matched)] ?? loadStore(PROFILE_CROP_KEY)[cropId(artist, name)];
  return { photo: crop?.photo || photo, x: crop?.x ?? 50, y: crop?.y ?? 50, zoom: crop?.zoom ?? 1 };
}

function saveStore(key: string, artist: string, name: string, crop: Crop) {
  const all = loadStore(key);
  all[cropId(artist, name)] = crop;
  try {
    localStorage.setItem(key, JSON.stringify(all));
  } catch {
    /* a large photo can miss the storage limit; keep the edit in memory */
  }
  return all;
}

function cleanLyric(value?: string) {
  if (!value) return "";
  let text = value.replace(/<[^>]+>/g, "");
  for (let pass = 0; pass < 2; pass += 1) {
    const next = text
      .replace(/&amp;/g, "&")
      .replace(/&#8216;|&#8217;|&#39;|&rsquo;|&lsquo;|&apos;/g, "'")
      .replace(/&#8220;|&#8221;|&quot;|&ldquo;|&rdquo;/g, '"')
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
    if (next === text) break;
    text = next;
  }
  return text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim();
}

const PHOTO_CACHE = new Map<string, string>();

function SoftPhoto({ src, className, style }: { src: string; className?: string; style?: CSSProperties }) {
  const [url, setUrl] = useState(() => PHOTO_CACHE.get(src) || src);
  useEffect(() => setUrl(PHOTO_CACHE.get(src) || src), [src]);
  return (
    <img
      className={className}
      src={url}
      alt=""
      style={style}
      decoding="async"
      loading="lazy"
      crossOrigin={url.startsWith("data:") ? undefined : "anonymous"}
      onLoad={(event) => {
        const img = event.currentTarget;
        if (PHOTO_CACHE.has(src) || !img.naturalWidth || img.naturalWidth <= 720 || url.startsWith("data:")) return;
        const shrink = () => {
          createImageBitmap(img, { resizeWidth: 480, resizeQuality: "low" })
            .then((bitmap) => {
              const canvas = document.createElement("canvas");
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const ctx = canvas.getContext("2d", { alpha: false });
              if (!ctx) {
                bitmap.close();
                return;
              }
              ctx.drawImage(bitmap, 0, 0);
              bitmap.close();
              const next = canvas.toDataURL("image/jpeg", 0.68);
              PHOTO_CACHE.set(src, next);
              if (PHOTO_CACHE.size > 40) {
                const oldest = PHOTO_CACHE.keys().next().value;
                if (oldest) PHOTO_CACHE.delete(oldest);
              }
              setUrl(next);
            })
            .catch(() => {});
        };
        window.setTimeout(shrink, 60);
      }}
    />
  );
}

function LyricsBlock({
  text,
  artist = "",
  onReset,
  onTranslated,
  onLoad,
}: {
  text?: string;
  artist?: string;
  onReset: () => void;
  onTranslated?: (lines: string[]) => void;
  onLoad: (url: string) => Promise<boolean>;
}) {
  const [english, setEnglish] = useState(false);
  const [crops, setCrops] = useState<Record<string, Crop>>({});
  const [englishLines, setEnglishLines] = useState<string[] | null>(null);
  const [idolPhotos, setIdolPhotos] = useState<Record<string, string>>({});
  const [rosterTick, setRosterTick] = useState(0);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  useEffect(() => setCrops(loadStore(CROP_KEY)), [text]);
  useEffect(() => setIdolPhotos(loadIdolPhotos()), [text]);
  useEffect(() => {
    const bump = () => setRosterTick((value) => value + 1);
    window.addEventListener("gyt-roster", bump);
    return () => window.removeEventListener("gyt-roster", bump);
  }, []);
  useEffect(() => {
    if (!text?.startsWith("{")) {
      setEnglishLines(null);
      return;
    }
    let parsed: { source?: string; lines?: { korean?: string; text?: string; english?: string }[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      setEnglishLines(null);
      return;
    }
    const lines = (parsed.lines ?? []).map((line) => line.korean || line.text || "");
    const ready = lines.map((line, index) => {
      const stored = parsed.lines?.[index]?.english;
      if (stored && stored !== line) return stored;
      return /[가-힣]/.test(line) ? "" : line;
    });
    if (ready.every(Boolean)) {
      setEnglishLines(ready);
      return;
    }
    if (!parsed.source) {
      setEnglishLines(null);
      return;
    }
    let dead = false;
    setEnglishLines(null);
    englishFromSource({ data: { source: parsed.source, lines } })
      .then((result) => {
        if (dead || result.length !== lines.length) return;
        setEnglishLines(result);
        if (result.some((line, index) => line !== lines[index])) onTranslated?.(result);
      })
      .catch(() => {
        if (!dead) setEnglishLines(null);
      });
    return () => {
      dead = true;
    };
  }, [text]);
  useEffect(() => {
    if (!text?.startsWith("{")) return;
    let members: { name: string; photo?: string }[] = [];
    try {
      members = JSON.parse(text).members ?? [];
    } catch {
      return;
    }
    const saved = loadIdolPhotos();
    const missing = members.filter((member) => !member.photo && !profileShot(artist, member.name) && !saved[nameKey(member.name)]);
    if (!missing.length) return;
    let dead = false;
    (async () => {
      const next = { ...saved };
      for (const member of missing.slice(0, 8)) {
        const photo = await getIdolPhoto({ data: { name: member.name.replace(/[,:;]+$/g, "") } });
        if (photo) next[nameKey(member.name)] = photo;
      }
      if (dead) return;
      localStorage.setItem(IDOL_PHOTO_KEY, JSON.stringify(next));
      setIdolPhotos(next);
    })();
    return () => {
      dead = true;
    };
  }, [text, artist]);
  const loadSource = async (event: FormEvent) => {
    event.preventDefault();
    const next = sourceUrl.trim();
    if (!next) return;
    setSourceBusy(true);
    setSourceError("");
    try {
      const ok = await onLoad(next);
      if (!ok) setSourceError("Couldn't read lyrics from that page. Paste the colorcodedlyrics.com song link.");
      else setSourceUrl("");
    } catch {
      setSourceError("Couldn't read lyrics from that page. Paste the colorcodedlyrics.com song link.");
    } finally {
      setSourceBusy(false);
    }
  };
  const sourceForm = (
    <form className="lyric-source" onSubmit={loadSource}>
      <p className="lyrics-note">
        Member colors come from <a href="https://colorcodedlyrics.com" target="_blank" rel="noreferrer">Color Coded Lyrics</a>.
        Paste that song’s page. A Genius link works too, but only if that site has the song.
      </p>
      <div className="lyric-source-row">
        <input
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="https://colorcodedlyrics.com/…"
          spellCheck={false}
        />
        <button type="submit" disabled={sourceBusy || !sourceUrl.trim()}>{sourceBusy ? "Loading…" : "Add lyrics"}</button>
      </div>
      {sourceError ? <p className="lyrics-note is-error">{sourceError}</p> : null}
    </form>
  );
  if (!text) {
    return (
      <>
        <div className="lyrics-head">Lyrics</div>
        {sourceForm}
      </>
    );
  }
  let parsed: {
    source?: string;
    lines?: { who: string; color: string; english?: string; korean?: string; text?: string }[];
    members?: { name: string; color: string; photo?: string; focus?: string; zoom?: number; lines: number; words?: number }[];
  } | null = null;
  if (text.startsWith("{")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (!parsed?.lines) return sourceForm;
  return (
    <>
      <div className="lyrics-top">
        <div className="lyrics-head">Lyrics</div>
        <label className="lang-switch">
          <span className={!english ? "is-on" : ""}>Korean</span>
          <button type="button" className={english ? "is-english" : ""} onClick={() => setEnglish((value) => !value)} aria-pressed={english}>
            <span />
          </button>
          <span className={english ? "is-on" : ""}>English</span>
        </label>
        <div className="lyrics-edit">
          <button type="button" className="lyrics-reset" tabIndex={0}>Edit</button>
          <div className="lyrics-edit-panel">
            <div className="lyrics-edit-card">
              <button type="button" onClick={onReset}>Reset</button>
              {parsed.source ? (
                <a href={parsed.source} target="_blank" rel="noreferrer">Check source</a>
              ) : null}
              <form className="lyrics-replace" onSubmit={loadSource}>
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="colorcodedlyrics.com link"
                  spellCheck={false}
                />
                <button type="submit" disabled={sourceBusy || !sourceUrl.trim()}>{sourceBusy ? "…" : "Use page"}</button>
              </form>
              {sourceError ? <p className="lyrics-note is-error">{sourceError}</p> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="lyrics-layout">
        <div className="lyrics-pane">
          <div className="lyrics-text">
            {parsed.lines.map((line, index) => {
              const color = memberColor(artist, line.who, line.color);
              const body = cleanLyric(english ? englishLines?.[index] || line.korean || line.text : line.korean || line.text);
              if (!body || /^['".,!?…-]+$/.test(body)) return null;
              return (
                <p key={index}>
                  <span className="lyric-who" style={{ color }}>[{line.who.replace(/[,:;]+$/g, "").trim()}]</span>
                  <span>{body}</span>
                </p>
              );
            })}
          </div>
        </div>
        <aside className="lyric-side">
          <div className="lyric-key">
            {(parsed.members ?? []).map((member) => {
              const shown = member.name.replace(/[,:;]+$/g, "").trim();
              const color = memberColor(artist, shown, member.color);
              const saved = crops[cropId(artist, member.name)] ?? crops[cropId(artist, shown)];
              const profile = saved?.photo ? null : profileShot(artist, shown);
              void rosterTick;
              const x = saved?.x ?? profile?.x ?? 50;
              const y = saved?.y ?? profile?.y ?? Number(String(member.focus || "center 20%").match(/\d+/)?.[0] ?? 20);
              const zoom = saved?.zoom ?? profile?.zoom ?? member.zoom ?? 1.2;
              const photo = saved?.photo || profile?.photo || idolPhotos[nameKey(shown)] || idolPhotos[nameKey(member.name)] || member.photo;
              const isBias = nameKey(loadBias()[nameKey(artist)] || "") === nameKey(shown);
              return (
                <div
                  key={member.name}
                  className={isBias ? "member-box is-bias" : "member-box"}
                  style={{ "--member": color } as CSSProperties}
                >
                  <span className="member-photo-wrap">
                    {photo ? <SoftPhoto className="member-photo" src={photo} style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})` }} /> : <span className="member-photo is-empty" />}
                  </span>
                  <div>
                    <div className="lyric-name-row">
                      <div className="lyric-key-name" style={{ color }}>{shown}</div>
                      {isBias ? <span className="bias-mini">★</span> : null}
                    </div>
                    <div className="lyric-key-time">{member.lines} lines · {member.words ?? 0} words</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </>
  );
}
type ProfileInfo = { name: string; born: string; role: string; country: string; flag: string; photo: string };

const FLAGS: Record<string, string> = {
  "south korea": "kr",
  korea: "kr",
  kr: "kr",
  japan: "jp",
  japanese: "jp",
  jp: "jp",
  "united states": "us",
  "united states of america": "us",
  usa: "us",
  "u.s.": "us",
  "u.s.a.": "us",
  us: "us",
  america: "us",
  australia: "au",
  au: "au",
  canada: "ca",
  china: "cn",
  taiwan: "tw",
  thailand: "th",
  "new zealand": "nz",
  "united kingdom": "gb",
  uk: "gb",
};

function flagSrc(country: string) {
  const code = FLAGS[country.toLowerCase().trim()] ?? "";
  return code ? `https://flagcdn.com/w40/${code}.png` : "";
}

const GROUP_PROFILES: Record<string, ProfileInfo[]> = {
  straykids: [
    { name: "Bang Chan", born: "Oct 3, 1997", role: "Leader", country: "South Korea", flag: "🇰🇷", photo: "https://cdn.kpopping.com/idols/Bang-Chan/_live/profile_1791233113318_d27eac37-dc77-420c-b2aa-04537c209517.jpg" },
    { name: "Lee Know", born: "Oct 25, 1998", role: "Main Dancer", country: "South Korea", flag: "🇰🇷", photo: "https://cdn.kpopping.com/idols/Lee-Know/_live/profile_1791249731252_17c7fb7a-81ea-4b7e-bd3e-5413348a9dd3.jpg" },
    { name: "Changbin", born: "Aug 11, 1999", role: "Main Rapper", country: "South Korea", flag: "🇰🇷", photo: "https://cdn.kpopping.com/idols/Changbin/_live/profile_1791225973094_f02d920b-86ee-438f-a238-d28a40938022.jpg" },
    { name: "Hyunjin", born: "Mar 20, 2000", role: "Main Dancer", country: "South Korea", flag: "🇰🇷", photo: "https://cdn.kpopping.com/idols/Hyunjin2/_live/profile_1791226037054_5ee33142-de1f-441c-bc47-7d9745b07383.jpg" },
    { name: "Han", born: "Sep 14, 2000", role: "Lead Rapper", country: "South Korea", flag: "🇰🇷", photo: "https://cdn.kpopping.com/idols/Han/_live/profile_1791249713584_3dbce807-aeac-4439-af3c-17347c9c57e9.jpg" },
    { name: "Felix", born: "Sep 15, 2000", role: "Main Dancer", country: "Australia", flag: "🇦🇺", photo: "https://cdn.kpopping.com/idols/Felix/_live/profile_1791226171229_f470d84e-55bb-4810-913b-d1ca3ae30ff0.jpg" },
    { name: "Seungmin", born: "Sep 22, 2000", role: "Main Vocalist", country: "South Korea", flag: "🇰🇷", photo: "https://cdn.kpopping.com/idols/Seungmin2/_live/profile_1791226230415_734bf368-b77d-4e1f-8c34-daa3af26237f.jpg" },
    { name: "I.N", born: "Feb 8, 2001", role: "Lead Vocalist", country: "South Korea", flag: "🇰🇷", photo: "https://cdn.kpopping.com/idols/in/_live/profile_1791226316821_52ca25cb-3127-45d2-a370-2653647bb188.jpg" },
  ],
};

const INFO_KEY = "gyt-profile-info";
const BIAS_KEY = "gyt-bias";

function loadBias() {
  try {
    return JSON.parse(localStorage.getItem(BIAS_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function loadInfo() {
  try {
    return JSON.parse(localStorage.getItem(INFO_KEY) || "{}") as Record<string, Partial<ProfileInfo>>;
  } catch {
    return {};
  }
}

function saveInfo(artist: string, key: string, info: Partial<ProfileInfo>) {
  const all = loadInfo();
  all[cropId(artist, key)] = { ...all[cropId(artist, key)], ...info };
  try {
    localStorage.setItem(INFO_KEY, JSON.stringify(all));
  } catch {
    /* keep the edit in memory if storage is full */
  }
  return all;
}

function ageFrom(born: string) {
  const date = new Date(born);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const before = now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
  if (before) age -= 1;
  return age;
}

const LYRIC_PHOTOS: Record<string, { url: string; focus: string; zoom: number }> = {
  bangchan: { url: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Bang_Chan_of_Stray_Kids%2C_October_15%2C_2025.png", focus: "center 24%", zoom: 1.18 },
  leeknow: { url: "https://kpopofficial.com/wp-content/uploads/2025/08/cover3-Stray-Kids-Lee-Know.webp", focus: "center 18%", zoom: 1.22 },
  changbin: { url: "https://upload.wikimedia.org/wikipedia/commons/d/d9/Changbin_of_Stray_Kids_at_the_40th_Golden_Disc_Awards%2C_January_10%2C_2026_%281%29.png", focus: "center 16%", zoom: 1.7 },
  hyunjin: { url: "https://newsimg.koreatimes.co.kr/2026/08/06/795d9ed6-e827-438c-afbe-62699581bce5.jpg?w=728", focus: "center 14%", zoom: 1.28 },
  han: { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQM3jiG9XPizWcLZ17tZlycSMkJI9FZSbev67H4At0F4zeRcncRscRyvRXf&s=10", focus: "center 28%", zoom: 1.35 },
  felix: { url: "https://images.prestigeonline.com/wp-content/uploads/sites/4/2024/08/02004502/stray-kids-felix-outfits-e1722401554467.jpg", focus: "38% 16%", zoom: 1.85 },
  seungmin: { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQfUOKzXw_lMDh_EDWMd4SOPAX3OasX3XXFVKwZw9lVf2QrewRQcLCABM0&s=10", focus: "center 28%", zoom: 1.35 },
  in: { url: "https://upload.wikimedia.org/wikipedia/commons/d/d2/I.N_of_Stray_Kids%2C_March_2%2C_2025.png", focus: "center 18%", zoom: 1.4 },
};

function lyricNorm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function lyricDecode(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&/g, "&")
    .replace(/&#8217;|&#39;|&rsquo;/g, "'")
    .replace(/"/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function proxyHtml(url: string) {
  const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error("proxy");
  return res.text();
}

function sliceLyrics(html: string, start: string, ends: string[]) {
  const at = html.indexOf(start);
  if (at < 0) return "";
  const stop = ends.map((end) => html.indexOf(end, at + start.length)).filter((index) => index > at);
  return html.slice(at, stop.length ? Math.min(...stop) : at + 30000);
}

function coloredLyricLines(section: string) {
  return [...section.matchAll(/<span style="color:\s*(#[0-9a-fA-F]{3,8});?">([\s\S]*?)<\/span>/gi)]
    .map((match) => ({ color: match[1].toLowerCase(), text: lyricDecode(match[2]) }))
    .filter((line) => line.text);
}

function plainLyricLines(section: string) {
  const lines: string[] = [];
  for (const block of section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    for (const part of block[1].split(/<br\s*\/?>/i)) {
      const text = lyricDecode(part);
      if (text) lines.push(text);
    }
  }
  return lines;
}

const ROSTER_KEY = "gyt-group-roster";

function loadRoster() {
  try {
    return JSON.parse(localStorage.getItem(ROSTER_KEY) || "{}") as Record<string, ProfileInfo[]>;
  } catch {
    return {};
  }
}

function GroupProfile({ artist }: { artist: string }) {
  const key = artist.toLowerCase().replace(/[^a-z0-9]/g, "");
  const preset = GROUP_PROFILES[key];
  const [roster, setRoster] = useState<ProfileInfo[] | null>(preset ?? null);
  const [crops, setCrops] = useState<Record<string, Crop>>({});
  const [info, setInfo] = useState<Record<string, Partial<ProfileInfo>>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [bias, setBias] = useState<string | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  useEffect(() => {
    setBias(loadBias()[key] || null);
    setColors(loadColors());
  }, [key]);
  useEffect(() => {
    if (key === "aespa" && localStorage.getItem("gyt-image-reset-v") !== "aespa-1") {
      const crops = loadStore(PROFILE_CROP_KEY);
      for (const id of Object.keys(crops)) {
        if (id.startsWith("aespa:")) delete crops[id];
      }
      localStorage.setItem(PROFILE_CROP_KEY, JSON.stringify(crops));
      const saved = loadRoster();
      delete saved.aespa;
      localStorage.setItem(ROSTER_KEY, JSON.stringify(saved));
      localStorage.setItem("gyt-image-reset-v", "aespa-1");
      window.dispatchEvent(new Event("gyt-roster"));
    }
    setCrops(loadStore(PROFILE_CROP_KEY));
    setInfo(loadInfo());
    if (preset) {
      setRoster(preset);
      return;
    }
    const cached = loadRoster()[key];
    if (cached?.length) {
      setRoster(cached);
      return;
    }
    let dead = false;
    getGroup({ data: { artist } })
      .then((page) => {
        if (dead || !page?.members?.length) return;
        const members = page.members.map((member) => ({
          name: member.name,
          born: member.born,
          role: member.role,
          country: member.country,
          flag: "",
          photo: member.photo,
        }));
        const saved = loadRoster();
        saved[key] = members;
        localStorage.setItem(ROSTER_KEY, JSON.stringify(saved));
        window.dispatchEvent(new Event("gyt-roster"));
        setRoster(members);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [artist, key, preset]);
  const base = roster;
  if (!base?.length) return null;
  const members = base
    .map((member) => ({ ...member, ...info[cropId(artist, member.name)], sourceName: member.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  const active = members.find((member) => member.sourceName === editing);
  const activeSaved = active ? crops[cropId(artist, active.sourceName)] : undefined;
  const activeX = activeSaved?.x ?? 50;
  const activeY = activeSaved?.y ?? 50;
  const activeZoom = activeSaved?.zoom ?? 1;
  const activePhoto = activeSaved?.photo || active?.photo || "";
  const updateActive = (next: Partial<Crop>) => {
    if (!editing) return;
    const all = saveStore(PROFILE_CROP_KEY, artist, editing, { x: activeX, y: activeY, zoom: activeZoom, photo: activePhoto, ...next });
    window.dispatchEvent(new Event("gyt-roster"));
    setCrops(all);
  };
  const updateInfo = (next: Partial<ProfileInfo>) => {
    if (!editing) return;
    setInfo(saveInfo(artist, editing, next));
  };
  const toggleBias = () => {
    if (!editing) return;
    const all = loadBias();
    const next = all[key] === editing ? "" : editing;
    if (next) all[key] = next;
    else delete all[key];
    localStorage.setItem(BIAS_KEY, JSON.stringify(all));
    setBias(next || null);
    window.dispatchEvent(new Event("gyt-roster"));
  };
  return (
    <section className="members">
      <div className="members-head">
        <span>{artist} — Members</span>
        <small>{members.length} members</small>
      </div>
      <div className="members-grid">
        {members.map((member) => {
          const saved = crops[cropId(artist, member.sourceName)];
          const photo = saved?.photo || member.photo;
          const x = saved?.x ?? 50;
          const y = saved?.y ?? 50;
          const zoom = saved?.zoom ?? 1;
          const isBias = bias === member.sourceName;
          return (
            <article key={member.sourceName} className={isBias ? "member-card is-bias" : "member-card"}>
              <div className="member-card-photo">
                {photo ? (
                  <SoftPhoto src={photo} style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})` }} />
                ) : (
                  <span className="member-photo is-empty" />
                )}
                <button type="button" className="member-edit" onClick={() => setEditing(member.sourceName)}>Edit</button>
              </div>
              <div className="member-card-body">
                <div className="member-name-row">
                  <strong>{member.name.toUpperCase()}</strong>
                  <span className="member-flag" title={member.country}>
                    {flagSrc(member.country) ? <img src={flagSrc(member.country)} alt={member.country} /> : member.country}
                  </span>
                </div>
                <span>{ageFrom(member.born)} ({member.born})</span>
                <div className="member-role-row">
                  <span className="member-roles">{member.role}</span>
                  {isBias ? <span className="bias-mark">BIAS <span aria-hidden="true">★</span></span> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {active && typeof document !== "undefined"
        ? createPortal(
            <div className="crop-modal" onClick={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
              <div className="crop-card" onClick={(event) => event.stopPropagation()}>
                <div className="crop-head">
                  <div className="crop-title">
                    <strong>{active.name}</strong>
                    <button
                      type="button"
                      className={bias === active.sourceName ? "bias-star is-on" : "bias-star"}
                      onClick={toggleBias}
                      aria-pressed={bias === active.sourceName}
                      aria-label={bias === active.sourceName ? "Remove bias" : "Set as bias"}
                    >
                      ★
                    </button>
                  </div>
                  <button type="button" onClick={() => setEditing(null)}>Close</button>
                </div>
                <div
                  className="circle-crop"
                  onPointerDown={(event) => {
                    drag.current = { x: activeX, y: activeY, startX: event.clientX, startY: event.clientY };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (!drag.current) return;
                    updateActive({
                      x: Math.max(0, Math.min(100, drag.current.x - (event.clientX - drag.current.startX) / 3)),
                      y: Math.max(0, Math.min(100, drag.current.y - (event.clientY - drag.current.startY) / 3)),
                    });
                  }}
                  onPointerUp={() => { drag.current = null; }}
                >
                  {activePhoto ? <img src={activePhoto} alt="" style={{ objectPosition: `${activeX}% ${activeY}%`, transform: `scale(${activeZoom})` }} /> : null}
                </div>
                <p className="crop-hint">Drag the circle to move the crop.</p>
                <label>Zoom<input type="range" min="1" max="2.8" step="0.05" value={activeZoom} onChange={(event) => updateActive({ zoom: Number(event.target.value) })} /></label>
                <label>Name<input type="text" value={active.name} onChange={(event) => updateInfo({ name: event.target.value })} /></label>
                <label className="color-field">Color code
                  <input
                    type="color"
                    value={colors[cropId(artist, active.sourceName)] || "#ffffff"}
                    onChange={(event) => setColors(saveColor(artist, active.sourceName, event.target.value))}
                  />
                </label>
                <label>Role<input type="text" value={active.role} onChange={(event) => updateInfo({ role: event.target.value })} /></label>
                <label>Birthday<input type="text" value={active.born} onChange={(event) => updateInfo({ born: event.target.value })} /></label>
                <label>Country<input type="text" value={active.country} onChange={(event) => updateInfo({ country: event.target.value })} /></label>
                <label>New image URL<input type="text" value={activePhoto.startsWith("data:") ? "" : activePhoto} placeholder={activePhoto.startsWith("data:") ? "Uploaded image" : "Paste an image link"} onChange={(event) => updateActive({ photo: event.target.value })} /></label>
                <label className="file-label">
                  Upload image
                  <input type="file" accept="image/*" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => updateActive({ photo: String(reader.result || "") });
                    reader.readAsDataURL(file);
                  }} />
                </label>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function formatTimestamp(seconds?: number) {
  if (seconds == null || Number.isNaN(seconds)) return "";
  const snapped = Math.max(0, Math.round(seconds * 2) / 2);
  const mins = Math.floor(snapped / 60);
  const secs = snapped - mins * 60;
  const whole = Math.floor(secs);
  const half = secs - whole >= 0.5;
  return `${mins}:${String(whole).padStart(2, "0")}${half ? ".5" : ""}`;
}

function youtubeId(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const take = (id?: string | null) => id?.match(/[A-Za-z0-9_-]{11}/)?.[0];
  const plain = take(text);
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return plain;
  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return take(url.pathname.split("/").filter(Boolean)[0]);
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const watch = url.searchParams.get("v");
      if (watch) return take(watch);
      const parts = url.pathname.split("/").filter(Boolean);
      const at = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live" || part === "v");
      if (at >= 0) return take(parts[at + 1]);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseTimestamp(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  let total: number | undefined;
  if (text.includes(":")) {
    const [mins, secs] = text.split(":");
    const minutes = Number(mins);
    const seconds = Number(secs);
    if (Number.isFinite(minutes) && Number.isFinite(seconds)) total = minutes * 60 + seconds;
  } else {
    const seconds = Number(text);
    if (Number.isFinite(seconds)) total = seconds;
  }
  if (total == null) return undefined;
  return Math.max(0, Math.round(total * 2) / 2);
}

function embedSrc(videoId: string, from: number, to: number) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    start: String(Math.max(0, Math.floor(from))),
    end: String(Math.ceil(to)),
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    disablekb: "1",
    fs: "0",
    iv_load_policy: "3",
    cc_load_policy: "0",
    enablejsapi: "1",
    origin: typeof window === "undefined" ? "" : window.location.origin,
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

function HeroClip({ videoId, start = 15, scope = "hero" }: { videoId: string; start?: number; scope?: string }) {
  const poster = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const playFrom = Math.max(0, start - 4);
  const clipEnd = start + 24;
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const [covered, setCovered] = useState(true);
  const [active, setActive] = useState(0);
  const [srcs, setSrcs] = useState<[string, string]>([`${embedSrc(videoId, playFrom, clipEnd)}&r=1`, ""]);
  useEffect(() => {
    let dead = false;
    let token = 1;
    let armed = 0;
    let shown = false;
    let baseline: number | null = null;
    const pending: number[] = [];
    const after = (ms: number, fn: () => void) => {
      pending.push(window.setTimeout(fn, ms));
    };
    const show = (index: number, mine: number) => {
      if (dead || shown || mine !== token) return;
      shown = true;
      setActive(index);
      setCovered(false);
      after(10000, () => {
        if (dead || mine !== token) return;
        setCovered(true);
        shown = false;
        baseline = null;
        const next = (index === 0 ? 1 : 0) as 0 | 1;
        const mineNext = ++token;
        armed = next;
        after(700, () => {
          if (dead || mineNext !== token) return;
          setSrcs((prev) => {
            const copy: [string, string] = [...prev];
            copy[next] = `${embedSrc(videoId, playFrom, clipEnd)}&r=${mineNext}`;
            return copy;
          });
          after(7000, () => show(next, mineNext));
        });
      });
    };
    const onMessage = (event: MessageEvent) => {
      if (dead || typeof event.data !== "string") return;
      const frame = frames[armed].current;
      if (!frame || event.source !== frame.contentWindow) return;
      let data: { event?: string; info?: { currentTime?: number; playerState?: number } | number };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const info = data.info;
      const time = typeof info === "object" && info ? info.currentTime : undefined;
      const state = typeof info === "number" ? info : typeof info === "object" && info ? info.playerState : undefined;
      if (data.event === "onStateChange" && state !== 1) return;
      if (typeof time !== "number" || time < playFrom - 0.4) return;
      if (baseline === null) {
        baseline = time;
        return;
      }
      if (time < baseline + 0.25) return;
      if (time < Math.max(start, baseline + (start - playFrom) - 0.1)) return;
      show(armed, token);
    };
    const poke = window.setInterval(() => {
      const frame = frames[armed].current;
      if (!frame?.contentWindow) return;
      const send = (payload: object) => frame.contentWindow?.postMessage(JSON.stringify(payload), "*");
      send({ event: "listening", id: frame.id });
      send({ event: "command", func: "mute", args: [] });
      send({ event: "command", func: "playVideo", args: [] });
    }, 700);
    after(7000, () => show(0, token));
    window.addEventListener("message", onMessage);
    return () => {
      dead = true;
      window.clearInterval(poke);
      window.removeEventListener("message", onMessage);
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, [videoId, start, playFrom, clipEnd]);
  return (
    <div className="hero-clip" aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className={active === index ? "clip-slot is-on" : "clip-slot"}>
          {srcs[index] ? (
            <iframe
              id={`${scope}-clip-${videoId}-${index}`}
              ref={frames[index]}
              src={srcs[index]}
              title=""
              allow="autoplay; encrypted-media"
              tabIndex={-1}
            />
          ) : null}
        </div>
      ))}
      <div className={covered ? "clip-cover" : "clip-cover is-off"}>
        <img src={poster} alt="" />
      </div>
    </div>
  );
}


function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [view, setView] = useState<View>("top-songs");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [thoughtsOpen, setThoughtsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [coverColor, setCoverColor] = useState("#a78bfa");
  const closeTimer = useRef<number | null>(null);
  const scrollIdle = useRef<number | null>(null);
  const coverTried = useRef(new Set<number>());
  const coverFix = useRef(false);
  const countsTried = useRef(new Set<string>());
  const companyTried = useRef(new Set<number>());
  const [fact, setFact] = useState<{ field: "album" | "releaseDate" | "company"; value: string } | null>(null);
  useEffect(() => setFact(null), [selectedId]);

  useEffect(() => {
    setSongs(loadSongs());
  }, []);

  useEffect(() => {
    if (coverFix.current || !songs.length || localStorage.getItem("gyt-cover-fix") === "2") return;
    coverFix.current = true;
    localStorage.setItem("gyt-cover-fix", "2");
    (async () => {
      const updates = new Map<number, string>();
      for (const song of songs) {
        if (song.coverManual) continue;
        const track = await fetchTrack(song.title, song.artist, song.album);
        if (track?.coverUrl && track.coverUrl !== song.coverUrl) updates.set(song.id, track.coverUrl);
      }
      if (!updates.size) return;
      setSongs((prev) => {
        const next = prev.map((song) => updates.has(song.id) ? { ...song, coverUrl: updates.get(song.id) } : song);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    })();
  }, [songs]);

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
        if (videoId && !song.videoId && !song.videoUrl) patch.videoId = videoId;
        if (Object.keys(patch).length > 0) found.set(song.id, patch);
      }
      if (cancelled || found.size === 0) return;
      setSongs((prev) => {
        const next = prev.map((song) => {
          const patch = found.get(song.id);
          if (!patch) return song;
          if (song.videoUrl) {
            const { videoId: _ignored, ...rest } = patch;
            return { ...song, ...rest };
          }
          return { ...song, ...patch };
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
    const fills = songs.filter((song) => !song.company && knownLabel(song.artist, song.title));
    if (fills.length > 0) {
      setSongs((prev) => {
        const next = prev.map((song) => {
          const known = knownLabel(song.artist, song.title);
          return known && !song.company ? { ...song, company: known.company, subLabel: undefined } : song;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }
    const missing = songs.filter((song) => !song.company && !companyTried.current.has(song.id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const song of missing) {
        if (cancelled) return;
        companyTried.current.add(song.id);
        const label = await lookupCompany(song.artist, song.title);
        if (label) {
          setSongs((prev) => {
            const next = prev.map((item) =>
              item.id === song.id && !item.company ? { ...item, company: label.company, subLabel: undefined } : item,
            );
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
          });
        } else if (cancelled) {
          companyTried.current.delete(song.id);
          return;
        }
        if (cancelled) return;
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
      }
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
          .filter((song) => !song.spotifyStreams || !song.spotifyAt || now - song.spotifyAt > COUNT_STALE)
          .map((song) => song.artist),
      ),
    ].filter((artist) => !countsTried.current.has(artist));
    if (staleYouTube.length === 0 && staleArtists.length === 0) return;
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
      if (!cancelled && youtube.size > 0) {
        setSongs((prev) => {
          const next = prev.map((song) => {
            if (!song.videoId || !youtube.has(song.videoId)) return song;
            return { ...song, youtubeViews: youtube.get(song.videoId), youtubeAt: now };
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      }
      for (const artist of staleArtists) {
        if (cancelled) return;
        let catalog: Record<string, number> | null = null;
        try {
          const result = await getSpotifyStreams({ data: { artist } });
          if (Object.keys(result.songs).length > 0) catalog = result.songs;
        } catch {
          catalog = null;
        }
        if (cancelled) return;
        if (!catalog) {
          countsTried.current.add(artist);
          continue;
        }
        countsTried.current.add(artist);
        setSongs((prev) => {
          let changed = false;
          const next = prev.map((song) => {
            if (song.artist !== artist) return song;
            const full = song.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            const loose = song.title
              .toLowerCase()
              .replace(/\(.*?\)|\[.*?\]/g, " ")
              .replace(/\s+[-–].*$/, "")
              .replace(/[^a-z0-9]/g, "");
            const streams = catalog[full] || (loose && catalog[loose]);
            if (!streams || song.spotifyStreams === streams) return song;
            changed = true;
            return { ...song, spotifyStreams: streams, spotifyAt: now };
          });
          if (!changed) return prev;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        });
      }
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

  useEffect(() => {
    if (!selected?.coverUrl) {
      setCoverColor("#a78bfa");
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      const size = 28;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let r = 0, g = 0, b = 0, weight = 0;
      for (let i = 0; i < data.length; i += 4) {
        const R = data[i], G = data[i + 1], B = data[i + 2];
        const max = Math.max(R, G, B), min = Math.min(R, G, B);
        const light = (max + min) / 510;
        if (light < 0.14 || light > 0.9) continue;
        const sat = max === 0 ? 0 : (max - min) / max;
        const score = 0.35 + sat * 1.6;
        r += R * score; g += G * score; b += B * score; weight += score;
      }
      if (!weight) return;
      setCoverColor(`rgb(${Math.round(r / weight)}, ${Math.round(g / weight)}, ${Math.round(b / weight)})`);
    };
    img.src = selected.coverUrl;
    return () => { cancelled = true; };
  }, [selected?.coverUrl]);
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
    const artistChanged = Boolean(previous && previous.artist !== updated.artist);
    const nextSong = changedLookup
      ? {
          ...updated,
          coverUrl: undefined,
          album: "",
          releaseDate: "",
          videoId: updated.videoUrl ? updated.videoId : undefined,
          company: artistChanged ? undefined : updated.company,
          subLabel: artistChanged ? undefined : updated.subLabel,
        }
      : updated;
    if (changedLookup || !nextSong.videoId) coverTried.current.delete(updated.id);
    if (artistChanged) companyTried.current.delete(updated.id);
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
      <div className="seam" aria-hidden="true">
        <div className="seam-h"><i /></div>
        <div className="seam-v"><i /></div>
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
                {filteredSongs.map((song, index) => {
                  const selected = song.id === selectedId;
                  return (
                  <div
                    key={song.id}
                    className={selected ? "row is-selected" : "row"}
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
                    {selected && song.videoId ? (
                      <HeroClip scope="row" videoId={song.videoId} start={song.clipStart ?? 15} />
                    ) : null}
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
                    {selected ? null : (
                      <div className="row-rating">
                        <span className="row-sub">RATING</span>
                        <Stars rating={song.rating} className="row-stars" />
                      </div>
                    )}
                  </div>
                  );
                })}
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
        </aside>

        <main
          className="main"
          style={{ "--cover": coverColor } as CSSProperties}
          onScroll={(event) => {
            const shell = event.currentTarget.closest(".app-shell");
            if (!shell) return;
            shell.classList.add("is-scrolling");
            if (scrollIdle.current) window.clearTimeout(scrollIdle.current);
            scrollIdle.current = window.setTimeout(() => shell.classList.remove("is-scrolling"), 140);
          }}
        >
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
            <article className="detail" style={{ "--cover": coverColor } as CSSProperties}>
              <div className="detail-hero">
                {selected.videoId ? (
                  <HeroClip
                    key={`${selected.id}-${selected.videoId}`}
                    videoId={selected.videoId}
                    start={selected.clipStart ?? 15}
                  />
                ) : null}
                {selected.coverUrl ? <img className="detail-cover" src={selected.coverUrl} alt="" /> : null}
                <div className="detail-copy">
                  <div className="detail-rank">#{songs.findIndex((song) => song.id === selected.id) + 1}</div>
                  <h1>{selected.title}</h1>
                  <p className="byline">{selected.artist}</p>
                  <Stars rating={selected.rating} className="detail-stars" />
                </div>
                <button type="button" className="edit-btn" onClick={() => setEditing(true)}>
                  Edit
                </button>
              </div>
              <div className="meta-grid">
                <div className="card span-2 info-cell">
                  <span>Album / EP</span>
                  <a href={spotifySearch(`${albumInfo(selected.album || selected.title).name} ${selected.artist}`)} target="_blank" rel="noreferrer">
                    <strong className="value">{albumInfo(selected.album).name || "—"}</strong>
                  </a>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "album", value: selected.album || "" })}>Edit</button>
                </div>
                <div className="card span-2 info-cell">
                  <span>Release date</span>
                  <strong className="value">{selected.releaseDate ? formatDate(selected.releaseDate) : "—"}</strong>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "releaseDate", value: selected.releaseDate || "" })}>Edit</button>
                </div>
                <a className="count" href={spotifySearch(`${selected.title} ${selected.artist}`)} target="_blank" rel="noreferrer">
                  <span className="count-label">Spotify<SpotifyMark /></span>
                  <strong><CountValue value={selected.spotifyStreams} /></strong>
                </a>
                {selected.videoId ? (
                  <a className="count" href={`https://www.youtube.com/watch?v=${selected.videoId}`} target="_blank" rel="noreferrer">
                    <span className="count-label">YouTube<YouTubeMark /></span>
                    <strong><CountValue value={selected.youtubeViews} /></strong>
                  </a>
                ) : (
                  <div className="count">
                    <span className="count-label">YouTube<YouTubeMark /></span>
                    <strong><CountValue /></strong>
                  </div>
                )}
                <div className="card span-2 info-cell">
                  <span>Company</span>
                  <strong className="company-name">{selected.company?.replace(/\s*\([^)]*\)/g, "").trim() || "—"}</strong>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "company", value: selected.company || "" })}>Edit</button>
                </div>
              </div>
              {fact ? (
                <form
                  className="cell-pop"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = fact.value.trim();
                    setSongs((prev) => {
                      const next = prev.map((item) => (item.id === selected.id ? { ...item, [fact.field]: value } : item));
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                      return next;
                    });
                    setFact(null);
                  }}
                >
                  <label>
                    {fact.field === "album" ? "Album / EP" : fact.field === "releaseDate" ? "Release date" : "Company"}
                    <input
                      type={fact.field === "releaseDate" ? "date" : "text"}
                      value={fact.value}
                      onChange={(event) => setFact({ ...fact, value: event.target.value })}
                    />
                  </label>
                  <div className="cell-pop-actions">
                    <button type="submit">Save</button>
                    <button type="button" onClick={() => setFact(null)}>Cancel</button>
                  </div>
                </form>
              ) : null}
              <section className="thoughts">
                <div className="thoughts-menu">
                  <button type="button" className="thoughts-avatar-btn" onClick={() => setThoughtsOpen((open) => !open)} aria-label="My Thoughts menu">
                    <img className="thoughts-avatar" src="/avatar.png" alt="Garrett Jahnke" />
                  </button>
                  {thoughtsOpen ? (
                    <div className="thoughts-panel">
                      <button type="button" onClick={() => { setThoughtsOpen(false); setEditing(true); }}>Edit</button>
                    </div>
                  ) : null}
                </div>
                <div className="thoughts-head">
                  <span>My Thoughts</span>
                  <span className="bulb" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="32" height="32">
                      <path fill="currentColor" d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zm2.2 11.2-.2.1V15h-4v-1.7l-.2-.1A5 5 0 1 1 14.2 13.2z" />
                    </svg>
                  </span>
                  <button type="button" className="thoughts-edit" onClick={() => setEditing(true)}>Edit</button>
                </div>
                <p className="thoughts-text">{selected.notes || "Nothing here yet. Add it from Edit."}</p>
              </section>
              {selected.videoId ? (
                <div className="video">
                  <iframe
                    src={`https://www.youtube.com/embed/${selected.videoId}`}
                    title={`${selected.title} music video`}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : null}
              <section className="lyrics">
                <LyricsBlock
                  text={selected.lyrics}
                  artist={selected.artist}
                  onLoad={async (url) => {
                    const result = await getLyrics({ data: { url, artist: selected.artist, title: selected.title } });
                    if (!result?.lines?.length) return false;
                    setSongs((prev) => {
                      const next = prev.map((item) =>
                        item.id === selected.id ? { ...item, geniusUrl: result.source, lyrics: JSON.stringify(result) } : item,
                      );
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                      return next;
                    });
                    return true;
                  }}
                  onReset={() => {
                    setSongs((prev) => {
                      const next = prev.map((item) => item.id === selected.id ? { ...item, geniusUrl: undefined, lyrics: undefined } : item);
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                      return next;
                    });
                  }}
                  onTranslated={(english) => {
                    setSongs((prev) => {
                      const song = prev.find((item) => item.id === selected.id);
                      if (!song?.lyrics?.startsWith("{")) return prev;
                      const parsed = JSON.parse(song.lyrics) as { lines?: { english?: string; korean?: string }[] };
                      if (!parsed.lines) return prev;
                      const lines = parsed.lines.map((line, index) => ({ ...line, english: english[index] || line.english || line.korean }));
                      const next = prev.map((item) => item.id === song.id ? { ...item, lyrics: JSON.stringify({ ...parsed, lines }) } : item);
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                      return next;
                    });
                  }}
                />
              </section>
              <GroupProfile artist={selected.artist} />
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
  async function submit(form: FormData) {
    const title = String(form.get("title") ?? "").trim();
    const artist = String(form.get("artist") ?? "").trim();
    if (!title || !artist) return;
    const nextPosition = Number(form.get("position") ?? position);
    const clipStart = parseTimestamp(String(form.get("clipStart") ?? ""));
    const videoUrl = String(form.get("videoUrl") ?? "").trim();
    const overrideId = youtubeId(videoUrl);
    let nextVideoId = song.videoId;
    let nextVideoUrl = song.videoUrl;
    if (!videoUrl) {
      if (song.videoUrl) {
        nextVideoId = undefined;
        nextVideoUrl = undefined;
      }
    } else if (overrideId) {
      nextVideoId = overrideId;
      nextVideoUrl = videoUrl;
    }
    const videoChanged = nextVideoId !== song.videoId;
    const coverLink = String(form.get("coverUrl") ?? "").trim();
    const coverFile = form.get("coverFile");
    let coverUrl = coverLink || song.coverUrl;
    if (coverFile instanceof File && coverFile.size) {
      coverUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || coverUrl || ""));
        reader.readAsDataURL(coverFile);
      });
    }
    onSave(
      {
        ...song,
        title,
        artist,
        album: String(form.get("album") ?? "").trim(),
        releaseDate: String(form.get("releaseDate") ?? "").trim(),
        rating: Number(form.get("rating") ?? song.rating),
        notes: String(form.get("notes") ?? "").trim(),
        coverUrl,
        coverManual: Boolean(coverUrl && coverUrl !== song.coverUrl) || song.coverManual,
        clipStart,
        videoUrl: nextVideoUrl,
        videoId: nextVideoId,
        youtubeViews: videoChanged ? undefined : song.youtubeViews,
        youtubeAt: videoChanged ? undefined : song.youtubeAt,
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
        <label htmlFor="edit-cover">Cover</label>
        <input id="edit-cover" name="coverUrl" defaultValue={song.coverUrl ?? ""} placeholder="Paste an image link" />
        <input name="coverFile" type="file" accept="image/*" />
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
        <label htmlFor="edit-clip">MV start</label>
        <input id="edit-clip" name="clipStart" placeholder="0:26.5" defaultValue={formatTimestamp(song.clipStart)} />
      </div>
      <div className="field">
        <label htmlFor="edit-video">YouTube link</label>
        <input
          id="edit-video"
          name="videoUrl"
          placeholder="Paste a link to replace the video"
          defaultValue={song.videoUrl ?? ""}
        />
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
    const [track, videoId, label] = await Promise.all([
      fetchTrack(title, artist),
      fetchVideo(title, artist),
      lookupCompany(artist, title),
    ]);
    const position = Number(form.get("position") ?? nextPosition);
    const clipStart = parseTimestamp(String(form.get("clipStart") ?? ""));
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
        clipStart,
        company: label?.company?.replace(/\s*\([^)]*\)/g, "").trim(),
        subLabel: undefined,
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
          <label htmlFor="clipStart">MV start</label>
          <input id="clipStart" name="clipStart" placeholder="0:26.5" />
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
