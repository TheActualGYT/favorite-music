export type ActKind = "male-group" | "female-group" | "unisex-group" | "male-solo" | "female-solo";

const MALE_GROUPS = [
  "stray kids", "ateez", "bts", "exo", "riize", "boy next door", "boynextdoor", "enhypen", "txt", "tomorrow x together",
  "seventeen", "nct", "nct 127", "nct dream", "nct wish", "wayv", "idntt", "lngshot", "treasure", "the boyz",
  "zerobaseone", "zb1", "p1harmony", "the wind", "tws", "plave", "ampersandone", "82major", "cravity", "oneus",
  "onewe", "monsta x", "got7", "shinee", "super junior", "tvxq", "bigbang", "winner", "ikon", "block b", "bts",
  "ateez", "xikers", "andteam", "team", "enhypen", "boynextdoor", "riize", "nct", "kickflip", "cortis", "alphas",
  "dxteen", "ini", "jo1", "nct dojaejung", "exo-cbx", "exo-sc", "bts", "tomorrow x together",
];

const FEMALE_GROUPS = [
  "itzy", "aespa", "nmixx", "xg", "kiss of life", "i-dle", "idle", "(g)i-dle", "gidle", "ive", "newjeans", "new jeans",
  "blackpink", "twice", "red velvet", "le sserafim", "lesserafim", "babymonster", "baby monster", "illit", "izna",
  "fromis 9", "fromis9", "stayc", "triples", "tripleS", "loona", "artms", "odd eye circle", "mamamoo", "gfriend",
  "oh my girl", "weeekly", "billlie", "kep1er", "iz*one", "izone", "wooah", "csr", "rescene", "unis", "meovv",
  "hearts2hearts", "say my name", "fifty fifty", "viviz", "purple kiss", "dreamcatcher", "everglow", "clc", "wjsn",
  "cosmic girls", "snsd", "girls generation", "2ne1", "f(x)", "fx", "t-ara", "sistar", "apink", "exid", "girl's day",
  "brave girls", "candy shop", "young posse", "qwer", "illit", "katseye", "babymonster",
];

const UNISEX_GROUPS = [
  "kard", "allday project", "alldayproject", "all day project", "coed school", "akmu", "akdong musician",
  "troublemaker", "ssak3", "checkmate",
];

const MALE_SOLOS = [
  "jungkook", "jeon jungkook", "v", "kim taehyung", "taehyung", "jimin", "park jimin", "j-hope", "jhope", "jung hoseok",
  "rm", "namjoon", "suga", "agust d", "min yoongi", "jin", "kim seokjin", "taemin", "kai", "baekhyun", "d.o.", "d.o", "kyungsoo",
  "chen", "g-dragon", "gd", "jay park", "zico", "crush", "dean", "woodz", "cho seungyoun", "kang daniel", "ong seongwu",
  "ha sungwoon", "kim jaehwan", "park woojin", "lee daehwi", "ten", "mark", "haechan", "jaehyun", "doyoung", "jungwoo",
  "taeyong", "johnny", "yuta", "kun", "xiaojun", "hendery", "yangyang", "winwin", "felix", "bang chan", "han", "changbin",
  "hyunjin", "i.n", "seungmin", "lee know", "yeonjun", "soobin", "beomgyu", "taehyun", "hueningkai", "huening kai",
];

const FEMALE_SOLOS = [
  "iu", "taeyeon", "jennie", "lisa", "rose", "rosé", "jisoo", "nayeon", "jihyo", "mina", "momo", "sana", "dahyun", "chaeyoung", "tzuyu",
  "irene", "seulgi", "wendy", "joy", "yeri", "hwasa", "solar", "wheein", "moonbyul", "chungha", "sunmi", "hyuna", "cl", "heize",
  "tiffany", "yoona", "seohyun", "jessica", "hyoyeon", "sooyoung", "yuri", "sunny", "taeyeon", "chung ha", "somi", "jeon somi",
  "yena", "yujin", "wonyoung", "karina", "winter", "giselle", "ningning", "yuqi", "shuhua", "miyeon", "minnie", "soyeon",
  "yeji", "lia", "ryujin", "chaeryeong", "yuna", "lily", "haewon", "sullyoon", "bae", "jiwoo", "kyujin", "natty", "julie", "belle", "haneul",
];

function pack(names: string[]) {
  return new Set(names.map((name) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "")));
}

const MALE_GROUP = pack(MALE_GROUPS);
const FEMALE_GROUP = pack(FEMALE_GROUPS);
const UNISEX_GROUP = pack(UNISEX_GROUPS);
const MALE_SOLO = pack(MALE_SOLOS);
const FEMALE_SOLO = pack(FEMALE_SOLOS);

export function actKind(artist: string): ActKind | null {
  const key = artist.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  if (UNISEX_GROUP.has(key)) return "unisex-group";
  if (MALE_GROUP.has(key)) return "male-group";
  if (FEMALE_GROUP.has(key)) return "female-group";
  if (MALE_SOLO.has(key)) return "male-solo";
  if (FEMALE_SOLO.has(key)) return "female-solo";
  return null;
}
