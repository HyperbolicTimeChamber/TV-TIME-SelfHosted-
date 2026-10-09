export interface PreviewMeta {
  title: string;
  description: string;
  image: string;
  url: string;
  /** "video.tv_show" | "video.movie" | "website" */
  type: string;
}

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const MAX_DESCRIPTION = 200;

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function truncate(text: string, max = MAX_DESCRIPTION): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

/** Show/movie preview, falling back to the Watchloom brand card */
export function previewMetaFor(
  show: {
    title?: string | null;
    overview?: string | null;
    backdropPath?: string | null;
    posterPath?: string | null;
    mediaType: "tv" | "movie";
  } | null,
  url: string,
  webBase: string,
  tagline: string,
): PreviewMeta {
  if (!show?.title) {
    return {
      title: "Watchloom",
      description: tagline,
      image: `${webBase}/icon-512.png`,
      url,
      type: "website",
    };
  }
  const image = show.backdropPath
    ? `${TMDB_IMAGE_BASE}/w780${show.backdropPath}`
    : show.posterPath
      ? `${TMDB_IMAGE_BASE}/w500${show.posterPath}`
      : `${webBase}/icon-512.png`;
  return {
    title: `${show.title} · Watchloom`,
    description: show.overview ? truncate(show.overview) : tagline,
    image,
    url,
    type: show.mediaType === "movie" ? "video.movie" : "video.tv_show",
  };
}

/** Inject Open Graph / Twitter tags into the SPA's index.html (crawlers don't run JS) */
export function buildPreviewHtml(template: string, meta: PreviewMeta): string {
  const e = {
    title: escapeHtml(meta.title),
    description: escapeHtml(meta.description),
    image: escapeHtml(meta.image),
    url: escapeHtml(meta.url),
  };
  const tags = [
    `<meta property="og:site_name" content="Watchloom" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:title" content="${e.title}" />`,
    `<meta property="og:description" content="${e.description}" />`,
    `<meta property="og:image" content="${e.image}" />`,
    `<meta property="og:url" content="${e.url}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e.title}" />`,
    `<meta name="twitter:description" content="${e.description}" />`,
    `<meta name="twitter:image" content="${e.image}" />`,
  ].join("\n\t\t");
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${e.title}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${e.description}" />`,
    )
    .replace("</head>", `\t${tags}\n\t</head>`);
}
