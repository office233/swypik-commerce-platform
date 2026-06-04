type Vision24Article = {
  id?: string;
  slug?: string;
  title?: string;
  dek?: string | null;
  body_md?: string | null;
  published_at?: string | null;
  author_label?: string | null;
  citations?: any;
  vertical_slug?: string | null;
  vertical_name?: string | null;
  color_hex?: string | null;
  meta?: Record<string, any> | null;
  lang?: string | null;
  hero_image_url?: string | null;
  hero_image_alt?: string | null;
};

type Vision24Video = {
  id?: string;
  kind?: string;
  provider?: string;
  video_id?: string | null;
  url?: string | null;
  embed_url?: string | null;
  title?: string;
  summary?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  fetched_at?: string | null;
  lang?: string | null;
  vertical?: string | null;
  vertical_name?: string | null;
  source?: {
    name?: string | null;
    publisher?: string | null;
    channel_id?: string | null;
    trust?: number | null;
  } | null;
  format?: string | null;
  is_short_form?: boolean | null;
};

export type Vision24FeedCard = {
  id: string;
  url: null;
  hlsUrl: null;
  fallbackUrl: null;
  thumbnail: string | null;
  duration: null;
  creator: {
    id: string;
    name: string;
    username: string;
    verified: boolean;
    avatar: null;
  };
  description: string;
  likes: string;
  saves: string;
  shares: string;
  comments: string;
  viewer: {
    liked: false;
    saved: false;
    following: false;
  };
  product: null;
  audioTrack: null;
  cardType: "news" | "fact_check" | "news_video";
  article?: {
    id: string;
    slug: string;
    title: string;
    dek: string;
    url: string;
    publishedAt: string | null;
    vertical: string;
    verticalName: string;
    color: string | null;
    badge: string;
    source: string;
    heroAlt: string | null;
    tags: string[];
    liesCount: number;
    factCheckOk: boolean | null;
  };
  newsVideo?: {
    id: string;
    provider: string;
    videoId: string;
    url: string;
    embedUrl: string;
    title: string;
    summary: string | null;
    thumbnailUrl: string | null;
    publishedAt: string | null;
    vertical: string;
    verticalName: string;
    sourceName: string;
    publisher: string | null;
    trust: number | null;
    format: string;
    isShortForm: boolean;
  };
};

type CardCounts = { total: number; video: number; news: number; fact: number };

const DEFAULT_API_BASE = "http://vision24-api:4000";

function flagEnabled(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function numericEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function isVision24FeedEnabled() {
  return flagEnabled(process.env.VISION24_FEED_ENABLED);
}

export function getVision24FeedCardCounts(feedLimit: number): CardCounts {
  if (!isVision24FeedEnabled()) return { total: 0, video: 0, news: 0, fact: 0 };

  const limit = Math.max(1, Math.trunc(feedLimit));
  const videoRatio = numericEnv("VISION24_VIDEO_RATIO", 0.12, 0, 0.7);
  const newsRatio = numericEnv("VISION24_NEWS_RATIO", 0.05, 0, 0.4);
  const factRatio = numericEnv("VISION24_FACT_RATIO", 0.03, 0, 0.2);
  const maxRatio = numericEnv("VISION24_MAX_RATIO", 0.20, 0, 0.75);

  const cap = Math.max(0, Math.floor(limit * maxRatio));
  let video = videoRatio > 0 ? Math.max(1, Math.floor(limit * videoRatio)) : 0;
  let news = newsRatio > 0 ? Math.max(1, Math.floor(limit * newsRatio)) : 0;
  let fact = factRatio > 0 && limit >= 12 ? Math.max(1, Math.floor(limit * factRatio)) : 0;

  let overflow = video + news + fact - cap;
  if (overflow > 0) {
    const newsCut = Math.min(news, overflow);
    news -= newsCut;
    overflow -= newsCut;
  }
  if (overflow > 0) {
    const factCut = Math.min(fact, overflow);
    fact -= factCut;
    overflow -= factCut;
  }
  if (overflow > 0) {
    video = Math.max(0, video - overflow);
  }

  return { total: video + news + fact, video, news, fact };
}

function cleanText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value : fallback;
  return text.replace(/\s+/g, " ").trim();
}

