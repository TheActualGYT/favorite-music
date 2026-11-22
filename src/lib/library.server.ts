import { getSql } from "./db";

const KEYS = [
  "favoriteSongs",
  "gyt-group-roster",
  "gyt-bias",
  "gyt-member-colors",
  "gyt-idol-photos",
  "gyt-profile-crops",
  "gyt-lyric-crops",
  "gyt-profile-info",
] as const;

export type LibraryKey = (typeof KEYS)[number];

function isKey(value: string): value is LibraryKey {
  return (KEYS as readonly string[]).includes(value);
}

function asJson(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value ?? null;
}

export async function readLibrary() {
  const sql = await getSql();
  const rows = await sql<{ key: string; data: unknown }>`select key, data from library`;
  const data: Record<string, unknown> = {};
  for (const row of rows) {
    if (!isKey(row.key)) continue;
    const parsed = asJson(row.data);
    if (parsed !== null) data[row.key] = parsed;
  }
  return data;
}

export async function writeLibrary(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const entries = Object.entries(input as Record<string, unknown>).filter(([key]) => isKey(key));
  if (!entries.length) return;
  const encoded = JSON.stringify(Object.fromEntries(entries));
  if (encoded.length > 6_000_000) throw new Error("Library is too large to save");
  const sql = await getSql();
  for (const [key, value] of entries) {
    await sql`
      insert into library (key, data)
      values (${key}, ${JSON.stringify(value)}::jsonb)
      on conflict (key) do update
      set data = excluded.data, updated_at = now()
    `;
  }
}
