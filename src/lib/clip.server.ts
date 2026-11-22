import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, copyFile, unlink, stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const inflight = new Map<string, Promise<{ url: string }>>();

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

async function run(cmd: string, args: string[]) {
  await exec(cmd, args, { timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
}

export async function buildClip(videoId: string, start: number) {
  const id = safeId(videoId);
  const at = Math.max(0, Math.floor(Number(start) || 0));
  if (!id) throw new Error("Missing video id");
  const key = `${id}-${at}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const job = makeClip(id, at).finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

async function makeClip(id: string, start: number) {
  const dir = path.join(process.cwd(), "public", "clips");
  const name = `${id}-${start}.mp4`;
  const out = path.join(dir, name);
  if (existsSync(out)) {
    const info = await stat(out);
    if (info.size > 20_000) return { url: `/clips/${name}` };
  }
  await mkdir(dir, { recursive: true });
  const full = path.join("/tmp", `ytfull-${id}.mp4`);
  if (!existsSync(full) || (await stat(full).catch(() => ({ size: 0 }))).size < 50_000) {
    const attempts = [
      ["--extractor-args", "youtube:player_client=android", "-f", "18"],
      ["--extractor-args", "youtube:player_client=android", "-f", "b"],
      ["-f", "18"],
      ["-f", "b"],
    ];
    let saved = false;
    let lastError: unknown;
    for (const extra of attempts) {
      try {
        await run("yt-dlp", ["--no-warnings", "--force-overwrites", ...extra, "-o", full, `https://www.youtube.com/watch?v=${id}`]);
        if ((await stat(full).catch(() => ({ size: 0 }))).size > 50_000) {
          saved = true;
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (!saved) throw lastError instanceof Error ? lastError : new Error("Could not download the video");
  }
  const tmp = path.join("/tmp", `clip-${id}-${start}.mp4`);
  await run("ffmpeg", [
    "-y",
    "-ss",
    String(start),
    "-t",
    "10",
    "-i",
    full,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-vf",
    "scale=640:-2",
    "-movflags",
    "+faststart",
    tmp,
  ]);
  await copyFile(tmp, out);
  await unlink(tmp).catch(() => undefined);
  await rememberClip(id, start, `/clips/${name}`);
  return { url: `/clips/${name}` };
}

async function rememberClip(id: string, start: number, url: string) {
  const file = path.join(process.cwd(), "public", "clips", "catalog.json");
  let catalog: { videoId: string; start: number; url: string }[] = [];
  try {
    catalog = JSON.parse(await readFile(file, "utf8"));
  } catch {
    catalog = [];
  }
  const next = catalog.filter((item) => !(item.videoId === id && item.start === start));
  next.push({ videoId: id, start, url });
  await writeFile(file, JSON.stringify(next, null, 2));
}
