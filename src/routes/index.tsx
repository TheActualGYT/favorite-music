import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { getSpotifyStreams } from "../lib/spotify";
import { getCompany } from "../lib/company";
import { getGroup, getIdolPhoto } from "../lib/group";
import { actKind } from "../lib/acts";

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
  reactionUrl?: string;
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
  durationMs?: number;
  durationManual?: boolean;
  listPoints?: string;
};

type View =
  | "songs"
  | "top-songs"
  | "top-artists"
  | "top-albums"
  | "all-artists"
  | "all-albums";

const STORAGE_KEY = "favoriteSongs";
const LIBRARY_KEYS = [
  STORAGE_KEY,
  "gyt-group-roster",
  "gyt-bias",
  "gyt-member-colors",
  "gyt-idol-photos",
  "gyt-profile-crops",
  "gyt-lyric-crops",
  "gyt-profile-info",
] as const;
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

function libraryEndpoint() {
  if (typeof window === "undefined") return "/api/library";
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith("vercel.app")) return "/api/library";
  return "https://favorite-music.vercel.app/api/library";
}

function snapshotLibrary() {
  const data: Record<string, unknown> = {};
  for (const key of LIBRARY_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      /* skip a broken entry */
    }
  }
  return data;
}

function libraryHasEntries(data: Record<string, unknown>) {
  const songs = data[STORAGE_KEY];
  if (Array.isArray(songs) && songs.length > 0) return true;
  return Object.entries(data).some(([key, value]) => {
    if (key === STORAGE_KEY || !value || typeof value !== "object") return false;
    return Object.keys(value as Record<string, unknown>).length > 0;
  });
}

let libraryPause = false;
let libraryTimer = 0;
let libraryHooked = false;

function queueLibrarySave() {
  if (libraryPause || typeof window === "undefined") return;
  window.clearTimeout(libraryTimer);
  libraryTimer = window.setTimeout(flushLibrarySave, 400);
}

function flushLibrarySave() {
  if (libraryPause || typeof window === "undefined") return;
  window.clearTimeout(libraryTimer);
  const data = snapshotLibrary();
  if (!libraryHasEntries(data) && !Array.isArray(data[STORAGE_KEY])) return;
  void fetch(libraryEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  }).catch(() => {});
}

function hookLibrary() {
  if (libraryHooked || typeof window === "undefined") return;
  libraryHooked = true;
  const original = localStorage.setItem.bind(localStorage);
  localStorage.setItem = ((key: string, value: string) => {
    original(key, value);
    if (LIBRARY_KEYS.includes(key as (typeof LIBRARY_KEYS)[number])) queueLibrarySave();
  }) as typeof localStorage.setItem;
}

if (typeof window !== "undefined") hookLibrary();

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
      rating: typeof song.rating === "number" && song.rating > 0 ? song.rating : 0,
      notes: song.notes ?? "",
      coverUrl: song.coverUrl,
      coverManual: song.coverManual,
      videoId: song.videoId,
      videoUrl: song.videoUrl,
      reactionUrl: song.reactionUrl,
      clipStart: song.clipStart,
      clipUrl: song.clipUrl,
      company: isPersonCompany(song.company) ? undefined : song.company?.replace(/\s*\([^)]*\)/g, "").trim() || undefined,
      subLabel: undefined,
      lyrics: typeof song.lyrics === "string" && song.lyrics.includes('"lines"')
        ? song.lyrics
        : song.lyrics && typeof song.lyrics === "object"
          ? JSON.stringify(song.lyrics)
          : undefined,
      geniusUrl: song.geniusUrl,
      spotifyStreams: song.spotifyStreams,
      spotifyAt: song.spotifyAt,
      youtubeViews: song.youtubeViews,
      youtubeAt: song.youtubeAt,
      durationMs: song.durationMs,
      durationManual: song.durationManual,
      listPoints: song.listPoints,
    }));
  } catch {
    return [];
  }
}

function averageRating(items: Song[]) {
  const rated = items.filter((song) => song.rating > 0);
  if (!rated.length) return 0;
  return rated.reduce((sum, song) => sum + song.rating, 0) / rated.length;
}

