import { createServerFn } from "@tanstack/react-start";

export const getIdolPhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const { fetchIdolPhoto } = await import("./group.server");
    return fetchIdolPhoto(data.name);
  });

export const getGroup = createServerFn({ method: "POST" })
  .inputValidator((data: { artist: string }) => data)
  .handler(async ({ data }) => {
    const { fetchGroup } = await import("./group.server");
    return fetchGroup(data.artist);
  });