function asTags(meta: Record<string, any> | null | undefined) {
  const tags = meta?.tags;
  return Array.isArray(tags) ? tags.map((tag) => cleanText(tag)).filter(Boolean).slice(0, 3) : [];
}

function liesCount(meta: Record<string, any> | null | undefined) {
  const lies = meta?.lies_detected;
  return Array.isArray(lies) ? lies.length : 0;
}

function factCheckOk(meta: Record<string, any> | null | undefined) {
  const ok = meta?.fact_check?.ok;
  return typeof ok === "boolean" ? ok : null;
}

function articlePath(article: Vision24Article) {
  const vertical = cleanText(article.vertical_slug, "news") || "news";
  const slug = cleanText(article.slug, article.id || "article") || "article";
  return `/news/${encodeURIComponent(vertical)}/${encodeURIComponent(slug)}`;
}

function toCard(article: Vision24Article, kind: "news" | "fact_check"): Vision24FeedCard | null {
  const id = cleanText(article.id || article.slug);
  const slug = cleanText(article.slug);
  const title = cleanText(article.title);
  if (!id || !slug || !title) return null;

  const vertical = cleanText(article.vertical_slug, "news") || "news";
  const verticalName = cleanText(article.vertical_name, vertical) || vertical;
  const dek = cleanText(article.dek, title);
  const meta = article.meta || null;
  const lieTotal = liesCount(meta);
  const badge = kind === "fact_check" ? "Fact-check" : verticalName;

  return {
    id: `vision24:${kind}:${id}`,
    url: null,
    hlsUrl: null,
    fallbackUrl: null,
    thumbnail: article.hero_image_url || null,
    duration: null,
    creator: {
      id: "vision24",
      name: "Vision24",
      username: "vision24",
      verified: true,
      avatar: null,
    },
    description: dek,
    likes: "0",
    saves: "0",
    shares: "0",
    comments: "0",
    viewer: { liked: false, saved: false, following: false },
    product: null,
    audioTrack: null,
    cardType: kind,
    article: {
      id,
      slug,
      title,
      dek,
      url: articlePath(article),
      publishedAt: article.published_at || null,
      vertical,
      verticalName,
      color: article.color_hex || null,
      badge,
      source: cleanText(article.author_label, "Vision24 AI") || "Vision24 AI",
      heroAlt: article.hero_image_alt || null,
      tags: asTags(meta),
      liesCount: lieTotal,
      factCheckOk: factCheckOk(meta),
    },
  };
}

function toVideoCard(video: Vision24Video): Vision24FeedCard | null {
  const id = cleanText(video.id || video.video_id);
  const videoId = cleanText(video.video_id);
  const title = cleanText(video.title);
  const url = cleanText(video.url);
  const embedUrl = cleanText(video.embed_url);
  if (!id || !videoId || !title || !url || !embedUrl) return null;

  const vertical = cleanText(video.vertical, "news") || "news";
  const verticalName = cleanText(video.vertical_name, vertical) || vertical;
  const sourceName = cleanText(video.source?.name, "YouTube") || "YouTube";
  const publisher = cleanText(video.source?.publisher || null) || null;

  return {
    id: `vision24:news_video:${id}`,
    url: null,
    hlsUrl: null,
    fallbackUrl: null,
    thumbnail: video.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
    duration: null,
    creator: {
      id: "vision24",
      name: publisher || "Vision24 Video",
      username: "vision24",
      verified: true,
      avatar: null,
    },
    description: cleanText(video.summary, title),
    likes: "0",
    saves: "0",
    shares: "0",
    comments: "0",
    viewer: { liked: false, saved: false, following: false },
    product: null,
    audioTrack: null,
    cardType: "news_video",
    newsVideo: {
      id,
      provider: cleanText(video.provider, "youtube") || "youtube",
      videoId,
      url,
      embedUrl,
      title,
      summary: cleanText(video.summary) || null,
      thumbnailUrl: video.thumbnail_url || null,
      publishedAt: video.published_at || video.fetched_at || null,
      vertical,
      verticalName,
      sourceName,
      publisher,
      trust: Number.isFinite(Number(video.source?.trust)) ? Number(video.source?.trust) : null,
      format: cleanText(video.format, video.is_short_form ? "short" : "video") || "video",
      isShortForm: Boolean(video.is_short_form),
    },
  };
}

