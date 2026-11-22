import { createServerFn } from "@tanstack/react-start";

export const getLyrics = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string; artist?: string; title?: string }) => data)
  .handler(async ({ data }) => {
    const { fetchLyricsFromGenius } = await import("./lyrics.server");
    return fetchLyricsFromGenius(data.url, data.artist ?? "", data.title ?? "");
  });

export const findLyrics = createServerFn({ method: "POST" })
  .inputValidator((data: { artist: string; title: string }) => data)
  .handler(async ({ data }) => {
    const { fetchLyricsFromGenius } = await import("./lyrics.server");
    return fetchLyricsFromGenius("", data.artist, data.title);
  });

export const englishFromSource = createServerFn({ method: "POST" })
  .inputValidator((data: { source?: string; lines: string[] }) => data)
  .handler(async ({ data }) => {
    const { englishForLines } = await import("./lyrics.server");
    return englishForLines(data.source ?? "", data.lines ?? []);
  });
