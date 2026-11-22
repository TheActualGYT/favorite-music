import { readFile } from "node:fs/promises";
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

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  return value || "";
}

async function readCommittedLibrary() {
  try {
    const raw = await readFile(new URL("../../data/library.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function readLibrary() {
  if (!databaseUrl()) {
    if (process.env.VERCEL) return readCommittedLibrary();
  }
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
  if (!databaseUrl() && process.env.VERCEL) {
    throw new Error("This Vercel project has no database yet, so new entries cannot be kept.");
  }
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