function ratingFrom(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (!raw || raw === "none") return 0;
  const rating = Number(raw);
  return Number.isFinite(rating) && rating > 0 ? rating : 0;
}

function Stars({ rating, className }: { rating: number; className?: string }) {
  const n = Math.max(0, Math.min(5, Math.round((rating || 0) * 2) / 2));
  if (n <= 0) return null;
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
  durationMs?: number;
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
          trackTimeMillis?: number;
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
        durationMs: match.trackTimeMillis,
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

function formatDuration(ms?: number) {
  if (!ms || ms < 1000) return "—";
  const total = Math.round(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function parseDuration(value: string) {
  const trimmed = value.trim();
  const clock = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (clock) return (Number(clock[1]) * 60 + Number(clock[2])) * 1000;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * (seconds < 20 ? 60000 : 1000));
  return undefined;
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
  if (name === "bts" || name === "bangtan" || name === "bangtansonyeondan" || name === "방탄소년단") return { company: "Big Hit Music" };
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
  philippines: "ph",
  "the philippines": "ph",
  filipino: "ph",
  ph: "ph",
  "new zealand": "nz",
  "united kingdom": "gb",
  uk: "gb",
};

function flagSrc(country: string) {
  const code = FLAGS[country.toLowerCase().trim()] ?? "";
  return code ? `https://flagcdn.com/w40/${code}.png` : "";
}

function withCountry<T extends { name: string; country: string }>(artist: string, member: T) {
  const group = artist.toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = member.name.toLowerCase().replace(/[^a-z]/g, "");
  if ((group === "idntt" || group === "identity") && name === "kimjihoo") {
    return { ...member, country: "Philippines" };
  }
  return member;
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
        const saved = loadRoster();
        if (saved[key]?.length) {
          setRoster(saved[key]);
          return;
        }
        const members = page.members.map((member) => ({
          name: member.name,
          born: member.born,
          role: member.role,
          country: member.country,
          flag: "",
          photo: member.photo,
        }));
        const next = loadRoster();
        next[key] = members;
        localStorage.setItem(ROSTER_KEY, JSON.stringify(next));
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
    .map((member) => withCountry(artist, { ...member, ...info[cropId(artist, member.name)], sourceName: member.name }))
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

function primaryArtist(artist: string) {
  return artist.replace(/\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\b[^)\]]*[)\]]/gi, "").trim();
}

type VideoFrame = { left: number; top: number; width: number; height: number };
type VideoFit = { poster: string; image: VideoFrame; ratio: number };
const videoFits = new Map<string, VideoFit>();

function loadFrameImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function measureImage(img: HTMLImageElement): VideoFrame {
  const width = 180;
  const height = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { left: 0, top: 0, width: 1, height: 1 };
  ctx.drawImage(img, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const dark = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return pixels[i] < 30 && pixels[i + 1] < 30 && pixels[i + 2] < 30;
  };
  const barRow = (y: number) => {
    let count = 0;
    for (let x = 0; x < width; x += 1) if (dark(x, y)) count += 1;
    return count / width > 0.96;
  };
  const barCol = (x: number) => {
    let count = 0;
    for (let y = 0; y < height; y += 1) if (dark(x, y)) count += 1;
    return count / height > 0.96;
  };
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  while (top < bottom && barRow(top)) top += 1;
  while (bottom > top && barRow(bottom)) bottom -= 1;
  while (left < right && barCol(left)) left += 1;
  while (right > left && barCol(right)) right -= 1;
  const frame = {
    left: left / width,
    top: top / height,
    width: (right - left + 1) / width,
    height: (bottom - top + 1) / height,
  };
  if (frame.width < 0.34 || frame.height < 0.34) return { left: 0, top: 0, width: 1, height: 1 };
  const inset = 0.01;
  return {
    left: frame.left + frame.width * inset,
    top: frame.top + frame.height * inset,
    width: frame.width * (1 - inset * 2),
    height: frame.height * (1 - inset * 2),
  };
}

function playerFrame(image: VideoFrame, ratio: number): VideoFrame {
  const player = 16 / 9;
  const contentRatio = (image.width / image.height) * ratio;
  if (Math.abs(ratio - player) < 0.07) return image;
  if (contentRatio < player) {
    const width = contentRatio / player;
    return { left: (1 - width) / 2, top: 0, width, height: 1 };
  }
  const height = player / contentRatio;
  return { left: 0, top: (1 - height) / 2, width: 1, height };
}

