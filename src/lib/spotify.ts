import { createServerFn } from "@tanstack/react-start";

export const getSpotifyStreams = createServerFn({ method: "POST" })
  .inputValidator((data: { artist: string }) => data)
  .handler(async ({ data }) => {
    const { fetchSpotifyStreams } = await import("./counts.server");
    return fetchSpotifyStreams(data.artist);
  });
