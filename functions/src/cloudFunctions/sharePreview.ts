// functions/src/cloudFunctions/sharePreview.ts
import { onRequest } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import { getTmdbApiKey } from "../hooks/apiKey";
import { buildPreviewHtml, previewMetaFor } from "../hooks/sharePreview";
import { showDocId } from "../shared/docId";
import { MediaType, TMDB_BASE } from "../shared/enums";

const WEB_BASE_URL = defineString("WEB_BASE_URL", {
  default: "https://watchloom-app.web.app",
});
const SHARE_TAGLINE = defineString("SHARE_TAGLINE", {
  default: "Track What You Watch",
});

const SHOW_PATH = /^\/show\/(tv|movie)\/(\d+)\/?$/;
const TEMPLATE_TTL_MS = 10 * 60 * 1000;
let template: { html: string; at: number } | null = null;

/** The deployed SPA shell (cached; /index.html is served statically, not rewritten) */
async function getTemplate(base: string): Promise<string> {
  if (template && Date.now() - template.at < TEMPLATE_TTL_MS)
    return template.html;
  const { data } = await axios.get<string>(`${base}/index.html`, {
    responseType: "text",
    timeout: 5000,
  });
  template = { html: data, at: Date.now() };
  return data;
}

/** Catalog doc first (0 TMDB calls for tracked shows), TMDB as fallback */
async function loadShow(mediaType: MediaType, tmdbId: number) {
  const snap = await getFirestore()
    .doc(`shows/${showDocId(tmdbId, mediaType)}`)
    .get();
  if (snap.exists) {
    const d = snap.data()!;
    return {
      title: d.title,
      overview: d.overview,
      backdropPath: d.backdropPath,
      posterPath: d.posterPath,
      mediaType,
    };
  }
  const apiKey = await getTmdbApiKey();
  const { data } = await axios.get(`${TMDB_BASE}/${mediaType}/${tmdbId}`, {
    params: { api_key: apiKey },
    timeout: 5000,
  });
  return {
    title: data.name ?? data.title,
    overview: data.overview,
    backdropPath: data.backdrop_path,
    posterPath: data.poster_path,
    mediaType,
  };
}

/**
 * Serves /show/{tv|movie}/{id} — the web app shell with Open Graph tags so
 * shared links unfurl with the show's image, name and description (or the
 * Watchloom card when the show can't be loaded). Cached by the CDN for a day.
 */
export const sharePreview = onRequest(
  { maxInstances: 3, timeoutSeconds: 15, memory: "256MiB" },
  async (req, res) => {
    const base = WEB_BASE_URL.value();
    const html = await getTemplate(base).catch(() => null);
    if (!html) {
      res.redirect(302, `${base}/`);
      return;
    }

    const match = SHOW_PATH.exec(req.path);
    const url = `${base}${req.path}`;
    let show = null;
    if (match) {
      const mediaType = match[1] === "movie" ? MediaType.MOVIE : MediaType.TV;
      show = await loadShow(mediaType, Number(match[2])).catch(() => null);
    }

    res.set("Cache-Control", "public, max-age=300, s-maxage=86400");
    res.set("Content-Type", "text/html; charset=utf-8");
    res
      .status(200)
      .send(
        buildPreviewHtml(
          html,
          previewMetaFor(show, url, base, SHARE_TAGLINE.value()),
        ),
      );
  },
);