async function videoFit(videoId: string): Promise<VideoFit> {
  const cached = videoFits.get(videoId);
  if (cached) return cached;
  const poster = `/api/thumb?v=${videoId}`;
  try {
    const img = await loadFrameImage(poster);
    if (img.naturalWidth >= 200) {
      const fit = { poster, image: measureImage(img), ratio: img.naturalWidth / img.naturalHeight };
      videoFits.set(videoId, fit);
      return fit;
    }
  } catch {
    // keep the uncropped player
  }
  const fit = { poster, image: { left: 0, top: 0, width: 1, height: 1 }, ratio: 16 / 9 };
  videoFits.set(videoId, fit);
  return fit;
}

function placed(frame: VideoFrame, ratio: number, rect: DOMRect, lockRatio: number): CSSProperties {
  if (rect.width < 2 || rect.height < 2) return {};
  const width = Math.max(rect.width / frame.width, (rect.height * lockRatio) / frame.height) * 1.04;
  const height = width / lockRatio;
  const centerX = (frame.left + frame.width / 2) * width;
  const centerY = (frame.top + frame.height / 2) * height;
  return {
    width,
    height,
    left: rect.width / 2 - centerX,
    top: rect.height / 2 - centerY,
    transform: "none",
  };
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
  const playFrom = Math.max(0, start - 4);
  const clipEnd = start + 24;
  const box = useRef<HTMLDivElement>(null);
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const [covered, setCovered] = useState(true);
  const [instant, setInstant] = useState(false);
  const [active, setActive] = useState(0);
  const [poster, setPoster] = useState(`/api/thumb?v=${videoId}`);
  const [posterFit, setPosterFit] = useState<CSSProperties>({});
  const [playerFit, setPlayerFit] = useState<CSSProperties>({});
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
    let awaitingSeek = false;
    const show = (index: number, mine: number) => {
      if (dead || mine !== token || awaitingSeek) return;
      if (document.hidden) {
        after(400, () => show(index, mine));
        return;
      }
      if (shown) return;
      shown = true;
      setInstant(false);
      setActive(index);
      setCovered(false);
      after(10000, () => {
        if (dead || mine !== token) return;
        setInstant(false);
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
    const kick = (index: number) => {
      const frame = frames[index].current;
      if (!frame?.contentWindow) return;
      const send = (payload: object) => frame.contentWindow?.postMessage(JSON.stringify(payload), "*");
      send({ event: "listening", id: frame.id });
      send({ event: "command", func: "mute", args: [] });
      send({ event: "command", func: "seekTo", args: [playFrom, true] });
      send({ event: "command", func: "playVideo", args: [] });
    };
    const hold = () => {
      shown = false;
      baseline = null;
      awaitingSeek = true;
      token += 1;
      setInstant(true);
      setCovered(true);
      if (document.hidden) return;
      kick(armed);
      after(900, () => {
        if (!dead && awaitingSeek && !document.hidden) kick(armed);
      });
    };
    const onMessage = (event: MessageEvent) => {
      if (dead || document.hidden || typeof event.data !== "string") return;
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
      if (awaitingSeek) {
        if (time > playFrom + 1.1) return;
        baseline = time;
        awaitingSeek = false;
        return;
      }
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
    }, 250);
    const onVis = () => hold();
    after(7000, () => show(0, token));
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      window.clearInterval(poke);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVis);
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, [videoId, start, playFrom, clipEnd]);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let dead = false;
    let fit: VideoFit = { poster: `/api/thumb?v=${videoId}`, image: { left: 0, top: 0, width: 1, height: 1 }, ratio: 16 / 9 };
    const apply = () => {
      const rect = node.getBoundingClientRect();
      setPoster(fit.poster);
      setPosterFit(placed(fit.image, fit.ratio, rect, fit.ratio));
      setPlayerFit(placed(playerFrame(fit.image, fit.ratio), 16 / 9, rect, 16 / 9));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    videoFit(videoId).then((next) => {
      if (dead) return;
      fit = next;
      apply();
    });
    return () => {
      dead = true;
      observer.disconnect();
    };
  }, [videoId]);
  return (
    <div className="hero-clip" ref={box} aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className={active === index ? "clip-slot is-on" : "clip-slot"}>
          {srcs[index] ? (
            <iframe
              id={`${scope}-clip-${videoId}-${index}`}
              ref={frames[index]}
              src={srcs[index]}
              title=""
              style={playerFit}
              allow="autoplay; encrypted-media"
              tabIndex={-1}
            />
          ) : null}
        </div>
      ))}
      <div className={covered ? `clip-cover${instant ? " is-instant" : ""}` : "clip-cover is-off"}>
        <img src={poster} alt="" style={posterFit} />
      </div>
    </div>
  );
}


