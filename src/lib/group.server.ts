export type GroupMember = {
  name: string;
  born: string;
  role: string;
  country: string;
  photo: string;
};

export type GroupPage = { company: string | null; members: GroupMember[] };

const cache = new Map<string, { at: number; value: GroupPage }>();
const DAY = 12 * 60 * 60 * 1000;
const DISTRIBUTORS =
  /republic|columbia|warner|universal|sony music|\brca\b|kakao|genie|stone music|dreamus|virgin|avex|orchard|interscope|geffen|atlantic|capitol|polydor|def jam|island records/;
const COUNTRIES = [
  "South Korea",
  "North Korea",
  "Japan",
  "Australia",
  "United States",
  "Canada",
  "China",
  "Taiwan",
  "Thailand",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Vietnam",
  "New Zealand",
  "Hong Kong",
  "Singapore",
  "United Kingdom",
];

function keyOf(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function topRole(positions: string) {
  const parts = positions.split(",").map((part) => part.trim()).filter(Boolean);
  const rank = ["leader", "captain", "main vocalist", "main rapper", "main dancer", "lead vocalist", "lead rapper", "lead dancer"];
  for (const role of rank) {
    const hit = parts.find((part) => part.toLowerCase() === role);
    if (hit) return hit;
  }
  return parts[0] ?? "";
}

function photoFrom(url: string) {
  const encoded = url.match(/[?&]url=([^&]+)/)?.[1];
  return encoded ? decodeURIComponent(encoded) : url;
}

export function parseGroup(markdown: string): GroupPage {
  const members: GroupMember[] = [];
  const seen = new Set<string>();
  const re = new RegExp(
    `!\\[Image \\d+: ([^\\]]+)\\]\\((https://kpopping\\.com/_next/image\\?[^)]+)\\)\\s+\\1 Born ([A-Za-z]{3,9} \\d{1,2}, \\d{4}) Age \\d+ (.+?) (${COUNTRIES.join("|")})\\]`,
    "g",
  );
  for (const match of markdown.matchAll(re)) {
    const name = match[1].trim();
    const id = keyOf(name);
    if (seen.has(id)) continue;
    seen.add(id);
    members.push({
      name,
      born: match[3],
      role: topRole(match[4]),
      country: match[5],
      photo: photoFrom(match[2]),
    });
  }
  const companies = [...markdown.matchAll(/\[([^\]]+)\]\(https:\/\/kpopping\.com\/companies\/[^)]+\)\s*Current/g)].map((match) =>
    match[1].trim(),
  );
  const company = companies.find((name) => !DISTRIBUTORS.test(name.toLowerCase())) ?? null;
  return { company, members };
}

async function readPage(artist: string) {
  const clean = artist.trim();
  const slugs = [...new Set([clean, clean.replace(/\s+/g, "-"), clean.replace(/\s+/g, "")])];
  for (const slug of slugs) {
    const res = await fetch(`https://r.jina.ai/https://kpopping.com/profiles/group/${encodeURIComponent(slug)}`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/plain" },
    });
    if (!res.ok) continue;
    const text = await res.text();
    if (!/## Members/.test(text) || !/Born /.test(text)) continue;
    return text;
  }
  return "";
}

export async function fetchIdolPhoto(name: string) {
  const slug = name.trim().replace(/[,:;]+$/g, "").replace(/[.'’]/g, "").replace(/\s+/g, "-");
  if (!slug) return "";
  const res = await fetch(`https://r.jina.ai/https://kpopping.com/profiles/idol/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": "Mozilla/5.0", accept: "text/plain" },
  });
  if (!res.ok) return "";
  const text = await res.text();
  return text.match(/https:\/\/cdn\.kpopping\.com\/[^)\s"]+?\.(?:jpe?g|png|webp)/i)?.[0] ?? "";
}

export async function fetchGroup(artist: string): Promise<GroupPage> {
  const term = artist.trim();
  if (!term) return { company: null, members: [] };
  const key = keyOf(term);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < DAY) return cached.value;
  const text = await readPage(term);
  const value = text ? parseGroup(text) : { company: null, members: [] };
  if (value.company || value.members.length) cache.set(key, { at: Date.now(), value });
  return value;
}
