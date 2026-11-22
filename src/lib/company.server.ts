type CompanyInfo = { company: string; subLabel?: string };

const cache = new Map<string, { at: number; value: CompanyInfo | null }>();
const DAY = 12 * 60 * 60 * 1000;
const DISTRIBUTORS =
  /republic|columbia|warner|universal music|sony music|interscope|epic records|\batlantic\b|geffen|\brca\b|capitol|orchard|kakao|genie music|stone music|dreamus|virgin|polydor|island records|88rising|avex|def jam/;
const PEOPLE = /j\.?\s*y\.?\s*park|bang si[- ]hyuk|lee soo[- ]man|park jin[- ]young|yang hyun[- ]suk/;

function keyOf(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanName(value: string) {
  return value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function isDistributor(value: string) {
  return DISTRIBUTORS.test(value) || PEOPLE.test(value);
}

async function getJson(url: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(url, {
      headers: { "user-agent": "GarrettKpopDatabase/1.0 (personal kpop database)", accept: "application/json" },
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

function labelsFromWiki(wikitext: string) {
  const fields = [...wikitext.matchAll(/\|\s*(?:current_label|record_label|label)\s*=\s*([\s\S]*?)(?=\n\s*\|)/gi)].map(
    (match) => match[1],
  );
  const names: string[] = [];
  for (const field of fields) {
    const cleaned = field.replace(/<ref[\s\S]*?<\/ref>/gi, " ").replace(/<ref[^>]*\/>/gi, " ");
    const links = [...cleaned.matchAll(/\[\[([^\]|#]+)/g)].map((item) => cleanName(item[1]));
    const plain = cleaned
      .replace(/\{\{[^{}]*\}\}/g, " ")
      .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, " $1 ")
      .replace(/\[\[([^\]]+)\]\]/g, " $1 ")
      .split(/\n|\*|\|/)
      .map((item) => cleanName(item.replace(/<[^>]+>/g, "")))
      .filter((item) => item.length > 1 && !/^(hlist|flatlist|ubl|plainlist)$/i.test(item));
    names.push(...links, ...plain);
  }
  const unique: string[] = [];
  for (const name of names) {
    const label = keyOf(name) === "s2" ? "S2 Entertainment" : name;
    if (!label || unique.some((item) => keyOf(item) === keyOf(label))) continue;
    unique.push(label);
  }
  return unique;
}

function pick(names: string[]): CompanyInfo | null {
  const agencies = names.filter((name) => !isDistributor(name));
  const chosen = agencies.length ? agencies : names;
  if (!chosen.length) return null;
  return { company: chosen[0].replace(/\s*\([^)]*\)/g, "").trim() };
}

async function wikiLabels(title: string) {
  const parsed = (await getJson(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&redirects=1&format=json`,
  )) as { parse?: { wikitext?: { "*"?: string } } } | null;
  const text = parsed?.parse?.wikitext?.["*"];
  if (!text) return null;
  return pick(labelsFromWiki(text));
}

function pageKey(title: string) {
  return keyOf(title.replace(/\s*\([^)]*\)/g, ""));
}

function isWorkPage(title: string) {
  return /\((song|album|ep|single|film|soundtrack|musical|album)\)/i.test(title);
}

async function fromWikipedia(artist: string): Promise<CompanyInfo | null> {
  const wanted = keyOf(artist);
  for (const query of [`${artist} south korean group`, `${artist} girl group`, `intitle:"${artist}"`]) {
    const search = (await getJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&format=json`,
    )) as { query?: { search?: { title: string }[] } } | null;
    const hits = (search?.query?.search ?? []).filter((hit) => pageKey(hit.title) === wanted && !isWorkPage(hit.title));
    hits.sort((a, b) => {
      const score = (title: string) => (/\((group|band|singer)\)/i.test(title) ? 0 : 1);
      return score(a.title) - score(b.title);
    });
    if (!hits[0]) continue;
    const info = await wikiLabels(hits[0].title);
    if (info) return info;
  }
  return null;
}

async function fromMusicBrainz(artist: string): Promise<CompanyInfo | null> {
  const search = (await getJson(
    `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${artist}"`)}&fmt=json`,
  )) as { artists?: { id: string; name: string; type?: string; country?: string }[] } | null;
  const artists = search?.artists ?? [];
  const wanted = keyOf(artist);
  const match =
    artists.find((item) => item.type === "Group" && keyOf(item.name) === wanted && item.country === "KR") ??
    artists.find((item) => item.type === "Group" && keyOf(item.name) === wanted) ??
    artists.find((item) => keyOf(item.name) === wanted && item.type !== "Person");
  if (!match) return null;
  const detail = (await getJson(`https://musicbrainz.org/ws/2/artist/${match.id}?inc=label-rels&fmt=json`)) as {
    relations?: { type?: string; ended?: boolean; label?: { name?: string; type?: string } }[];
  } | null;
  const contracts = (detail?.relations ?? []).filter(
    (rel) => rel.type === "recording contract" && rel.label?.name && rel.label.type !== "Person",
  );
  const preferred = contracts.filter((rel) => rel.label?.name && !isDistributor(rel.label.name));
  const label = (preferred.find((rel) => !rel.ended) ?? preferred[0] ?? contracts.find((rel) => !rel.ended) ?? contracts[0])
    ?.label?.name;
  return label ? { company: label } : null;
}

function knownCompany(artist: string, title?: string): CompanyInfo | null {
  const name = artist.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const song = (title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (name === "nmixx" || name === "엔믹스" || (song === "runforroses" && /nmixx|enix|엔믹스/i.test(artist))) {
    return { company: "JYP Entertainment" };
  }
  if (name === "kissoflife" || name === "키스오브라이프") return { company: "S2 Entertainment" };
  if (name === "ateez" || name === "에이티즈") return { company: "KQ Entertainment" };
  if (name === "bts" || name === "bangtan" || name === "bangtansonyeondan" || name === "방탄소년단") return { company: "Big Hit Music" };
  return null;
}

async function fromKpopping(artist: string): Promise<CompanyInfo | null> {
  const { fetchGroup } = await import("./group.server");
  const page = await fetchGroup(artist);
  return page.company ? { company: page.company } : null;
}

export async function fetchCompany(artist: string, title?: string): Promise<CompanyInfo | null> {
  const term = artist.trim();
  if (!term) return null;
  const known = knownCompany(term, title);
  if (known) return known;
  const key = keyOf(term);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < DAY) return cached.value;
  const value = (await fromKpopping(term)) ?? (await fromWikipedia(term)) ?? (await fromMusicBrainz(term));
  if (value) cache.set(key, { at: Date.now(), value });
  return value;
}