function NavShade() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let dead = false;
    let frame = 0;
    const size = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(parent);
    const draw = (now: number) => {
      if (dead) return;
      frame = window.requestAnimationFrame(draw);
      if (document.hidden) return;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const t = now / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0c0c0e";
      ctx.fillRect(0, 0, width, height);
      const lights = [
        { x: width * (0.2 + Math.sin(t * 0.11) * 0.16), y: height * (0.3 + Math.cos(t * 0.08) * 0.4), r: width * 0.32, color: "rgba(124, 58, 237, 0.28)" },
        { x: width * (0.72 + Math.cos(t * 0.09) * 0.14), y: height * (0.6 + Math.sin(t * 0.07) * 0.35), r: width * 0.38, color: "rgba(196, 181, 253, 0.16)" },
        { x: width * (0.48 + Math.sin(t * 0.06 + 1.4) * 0.2), y: height * 0.5, r: width * 0.24, color: "rgba(255, 255, 255, 0.06)" },
      ];
      for (const light of lights) {
        const glow = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.r);
        glow.addColorStop(0, light.color);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      dead = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="nav-shade" aria-hidden="true" />;
}

function GridPulse({ color }: { color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  colorRef.current = color;
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let dead = false;
    let frame = 0;
    type Cell = { col: number; row: number; age: number; dur: number };
    const cells: Cell[] = [];
    let sized = { w: 0, h: 0 };
    const size = () => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width === sized.w && height === sized.h) return;
      sized = { w: width, h: height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const place = () => {
      const cols = Math.max(1, Math.ceil(sized.w / 40));
      const rows = Math.max(1, Math.ceil(sized.h / 40));
      const used = new Set(cells.map((cell) => `${cell.col}:${cell.row}`));
      for (let tries = 0; tries < 28; tries += 1) {
        const col = Math.floor(Math.random() * cols);
        const row = Math.floor(Math.random() * rows);
        const key = `${col}:${row}`;
        if (used.has(key)) continue;
        cells.push({ col, row, age: Math.random() * 0.75, dur: 2.8 + Math.random() * 2.2 });
        return true;
      }
      return false;
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(parent);
    let last = performance.now();
    const draw = (now: number) => {
      if (dead) return;
      frame = window.requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      size();
      canvas.style.transform = `translate3d(0, ${parent.scrollTop}px, 0)`;
      const width = sized.w;
      const height = sized.h;
      const cols = Math.max(1, Math.ceil(width / 40));
      const rows = Math.max(1, Math.ceil(height / 40));
      const target = Math.min(72, Math.max(40, Math.round(cols * rows * 0.18)));
      while (cells.length < target) {
        if (!place()) break;
      }
      ctx.clearRect(0, 0, width, height);
      for (let i = cells.length - 1; i >= 0; i -= 1) {
        const cell = cells[i];
        cell.age += dt / cell.dur;
        if (cell.age >= 1) {
          cells.splice(i, 1);
          continue;
        }
        const x = cell.col * 40;
        const y = cell.row * 40;
        if (x >= width || y >= height) continue;
        const attack = 0.14;
        const fade = cell.age < attack
          ? 1 - (1 - cell.age / attack) ** 3
          : (1 - (cell.age - attack) / (1 - attack)) ** 1.35;
        const alpha = Math.max(0, fade);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, 40, 40);
        ctx.clip();
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = colorRef.current;
        ctx.fillRect(x, y, 40, 40);
        const glow = ctx.createRadialGradient(x + 20, y + 20, 4, x + 20, y + 20, 28);
        glow.addColorStop(0, colorRef.current);
        glow.addColorStop(1, "transparent");
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, 40, 40);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      dead = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="grid-pulse" aria-hidden="true" />;
}

function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [view, setView] = useState<View>("top-songs");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const opened = useRef(false);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [thoughtsOpen, setThoughtsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [actFilters, setActFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"" | "year" | "streams" | "views">("");
  const [editing, setEditing] = useState(false);
  const [coverColor, setCoverColor] = useState("#a78bfa");
  const closeTimer = useRef<number | null>(null);
  const scrollIdle = useRef<number | null>(null);
  const coverTried = useRef(new Set<number>());
  const coverFix = useRef(false);
  const countsTried = useRef(new Set<string>());
  const companyTried = useRef(new Set<number>());
  const [fact, setFact] = useState<{ field: "album" | "releaseDate" | "company" | "listPoints" | "duration"; value: string } | null>(null);
  useEffect(() => setFact(null), [selectedId]);
  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".filter-wrap")) return;
      setFilterOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [filterOpen]);
  useEffect(() => {
    if (opened.current || !songs.length) return;
    opened.current = true;
    setSelectedId((current) => current ?? songs[0].id);
  }, [songs]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const local = snapshotLibrary();
      try {
        const response = await fetch(libraryEndpoint());
        const remote = response.ok ? ((await response.json()) as Record<string, unknown>) : {};
        if (dead || remote.error) {
          setSongs(loadSongs());
          return;
        }
        if (libraryHasEntries(remote)) {
          const remoteSongs = Array.isArray(remote[STORAGE_KEY]) ? remote[STORAGE_KEY] as Song[] : [];
          const localSongs = loadSongs();
          const byId = new Map(remoteSongs.map((song) => [song.id, song]));
          const seen = new Set<number>();
          const merged = localSongs.map((song) => {
            seen.add(song.id);
            const other = byId.get(song.id);
            if (!other) return song;
            return { ...other, ...song, lyrics: song.lyrics || other.lyrics, notes: song.notes || other.notes, geniusUrl: song.geniusUrl || other.geniusUrl };
          });
          for (const song of remoteSongs) {
            if (!seen.has(song.id)) merged.push(song);
          }
          libraryPause = true;
          if (merged.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
          for (const key of LIBRARY_KEYS) {
            if (key === STORAGE_KEY || remote[key] === undefined || localStorage.getItem(key)) continue;
            localStorage.setItem(key, JSON.stringify(remote[key]));
          }
          libraryPause = false;
          setSongs(loadSongs());
          window.dispatchEvent(new Event("gyt-roster"));
          if (merged.length) flushLibrarySave();
          return;
        }
        setSongs(loadSongs());
        if (libraryHasEntries(local)) {
          await fetch(libraryEndpoint(), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data: local }),
          });
        }
      } catch {
        if (!dead) setSongs(loadSongs());
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    if (coverFix.current || !songs.length || localStorage.getItem("gyt-cover-fix") === "2") return;
    coverFix.current = true;
    localStorage.setItem("gyt-cover-fix", "2");
    (async () => {
      const updates = new Map<number, string>();
      for (const song of filteredSongs) {
        if (song.coverManual) continue;
        const track = await fetchTrack(song.title, primaryArtist(song.artist), song.album);
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
        (!song.coverUrl || !song.album || !song.releaseDate || !song.videoId || (!song.durationMs && !song.durationManual)) &&
        !coverTried.current.has(song.id),
    );
    if (missing.length === 0) return;
    missing.forEach((song) => coverTried.current.add(song.id));
    let cancelled = false;
    (async () => {
      const found = new Map<number, Partial<Song>>();
      for (const song of missing) {
        const [track, videoId] = await Promise.all([
          !song.coverUrl || !song.album || !song.releaseDate || (!song.durationMs && !song.durationManual)
            ? fetchTrack(song.title, primaryArtist(song.artist), song.album)
            : Promise.resolve(null),
          !song.videoId ? fetchVideo(song.title, primaryArtist(song.artist)) : Promise.resolve(null),
        ]);
        const patch: Partial<Song> = {};
        if (track?.coverUrl && !song.coverUrl) patch.coverUrl = track.coverUrl;
        if (track?.album && !song.album) patch.album = track.album;
        if (track?.releaseDate && !song.releaseDate) patch.releaseDate = track.releaseDate;
        if (track?.durationMs && !song.durationMs && !song.durationManual) patch.durationMs = track.durationMs;
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
    const fixes = songs.filter((song) => {
      const known = knownLabel(primaryArtist(song.artist), song.title);
      return known && song.company !== known.company;
    });
    if (fixes.length > 0) {
      setSongs((prev) => {
        const next = prev.map((song) => {
          const known = knownLabel(primaryArtist(song.artist), song.title);
          return known && song.company !== known.company ? { ...song, company: known.company, subLabel: undefined } : song;
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
        const label = await lookupCompany(primaryArtist(song.artist), song.title);
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
          .map((song) => primaryArtist(song.artist)),
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
            if (primaryArtist(song.artist) !== artist) return song;
            const full = song.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            const loose = song.title
              .toLowerCase()
              .replace(/\(.*?\)|\[.*?\]/g, " ")
              .replace(/\s+[-–].*$/, "")
              .replace(/[^a-z0-9]/g, "");
            let streams = catalog[full] || (loose && catalog[loose]);
            if (!streams && full.length >= 4) {
              const hit = Object.entries(catalog).find(([key]) => key.includes(full) || full.includes(key));
              if (hit && hit[0].length >= 4) streams = hit[1];
            }
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
    let list = songs.filter(
      (song) =>
        !q ||
        song.title.toLowerCase().includes(q) ||
        song.artist.toLowerCase().includes(q) ||
        song.album.toLowerCase().includes(q),
    );
    if (actFilters.length) {
      list = list.filter((song) => {
        const kind = actKind(primaryArtist(song.artist));
        if (!kind) return false;
        if (actFilters.includes("soloist") && (kind === "male-solo" || kind === "female-solo")) return true;
        if (actFilters.includes(kind)) return true;
        return false;
      });
    }
    if (sortBy === "year") {
      list = [...list].sort((a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
    } else if (sortBy === "streams") {
      list = [...list].sort((a, b) => (b.spotifyStreams || 0) - (a.spotifyStreams || 0));
    } else if (sortBy === "views") {
      list = [...list].sort((a, b) => (b.youtubeViews || 0) - (a.youtubeViews || 0));
    }
    return list;
  }, [songs, q, actFilters, sortBy]);

  const artistRows = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const song of filteredSongs) {
      const key = song.artist || "Unknown";
      if (q && !key.toLowerCase().includes(q) && !song.title.toLowerCase().includes(q)) continue;
      const bucket = map.get(key) ?? [];
      bucket.push(song);
      map.set(key, bucket);
    }
    const rows = [...map.entries()].map(([name, items]) => ({
      name,
      count: items.length,
      rating: averageRating(items),
      items,
    }));
    if (view === "top-artists") {
      rows.sort((a, b) => b.rating - a.rating || b.count - a.count);
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [filteredSongs, q, view]);

  const albumRows = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const song of filteredSongs) {
      const key = song.album || "Single";
      if (q && !key.toLowerCase().includes(q) && !song.title.toLowerCase().includes(q)) continue;
      const bucket = map.get(key) ?? [];
      bucket.push(song);
      map.set(key, bucket);
    }
    const rows = [...map.entries()].map(([name, items]) => ({
      name,
      count: items.length,
      rating: averageRating(items),
      artist: items[0]?.artist ?? "",
      items,
    }));
    if (view === "top-albums") {
      rows.sort((a, b) => b.rating - a.rating || b.count - a.count);
    } else {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [filteredSongs, q, view]);

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
        <NavShade />
        <div className="nav-start">
          <div className="brand">
            <img className="avatar" src="/avatar.png" alt="Garrett Jahnke" />
            <div>
              <div className="brand-name">Garrett Jahnke</div>
              <div className="brand-sub">My KPOP Database</div>
            </div>
          </div>
          <a className="nav-social is-youtube" href="https://www.youtube.com/@theactualgyt3" target="_blank" rel="noreferrer" aria-label="YouTube">
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <rect width="24" height="24" rx="6" fill="#ff0033" />
              <path fill="#fff" d="M9.5 7.4v9.2l7.2-4.6-7.2-4.6z" />
            </svg>
          </a>
          <a className="nav-social is-round" href="https://open.spotify.com/user/31fh5nzrhsdjj4bal7kh4kl63vfm?si=142898ee61514d26" target="_blank" rel="noreferrer" aria-label="Spotify">
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
              <circle cx="12" cy="12" r="11" fill="#1db954" />
              <path fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" d="M7 9.2c2.8-1.2 6.6-1 9.6.6M7.4 12.2c2.3-.9 5.2-.7 7.6.6M7.8 15.1c1.8-.6 3.8-.4 5.5.5" />
            </svg>
          </a>
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
            <div className="head-actions">
              <div className="filter-wrap">
                <button
                  type="button"
                  className={actFilters.length || sortBy ? "filter-btn is-on" : "filter-btn"}
                  onClick={() => setFilterOpen((open) => !open)}
                >
                  Filter
                </button>
                {filterOpen ? (
                  <div className="filter-pop">
                    <p>Type</p>
                    {[
                      ["male-group", "Male group"],
                      ["female-group", "Female group"],
                      ["unisex-group", "Unisex group"],
                      ["soloist", "Soloist"],
                      ["male-solo", "Male soloist"],
                      ["female-solo", "Female soloist"],
                    ].map(([id, label]) => (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={actFilters.includes(id)}
                          onChange={() => setActFilters((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
                        />
                        {label}
                      </label>
                    ))}
                    <p>Sort</p>
                    {[
                      ["year", "Year release"],
                      ["streams", "Most streamed"],
                      ["views", "Most viewed"],
                    ].map(([id, label]) => (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={sortBy === id}
                          onChange={() => setSortBy((current) => current === id ? "" : id as "year" | "streams" | "views")}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="button" className="add-btn" onClick={() => setAdding(true)}>
                + Add
              </button>
            </div>
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
              songs.length === 0 ? (
              <p className="empty">
                No favorite songs yet.
                <br />
                Click <strong>+ Add</strong> to get started.
              </p>
              ) : (
              <p className="empty">No songs match that filter.</p>
              )
            ) : (
              <div
                className="list"
                style={{ "--rank-digits": String(Math.max(1, String(songs.length).length)) } as CSSProperties}
              >
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
                    <span className={(songs.findIndex((item) => item.id === song.id) + 1) < 10 ? "rank is-single" : "rank"}>#{songs.findIndex((item) => item.id === song.id) + 1}</span>
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
                        {song.rating > 0 ? (
                          <>
                            <span className="row-sub">RATING</span>
                            <Stars rating={song.rating} className="row-stars" />
                          </>
                        ) : null}
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
          {selected ? <GridPulse color={coverColor} /> : null}
          {selected ? (
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
                  {selected.rating > 0 ? <Stars rating={selected.rating} className="detail-stars" /> : null}
                </div>
                <button type="button" className="edit-btn" onClick={() => setEditing(true)}>
                  Edit
                </button>
              </div>
              <div className="meta-grid meta-3">
                <div className="card info-cell">
                  <span>Album / EP</span>
                  <a href={spotifySearch(`${albumInfo(selected.album || selected.title).name} ${selected.artist}`)} target="_blank" rel="noreferrer">
                    <strong className="value">{albumInfo(selected.album).name || "—"}</strong>
                  </a>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "album", value: selected.album || "" })}>Edit</button>
                </div>
                <div className="card info-cell">
                  <span>Release date</span>
                  <strong className="value">{selected.releaseDate ? formatDate(selected.releaseDate) : "—"}</strong>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "releaseDate", value: selected.releaseDate || "" })}>Edit</button>
                </div>
                <div className="card info-cell">
                  <span>Company</span>
                  <strong className="company-name">{selected.company?.replace(/\s*\([^)]*\)/g, "").trim() || "—"}</strong>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "company", value: selected.company || "" })}>Edit</button>
                </div>
              </div>
              <div className="meta-grid meta-4">
                <div className="count info-cell">
                  <span className="count-label">Song length</span>
                  <strong>{formatDuration(selected.durationMs)}</strong>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "duration", value: formatDuration(selected.durationMs) === "—" ? "" : formatDuration(selected.durationMs) })}>Edit</button>
                </div>
                <div className="count info-cell">
                  <span className="count-label">List points</span>
                  <strong>{selected.listPoints?.trim() || "N/A"}</strong>
                  <button type="button" className="cell-edit" onClick={() => setFact({ field: "listPoints", value: selected.listPoints || "" })}>Edit</button>
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
              </div>
              {fact ? (
                <form
                  className="cell-pop"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = fact.value.trim();
                    setSongs((prev) => {
                      const next = prev.map((item) => {
                        if (item.id !== selected.id) return item;
                        if (fact.field === "duration") {
                          const durationMs = parseDuration(value);
                          return durationMs ? { ...item, durationMs, durationManual: true } : item;
                        }
                        if (fact.field === "listPoints") return { ...item, listPoints: value };
                        return { ...item, [fact.field]: value };
                      });
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                      return next;
                    });
                    setFact(null);
                  }}
                >
                  <label>
                    {fact.field === "album" ? "Album / EP" : fact.field === "releaseDate" ? "Release date" : fact.field === "company" ? "Company" : fact.field === "duration" ? "Song length" : "List points"}
                    <input
                      type={fact.field === "releaseDate" ? "date" : "text"}
                      placeholder={fact.field === "duration" ? "3:02" : fact.field === "listPoints" ? "N/A" : undefined}
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
                {selected.reactionUrl && youtubeId(selected.reactionUrl) ? (
                  <div className="reaction-head">
                    <div className="thoughts-head">
                      <span>My Reaction</span>
                      <span className="bulb film" aria-hidden="true">🎥</span>
                    </div>
                    <div className="reaction-frame">
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${youtubeId(selected.reactionUrl)}?rel=0&modestbranding=1`}
                        title={`${selected.title} reaction`}
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                ) : null}
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
              <GroupProfile artist={primaryArtist(selected.artist)} />
            </article>
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

      {editing && selected ? (
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
      ) : null}

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
            {song.rating > 0 ? <Stars rating={song.rating} /> : null}
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
    const reactionUrl = String(form.get("reactionUrl") ?? "").trim();
    onSave(
      {
        ...song,
        title,
        artist,
        album: String(form.get("album") ?? "").trim(),
        releaseDate: String(form.get("releaseDate") ?? "").trim(),
        rating: ratingFrom(form.get("rating")),
        notes: String(form.get("notes") ?? "").trim(),
        coverUrl,
        coverManual: Boolean(coverUrl && coverUrl !== song.coverUrl) || song.coverManual,
        clipStart,
        videoUrl: nextVideoUrl,
        videoId: nextVideoId,
        reactionUrl: reactionUrl || undefined,
        youtubeViews: videoChanged ? undefined : song.youtubeViews,
        youtubeAt: videoChanged ? undefined : song.youtubeAt,
      },
      Number.isFinite(nextPosition) ? nextPosition : position,
    );
  }

  const form = (
    <div className="modal edit-modal" role="presentation" onClick={onCancel}>
      <form
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
      >
      <h2>Edit {song.title}</h2>
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
        <select id="edit-rating" name="rating" defaultValue={song.rating > 0 ? String(song.rating) : "none"}>
          <option value="none">No rating</option>
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
        <label htmlFor="edit-clip">MV Preview</label>
        <input id="edit-clip" name="clipStart" placeholder="0:00.0" defaultValue={formatTimestamp(song.clipStart)} />
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
        <label htmlFor="edit-reaction">Reaction video</label>
        <input
          id="edit-reaction"
          name="reactionUrl"
          placeholder="Paste a YouTube link"
          defaultValue={song.reactionUrl ?? ""}
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
    </div>
  );
  return typeof document === "undefined" ? form : createPortal(form, document.body);
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
      fetchTrack(title, primaryArtist(artist)),
      fetchVideo(title, primaryArtist(artist)),
      lookupCompany(primaryArtist(artist), title),
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
        rating: ratingFrom(form.get("rating")),
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
          <select id="rating" name="rating" defaultValue="none">
            <option value="none">No rating</option>
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
          <label htmlFor="clipStart">MV Preview</label>
          <input id="clipStart" name="clipStart" placeholder="0:00.0" />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" />
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
