import { createServerFn } from "@tanstack/react-start";

export const ensureClip = createServerFn({ method: "POST" })
  .inputValidator((data: { videoId: string; start?: number }) => data)
  .handler(async ({ data }) => {
    const { buildClip } = await import("./clip.server");
    return buildClip(data.videoId, data.start ?? 18);
  });
