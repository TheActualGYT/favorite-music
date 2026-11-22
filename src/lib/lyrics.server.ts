type LyricLine = { who: string; color: string; english: string; korean: string };
type Member = { name: string; color: string; photo?: string; focus?: string; zoom?: number; lines: number; words: number };
export type LyricsResult = { v: 11; source: string; lines: LyricLine[]; members: Member[] } | null;

const ALL = { name: "ALL", color: "#c8c8c8" };

const PHOTOS: Record<string, { url: string; focus: string; zoom: number }> = {
  bangchan: { url: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Bang_Chan_of_Stray_Kids%2C_October_15%2C_2025.png", focus: "center 24%", zoom: 1.18 },
  leeknow: { url: "https://kpopofficial.com/wp-content/uploads/2025/08/cover3-Stray-Kids-Lee-Know.webp", focus: "center 18%", zoom: 1.22 },
  changbin: { url: "https://upload.wikimedia.org/wikipedia/commons/d/d9/Changbin_of_Stray_Kids_at_the_40th_Golden_Disc_Awards%2C_January_10%2C_2026_%281%29.png", focus: "center 16%", zoom: 1.7 },
  hyunjin: { url: "https://newsimg.koreatimes.co.kr/2026/08/06/795d9ed6-e827-438c-afbe-62699581bce5.jpg?w=728", focus: "center 14%", zoom: 1.28 },
  han: { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQM3jiG9XPizWcLZ17tZlycSMkJI9FZSbev67H4At0F4zeRcncRscRyvRXf&s=10", focus: "center 28%", zoom: 1.35 },
  felix: { url: "https://images.prestigeonline.com/wp-content/uploads/sites/4/2024/08/02004502/stray-kids-felix-outfits-e1722401554467.jpg", focus: "38% 16%", zoom: 1.85 },
  seungmin: { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQfUOKzXw_lMDh_EDWMd4SOPAX3OasX3XXFVKwZw9lVf2QrewRQcLCABM0&s=10", focus: "center 28%", zoom: 1.35 },
  in: { url: "https://upload.wikimedia.org/wikipedia/commons/d/d2/I.N_of_Stray_Kids%2C_March_2%2C_2025.png", focus: "center 18%", zoom: 1.4 },
};

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function decode(value: string) {
  let text = value.replace(/<[^>]+>/g, "");
  for (let pass = 0; pass < 2; pass += 1) {
    const next = text
      .replace(/&amp;/g, "&")
      .replace(/&#8216;|&#8217;|&#39;|&rsquo;|&lsquo;|&apos;/g, "'")
      .replace(/&#8220;|&#8221;|&quot;|&ldquo;|&rdquo;/g, '"')
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
    if (next === text) break;
    text = next;
  }
  return text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\s+/g, " ").trim();
}

function wordsIn(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function photoFor(name: string) {
  return PHOTOS[norm(name)];
}

function titleCase(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fromGeniusUrl(url: string) {
  const slug = url.split("/").filter(Boolean).pop()?.replace(/-lyrics$/i, "") ?? "";
  const parts = slug.split("-").filter(Boolean);
  if (parts.length < 2) return { artist: "", title: "" };
  const artistParts = parts.slice(0, 2);
  const titleParts = parts.slice(2);
  return {
    artist: titleCase(artistParts.join(" ")),
    title: titleCase(titleParts.join(" ") || parts.slice(1).join(" ")),
  };
}

async function getText(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; GarrettKpopDatabase/1.0)", accept: "text/html,application/json" },
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  }
}

async function lyricsProsPage(artist: string, title: string) {
  const search = await getText(`https://lyricspros.com/?s=${encodeURIComponent(`${artist} ${title}`)}`);
  const links = [...search.matchAll(/href="(https:\/\/lyricspros.com\/[^"]+-lyrics\/)"/g)].map((match) => match[1]);
  const wanted = norm(title);
  return [...new Set(links)].find((link) => norm(decodeURIComponent(link)).includes(wanted)) ?? null;
}

function parsePros(html: string) {
  const start = html.indexOf("<h3");
  if (start < 0) return [] as string[];
  const lines: string[] = [];
  for (const match of html.slice(start, start + 40000).matchAll(/<p[^>]*>\s*<strong>(.*?)<\/strong>/g)) {
    const text = decode(match[1] ?? "");
    if (text && !text.startsWith("[")) lines.push(text);
  }
  return lines;
}

function cleanName(value: string) {
  return decode(value).replace(/^[^\p{L}\p{N}.]+|[^\p{L}\p{N}.]+$/gu, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function normTitle(title: string) {
  return norm(title.replace(/&/g, "and").replace(/\s*\([^)]*\)/g, ""));
}

function titleInSlug(slug: string, title: string) {
  const key = normTitle(title);
  if (key.length < 2) return false;
  const body = norm(decodeURIComponent(slug));
  let from = 0;
  while (from <= body.length) {
    const at = body.indexOf(key, from);
    if (at < 0) return false;
    const next = body.slice(at + key.length);
    if (!next || /^(english|ver|inst|remix|feat|japanese|korean|acoustic|live|member|prod|version)/.test(next)) return true;
    from = at + 1;
  }
  return false;
}

function artistInSlug(slug: string, artist: string) {
  const body = norm(decodeURIComponent(slug));
  const key = norm(artist);
  const aliases = new Set<string>([key]);
  if (key === "idle" || key === "gidle" || /i-?dle/i.test(artist)) {
    aliases.add("idle");
    aliases.add("gidle");
  }
  if (key === "bts" || key.includes("bangtan")) aliases.add("bts");
  return [...aliases].some((item) => item.length >= 2 && body.includes(item));
}

async function colorCodedPage(artist: string, title: string) {
  const bare = title.replace(/\s*\([^)]*\)/g, "").trim();
  const queries = [...new Set([`${artist} ${title}`.trim(), `${artist} ${bare}`.trim(), bare, title.trim()].filter(Boolean))];
  let found = "";
  for (const query of queries) {
    const raw = await getText(`https://colorcodedlyrics.com/wp-json/wp/v2/posts?search=${encodeURIComponent(query)}&per_page=8&_fields=link,slug`);
    let posts: { link?: string; slug?: string }[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) posts = parsed as { link?: string; slug?: string }[];
    } catch {
      posts = [];
    }
    for (const post of posts) {
      const slug = post.slug || "";
      const link = post.link || "";
      if (!link || !titleInSlug(slug, bare || title) || !artistInSlug(slug, artist)) continue;
      const score = /english/.test(slug) ? 2 : 3;
      if (score === 3) return link;
      if (!found) found = link;
    }
  }
  return found || null;
}

function sliceSection(html: string, startMarker: string, endMarkers: string[]) {
  const start = html.indexOf(startMarker);
  if (start < 0) return "";
  const ends = endMarkers.map((marker) => html.indexOf(marker, start + startMarker.length)).filter((index) => index > start);
  return html.slice(start, ends.length ? Math.min(...ends) : start + 28000);
}

function coloredLines(section: string) {
  const lines: { color: string; text: string }[] = [];
  for (const match of section.matchAll(/<span style="color:\s*(#[0-9a-fA-F]{3,8});?">([\s\S]*?)<\/span>/gi)) {
    const text = decode(match[2]);
    if (!text || text.length < 2) continue;
    lines.push({ color: match[1].toLowerCase(), text });
  }
  return lines;
}

function plainLines(section: string) {
  const lines: string[] = [];
  for (const block of section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    for (const part of block[1].split(/<br\s*\/?>/i)) {
      const text = decode(part);
      if (text) lines.push(text);
    }
  }
  return lines;
}

function finish(source: string, texts: string[], colorHtml: string): LyricsResult {
  const memberBlock = colorHtml.match(/<p style="text-align:\s*center;">([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const members = [...memberBlock.matchAll(/<span style="color:\s*(#[0-9a-fA-F]{3,8});?">([^<]+)<\/span>/gi)].map((match) => ({
    color: match[1].toLowerCase(),
    name: decode(match[2]).toUpperCase(),
  }));
  const colorToName = new Map(members.map((member) => [member.color, member.name]));
  const colored = colorHtml
    ? [
        ...coloredLines(sliceSection(colorHtml, ">Romanization<", [">Hangul<", ">Korean<", ">Translation<"])),
        ...coloredLines(sliceSection(colorHtml, ">Hangul<", [">Translation<", ">More songs"])),
      ]
    : [];
  const english = colorHtml ? plainLines(sliceSection(colorHtml, ">Translation<", [">More songs", "###"])) : [];
  const used = new Set<number>();
  const lines: LyricLine[] = texts.map((text, index) => {
    const matchAt = colored.findIndex((item, at) => !used.has(at) && norm(item.text) === norm(text));
    const match = matchAt >= 0 ? colored[matchAt] : undefined;
    if (matchAt >= 0) used.add(matchAt);
    const who = match ? colorToName.get(match.color) ?? ALL.name : ALL.name;
    return {
      who,
      color: match && colorToName.has(match.color) ? match.color : ALL.color,
      english: english[index] || text,
      korean: text,
    };
  });
  const totals = new Map<string, Member>();
  for (const member of members) {
    const photo = photoFor(member.name);
    totals.set(member.name, { name: member.name, color: member.color, photo: photo?.url, focus: photo?.focus, zoom: photo?.zoom, lines: 0, words: 0 });
  }
  for (const line of lines) {
    if (line.who === ALL.name) continue;
    const photo = photoFor(line.who);
    const current = totals.get(line.who) ?? { name: line.who, color: line.color, photo: photo?.url, focus: photo?.focus, zoom: photo?.zoom, lines: 0, words: 0 };
    current.lines += 1;
    current.words += wordsIn(line.korean);
    totals.set(line.who, current);
  }
  return {
    v: 11,
    source,
    lines,
    members: [...totals.values()].filter((member) => member.lines > 0).sort((a, b) => b.lines - a.lines || b.words - a.words),
  };
}

function lineParts(part: string) {
  const segments: { color?: string; text: string }[] = [];
  const stack: string[] = [];
  for (const token of part.matchAll(/<span\b[^>]*color:\s*(#[0-9a-fA-F]{3,8})[^>]*>|<\/span>|<[^>]+>|[^<]+/gi)) {
    const raw = token[0];
    const open = raw.match(/^<span\b[^>]*color:\s*(#[0-9a-fA-F]{3,8})/i);
    if (open) {
      stack.push(open[1].toLowerCase());
      continue;
    }
    if (/^<\/span>/i.test(raw)) {
      stack.pop();
      continue;
    }
    if (raw.startsWith("<")) continue;
    const text = decode(raw);
    if (!text) continue;
    const color = stack.at(-1);
    const last = segments.at(-1);
    if (last && last.color === color) last.text = `${last.text} ${text}`.replace(/\s+/g, " ").trim();
    else segments.push({ color, text });
  }
  return segments;
}

function sectionLines(section: string) {
  const lines: { color?: string; text: string }[] = [];
  for (const block of section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    for (const part of block[1].split(/<br\s*\/?>/i)) {
      const segments = lineParts(part);
      if (!segments.length) continue;
      const body = segments.filter((segment) => !/^\(.*\)$/.test(segment.text));
      const lead = [...(body.length ? body : segments)].sort((a, b) => b.text.length - a.text.length)[0];
      const text = segments.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
      if (!text || /^(hangul|romanization|translation|korean)$/i.test(text) || /^['".,!?…\-–—]+$/.test(text)) continue;
      lines.push({ color: lead?.color, text });
    }
  }
  return lines;
}

function isCredit(text: string) {
  return /^(credits?|rom:|eng:|info:|source:|disclaimer|translation:|romanization:)/i.test(text) || /colorcodedlyrics\.com/i.test(text);
}

function pairEnglish(korean: string[], english: string[]) {
  const clean = english.map((line) => line.trim()).filter((line) => line && !isCredit(line) && !/for further information/i.test(line));
  if (clean.length < korean.length) return null;
  const take = clean.slice(0, korean.length);
  const comparable = korean.filter((line) => !/[가-힣]/.test(line));
  if (!comparable.length) return null;
  const matched = comparable.filter((line, index) => {
    const at = korean.indexOf(line);
    return norm(line) === norm(take[at] || "");
  }).length;
  return matched / comparable.length >= 0.9 ? take : null;
}

async function translateLines(lines: string[]) {
  const next = [...lines];
  const jobs = lines.map((line, index) => ({ line, index })).filter((item) => /[가-힣]/.test(item.line));
  for (let start = 0; start < jobs.length; start += 24) {
    const part = jobs.slice(start, start + 24);
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=en&dt=t&q=${encodeURIComponent(part.map((item) => item.line).join("\n"))}`);
      if (!res.ok) continue;
      const data = (await res.json()) as [Array<[string]>];
      const text = (data?.[0] ?? []).map((seg) => seg?.[0] ?? "").join("");
      const pieces = text.split("\n");
      if (pieces.length !== part.length) continue;
      part.forEach((item, index) => {
        const line = pieces[index]?.trim();
        if (line) next[item.index] = line;
      });
    } catch {
      /* keep the original line */
    }
  }
  return next;
}

function looseLyrics(html: string) {
  const entryAt = html.indexOf("entry-content");
  const entry = entryAt >= 0 ? html.slice(entryAt, entryAt + 80000) : html;
  const stop = entry.search(/More songs|Similar Posts|ccl-more-artist/i);
  const body = stop > 0 ? entry.slice(0, stop) : entry;
  const legend = [...body.matchAll(/<(p|td)[^>]*text-align:\s*center[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => [...match[2].matchAll(/<span[^>]*color:\s*(#[0-9a-fA-F]{3,8})[^>]*>([^<]+)<\/span>/gi)].map((item) => ({
      color: item[1].toLowerCase(),
      name: cleanName(item[2]),
    })).filter((item) => item.name && item.name.length < 24 && !/^(ENGLISH|HANGUL|KOREAN|ROMANIZATION|TRANSLATION)$/.test(item.name)))
    .find((items) => items.length >= 3) ?? [];
  const chunks: { kind: string; lines: { color?: string; text: string }[] }[] = [];
  let kind = "lyrics";
  for (const block of body.matchAll(/<(p|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const plain = decode(block[2].replace(/<br\s*\/?>/gi, " "));
    const heading = plain.trim().toLowerCase();
    if (/^(english|eng|hangul|korean|romanization|translation)$/.test(heading) || /^(english|hangul|korean|romanization|translation)\b/.test(heading) && plain.length < 24) {
      kind = heading.startsWith("eng") ? "english" : heading.startsWith("trans") ? "translation" : heading.startsWith("rom") ? "roman" : "hangul";
      chunks.push({ kind, lines: [] });
      continue;
    }
    const lines = sectionLines(`<p>${block[2]}</p>`).filter((line) => line.color && line.text.length > 1);
    if (!lines.length) continue;
    const current = chunks.at(-1);
    if (!current || current.kind !== kind) chunks.push({ kind, lines: [] });
    chunks.at(-1)?.lines.push(...lines);
  }
  const hangul = chunks.find((chunk) => chunk.kind === "hangul" && chunk.lines.some((line) => /[가-힣]/.test(line.text)));
  const english = chunks.find((chunk) => chunk.kind === "english" && chunk.lines.length > 3);
  const spoken = hangul?.lines.length ? hangul.lines : english?.lines.length ? english.lines : chunks.flatMap((chunk) => chunk.lines).filter((line) => /[가-힣]/.test(line.text));
  const translation = chunks.find((chunk) => chunk.kind === "translation")?.lines.map((line) => line.text) ?? [];
  return { legend, spoken, translation };
}

export async function englishForLines(source: string, korean: string[]) {
  if (!korean.length) return korean;
  if (source) {
    const html = await getText(source);
    if (html) {
      const paired = pairEnglish(korean, sectionLines(sliceSection(html, ">Translation<", [">More songs", "###"])).map((line) => line.text));
      if (paired && paired.every((line, index) => !/[가-힣]/.test(korean[index]) || line !== korean[index])) return paired;
    }
  }
  return translateLines(korean);
}

const PALETTE = ["#ff4d4d", "#ff8a1e", "#ffe14a", "#3ddc78", "#00ffff", "#3d7dff", "#b06bff", "#ff6bb5"];

function lyricSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isGenius(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "genius.com";
  } catch {
    return false;
  }
}

function geniusPageUrl(artist: string, title: string) {
  const path = `${lyricSlug(artist)}-${lyricSlug(title)}-lyrics`.replace(/^-|-$/g, "");
  return path.length > 8 ? `https://genius.com/${path}` : "";
}

type GeniusStyle = "plain" | "italic" | "bold" | "both";
type GeniusRoles = Record<GeniusStyle, string[]>;

function emptyRoles(): GeniusRoles {
  return { plain: [], italic: [], bold: [], both: [] };
}

function headerRoles(raw: string): GeniusRoles {
  const roles = emptyRoles();
  const after = raw.split(":").slice(1).join(":");
  if (!after.trim()) return roles;
  for (const part of after.split(",")) {
    const name = cleanName(decode(part.replace(/<[^>]+>/g, "").replace(/\*/g, "")));
    if (!name || name.length > 24 || /^(VERSE|CHORUS|PRE CHORUS|POST CHORUS|BRIDGE|OUTRO|INTRO|HOOK|REFRAIN|BREAK|INTERLUDE)$/.test(name)) continue;
    const hasBold = /<b>|\*\*/i.test(part);
    const hasItalic = /<i>|(^|[^*])\*(?!\*)/i.test(part);
    const bucket: GeniusStyle = hasBold && hasItalic ? "both" : hasBold ? "bold" : hasItalic ? "italic" : "plain";
    if (!roles[bucket].includes(name)) roles[bucket].push(name);
  }
  return roles;
}

function styleName(roles: GeniusRoles, style: GeniusStyle) {
  const order: GeniusStyle[] = style === "both"
    ? ["both", "bold", "italic", "plain"]
    : style === "bold"
      ? ["bold", "plain", "italic", "both"]
      : style === "italic"
        ? ["italic", "plain", "bold", "both"]
        : ["plain", "italic", "bold", "both"];
  for (const key of order) {
    if (!roles[key].length) continue;
    return roles[key][0];
  }
  return "";
}

function geniusJunk(line: string) {
  return /don'?t edit|do not edit|contributors|you might also like|translations|recommended songs/i.test(line)
    || /^(romanization|english|hangul|korean)$/i.test(line);
}

function parseGenius(html: string, source: string): LyricsResult {
  const markers = [...html.matchAll(/data-lyrics-container="true"/g)].map((match) => match.index ?? 0);
  if (!markers.length) return null;
  const blocks: string[] = [];
  for (let index = 0; index < markers.length && index < 8; index += 1) {
    const from = markers[index];
    const open = html.indexOf(">", from);
    if (open < 0 || open > from + 400) continue;
    const end = markers[index + 1] ?? open + 20000;
    blocks.push(html.slice(open + 1, Math.min(end, open + 20000)));
  }
  const colors = new Map<string, string>();
  const lines: LyricLine[] = [];
  let roles = emptyRoles();
  let bold = 0;
  let italic = 0;
  let header = "";
  let inHeader = false;
  let segments: { style: GeniusStyle; text: string }[] = [];
  const colorFor = (who: string) => {
    const name = who.split(/\s+&\s+/)[0];
    if (!colors.has(name)) colors.set(name, name === ALL.name ? ALL.color : PALETTE[(colors.size) % PALETTE.length]);
    return colors.get(name) ?? ALL.color;
  };
  const flush = () => {
    const text = decode(segments.map((segment) => segment.text).join(""));
    const taken = segments;
    segments = [];
    if (!text || geniusJunk(text) || text.length > 180) return "keep" as const;
    if (/^(embed|cancel|about|credits|tags|expand|comments)$/i.test(text)) return "stop" as const;
    const weights: Record<GeniusStyle, number> = { plain: 0, italic: 0, bold: 0, both: 0 };
    let paren = 0;
    for (const segment of taken) {
      for (const char of segment.text) {
        if (char === "(") paren += 1;
        else if (char === ")") paren = Math.max(0, paren - 1);
        else if (!paren && !/\s/.test(char)) weights[segment.style] += 1;
      }
    }
    const style = (Object.entries(weights) as [GeniusStyle, number][]).sort((a, b) => b[1] - a[1])[0][0];
    const who = styleName(roles, weights[style] > 0 ? style : "plain");
    if (!who) return "keep" as const;
    lines.push({ who, color: colorFor(who), korean: text, english: text });
    return "keep" as const;
  };
  for (const token of blocks.join("\n").matchAll(/<br\s*\/?>|<\/?i>|<\/?b>|<[^>]+>|[^<]+/gi)) {
    const raw = token[0];
    if (/^<br/i.test(raw)) {
      if (flush() === "stop") break;
      continue;
    }
    if (/^<\/?(?:i|b)>$/i.test(raw)) {
      if (inHeader) header += raw;
      if (/^<i>$/i.test(raw)) italic += 1;
      else if (/^<\/i>$/i.test(raw)) italic = Math.max(0, italic - 1);
      else if (/^<b>$/i.test(raw)) bold += 1;
      else bold = Math.max(0, bold - 1);
      continue;
    }
    if (raw.startsWith("<")) continue;
    const style: GeniusStyle = bold && italic ? "both" : bold ? "bold" : italic ? "italic" : "plain";
    let rest = raw;
    while (rest) {
      if (inHeader) {
        const end = rest.indexOf("]");
        header += end < 0 ? rest : rest.slice(0, end);
        if (end < 0) break;
        const next = headerRoles(header);
        if (Object.values(next).some((names) => names.length)) roles = next;
        header = "";
        inHeader = false;
        rest = rest.slice(end + 1);
        continue;
      }
      const start = rest.indexOf("[");
      if (start < 0) {
        if (rest.trim()) segments.push({ style, text: rest });
        break;
      }
      if (start > 0 && rest.slice(0, start).trim()) segments.push({ style, text: rest.slice(0, start) });
      inHeader = true;
      header = "";
      rest = rest.slice(start + 1);
    }
  }
  flush();
  if (lines.length < 4) return null;
  return { v: 11, source, lines, members: [] };
}

function shareGroupLines(result: LyricsResult): LyricsResult {
  if (!result) return result;
  const names: string[] = [];
  const remember = (name: string) => {
    const clean = name.replace(/[,:;]+$/g, "").trim();
    if (!clean || clean === ALL.name || names.includes(clean)) return;
    names.push(clean);
  };
  for (const member of result.members) remember(member.name);
  for (const line of result.lines) {
    if (line.who === ALL.name) continue;
    line.who.split(/\s+&\s+/).forEach(remember);
  }
  const totals = new Map<string, Member>();
  for (const name of names) {
    const existing = result.members.find((member) => member.name === name);
    totals.set(name, {
      name,
      color: existing?.color || result.lines.find((line) => line.who === name)?.color || ALL.color,
      photo: existing?.photo,
      focus: existing?.focus,
      zoom: existing?.zoom,
      lines: 0,
      words: 0,
    });
  }
  for (const line of result.lines) {
    const credited = line.who === ALL.name ? names : line.who.split(/\s+&\s+/);
    for (const name of credited) {
      const current = totals.get(name);
      if (!current) continue;
      current.lines += 1;
      current.words += wordsIn(line.korean);
    }
  }
  result.members = [...totals.values()].filter((member) => member.name !== ALL.name && member.lines > 0).sort((a, b) => b.lines - a.lines || b.words - a.words);
  return result;
}

async function archivedGenius(pageUrl: string) {
  let hostPath = pageUrl;
  try {
    const url = new URL(pageUrl);
    hostPath = `${url.hostname.replace(/^www\./, "")}${url.pathname}`;
  } catch {
    return "";
  }
  const cdx = await getText(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(hostPath)}&output=json&fl=timestamp,statuscode&filter=statuscode:200&limit=12`);
  let rows: string[][] = [];
  try {
    const parsed: unknown = JSON.parse(cdx);
    if (Array.isArray(parsed)) rows = parsed as string[][];
  } catch {
    rows = [];
  }
  const stamp = rows.slice(1).map((row) => row[0]).filter(Boolean).sort().at(-1);
  if (!stamp) return "";
  return getText(`https://web.archive.org/web/${stamp}/${pageUrl}`);
}

async function loadGenius(url: string, artist: string, title: string): Promise<LyricsResult> {
  const pages = [...new Set([isGenius(url) ? url.split("?")[0] : "", geniusPageUrl(artist, title)].filter(Boolean))];
  for (const page of pages) {
    let html = await getText(page);
    if (!html.includes("data-lyrics-container")) html = await archivedGenius(page);
    const parsed = html ? parseGenius(html, page) : null;
    if (!parsed) continue;
    const english = await translateLines(parsed.lines.map((line) => line.korean));
    english.forEach((line, index) => {
      parsed.lines[index].english = line || parsed.lines[index].korean;
    });
    const totals = new Map<string, Member>();
    for (const line of parsed.lines) {
      const current = totals.get(line.who) ?? { name: line.who, color: line.color, lines: 0, words: 0 };
      current.lines += 1;
      current.words += wordsIn(line.korean);
      totals.set(line.who, current);
    }
    parsed.members = [...totals.values()].sort((a, b) => b.lines - a.lines || b.words - a.words);
    return shareGroupLines(parsed);
  }
  return null;
}

function isColorCoded(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host === "colorcodedlyrics.com";
  } catch {
    return false;
  }
}

export async function fetchLyricsFromGenius(url: string, artist: string, title: string): Promise<LyricsResult> {
  const parsed = fromGeniusUrl(url);
  const useArtist = artist || parsed.artist;
  const useTitle = title || parsed.title;
  const page = isColorCoded(url) ? url.split("#")[0] : await colorCodedPage(useArtist, useTitle);
  if (!page) return loadGenius(isGenius(url) ? url : "", useArtist, useTitle);
  const html = await getText(page);
  if (!html) return loadGenius("", useArtist, useTitle);
  const legendHtml = [...html.matchAll(/<(p|td)[^>]*text-align:\s*center[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => match[2])
    .find((block) => (block.match(/color:\s*#[0-9a-fA-F]{3,8}/gi) || []).length >= 3) ?? "";
  let legendMembers = [...legendHtml.matchAll(/<span style="color:\s*(#[0-9a-fA-F]{3,8});?">([^<]+)<\/span>/gi)].map((match) => ({
    color: match[1].toLowerCase(),
    name: cleanName(match[2]),
  })).filter((member) => member.name);
  const hangulSection = sliceSection(html, ">Hangul<", [">Translation<", ">More songs"]);
  const romanSection = sliceSection(html, ">Romanization<", [">Hangul<", ">Translation<"]);
  const marked = sectionLines(hangulSection).some((line) => line.color) ? sectionLines(hangulSection) : sectionLines(romanSection);
  let spoken = marked.filter((line) => line.text);
  let translatedLines = sectionLines(sliceSection(html, ">Translation<", [">More songs", "###"])).map((line) => line.text);
  if (!spoken.length) {
    const loose = looseLyrics(html);
    if (loose.legend.length) legendMembers = loose.legend;
    spoken = loose.spoken;
    translatedLines = loose.translation;
  }
  if (!spoken.length) return loadGenius("", useArtist, useTitle);
  const colorToName = new Map(legendMembers.map((member) => [member.color, member.name]));
  const lines: LyricLine[] = spoken.map((line) => ({
    who: colorToName.get(line.color ?? "") ?? ALL.name,
    color: line.color ?? ALL.color,
    korean: line.text,
    english: line.text,
  }));
  const translated = pairEnglish(lines.map((line) => line.korean), translatedLines);
  const english = translated && translated.every((line, index) => !/[가-힣]/.test(lines[index].korean) || line !== lines[index].korean)
    ? translated
    : await translateLines(lines.map((line) => line.korean));
  english.forEach((line, index) => { lines[index].english = line || lines[index].korean; });
  const totals = new Map<string, Member>();
  for (const member of legendMembers) {
    const photo = photoFor(member.name);
    totals.set(member.name, { name: member.name, color: member.color, photo: photo?.url, focus: photo?.focus, zoom: photo?.zoom, lines: 0, words: 0 });
  }
  for (const line of lines) {
    if (line.who === ALL.name) continue;
    const photo = photoFor(line.who);
    const current = totals.get(line.who) ?? { name: line.who, color: line.color, photo: photo?.url, focus: photo?.focus, zoom: photo?.zoom, lines: 0, words: 0 };
    current.lines += 1;
    current.words += wordsIn(line.korean);
    totals.set(line.who, current);
  }
  return shareGroupLines({
    v: 11,
    source: page,
    lines,
    members: [...totals.values()].sort((a, b) => b.lines - a.lines || b.words - a.words),
  });
}
