import { createServerFn } from "@tanstack/react-start";

export const getCompany = createServerFn({ method: "POST" })
  .inputValidator((data: { artist: string; title?: string }) => data)
  .handler(async ({ data }) => {
    const { fetchCompany } = await import("./company.server");
    return fetchCompany(data.artist, data.title);
  });