function rotateTake<T>(items: T[], count: number, offset: number) {
  if (count <= 0 || items.length === 0) return [];
  const start = Math.abs(offset) % items.length;
  const out: T[] = [];
  for (let index = 0; index < Math.min(count, items.length); index += 1) {
    out.push(items[(start + index) % items.length]);
  }
  return out;
}

async function getVisionJson(path: string, signal: AbortSignal) {
  const apiBase = (process.env.VISION24_API_URL || DEFAULT_API_BASE).replace(/\/$/, "");
  const response = await fetch(`${apiBase}${path}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`vision24_${response.status}`);
  return response.json();
}

export async function fetchVision24FeedCards(options: { feedLimit: number; offset: number; lang?: string }) {
  const counts = getVision24FeedCardCounts(options.feedLimit);
  if (counts.total === 0) return [] as Vision24FeedCard[];

  const lang = encodeURIComponent((options.lang || "ro").toLowerCase());
  const videoLang = encodeURIComponent((process.env.VISION24_VIDEO_LANG || "all").toLowerCase());
  const videoFormat = encodeURIComponent((process.env.VISION24_VIDEO_FORMAT || "reels").toLowerCase());
  const articleLimit = Math.min(100, Math.max(30, options.feedLimit * 3));
  const videoLimit = Math.min(60, Math.max(12, options.feedLimit * 2));
  const timeoutMs = Math.trunc(numericEnv("VISION24_FEED_TIMEOUT_MS", 2500, 500, 8000));
  const signal = AbortSignal.timeout(timeoutMs);

  const [videosPayload, articlesPayload, liesPayload] = await Promise.all([
    counts.video > 0 ? getVisionJson(`/videos?limit=${videoLimit}&lang=${videoLang}&format=${videoFormat}`, signal).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
    getVisionJson(`/articles?limit=${articleLimit}&lang=${lang}`, signal),
    counts.fact > 0 ? getVisionJson(`/articles/lies?limit=${Math.min(50, articleLimit)}`, signal) : Promise.resolve({ items: [] }),
  ]);

  const videos = Array.isArray(videosPayload?.items) ? videosPayload.items as Vision24Video[] : [];
  const articles = Array.isArray(articlesPayload?.items) ? articlesPayload.items as Vision24Article[] : [];
  const lies = Array.isArray(liesPayload?.items) ? liesPayload.items as Vision24Article[] : [];
  const videoCards = rotateTake(videos, counts.video, options.offset)
    .map((video) => toVideoCard(video))
    .filter((card): card is Vision24FeedCard => Boolean(card));

  const factIds = new Set<string>();
  const factCandidates = [...lies, ...articles.filter((article) => liesCount(article.meta) > 0)];
  const factCards = rotateTake(factCandidates, counts.fact, options.offset)
    .map((article) => {
      if (article.id) factIds.add(article.id);
      return toCard(article, "fact_check");
    })
    .filter((card): card is Vision24FeedCard => Boolean(card));

  const newsCards = rotateTake(
    articles.filter((article) => !article.id || !factIds.has(article.id)),
    Math.max(0, counts.total - videoCards.length - factCards.length),
    options.offset + counts.fact,
  )
    .map((article) => toCard(article, "news"))
    .filter((card): card is Vision24FeedCard => Boolean(card));

  const seen = new Set<string>();
  const ordered: Vision24FeedCard[] = [];
  const maxLength = Math.max(videoCards.length, factCards.length, newsCards.length);
  for (let index = 0; index < maxLength; index += 1) {
    if (videoCards[index]) ordered.push(videoCards[index]);
    if (factCards[index]) ordered.push(factCards[index]);
    if (newsCards[index]) ordered.push(newsCards[index]);
  }

  return ordered.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

export async function fetchVision24Article(vertical: string, slug: string) {
  const safeVertical = encodeURIComponent(vertical);
  const safeSlug = encodeURIComponent(slug);
  const signal = AbortSignal.timeout(Math.trunc(numericEnv("VISION24_ARTICLE_TIMEOUT_MS", 3500, 500, 8000)));
  return getVisionJson(`/articles/${safeVertical}/${safeSlug}`, signal) as Promise<Vision24Article>;
}