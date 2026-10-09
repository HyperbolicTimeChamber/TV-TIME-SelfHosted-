import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewHtml,
  previewMetaFor,
  truncate,
} from "../src/hooks/sharePreview";

const BASE = "https://watchloom-app.web.app";
const TEMPLATE = `<!doctype html><html><head><meta name="description" content="Watchloom — track what you watch" /><title>Watchloom</title></head><body><div id="root"></div></body></html>`;

test("show preview uses backdrop, title and overview", () => {
  const meta = previewMetaFor(
    {
      title: "Lost",
      overview: "Survivors of a plane crash.",
      backdropPath: "/b.jpg",
      posterPath: "/p.jpg",
      mediaType: "tv",
    },
    `${BASE}/show/tv/4607`,
    BASE,
    "Track What You Watch",
  );
  assert.equal(meta.title, "Lost · Watchloom");
  assert.equal(meta.image, "https://image.tmdb.org/t/p/w780/b.jpg");
  assert.equal(meta.type, "video.tv_show");
  const html = buildPreviewHtml(TEMPLATE, meta);
  assert.match(html, /<title>Lost · Watchloom<\/title>/);
  assert.match(
    html,
    /<meta property="og:image" content="https:\/\/image\.tmdb\.org\/t\/p\/w780\/b\.jpg" \/>/,
  );
  assert.match(
    html,
    /<meta name="description" content="Survivors of a plane crash\." \/>/,
  );
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, /<div id="root"><\/div>/, "SPA shell intact");
});

test("poster used when there is no backdrop", () => {
  const meta = previewMetaFor(
    { title: "Heat", posterPath: "/p.jpg", mediaType: "movie" },
    "u",
    BASE,
    "t",
  );
  assert.equal(meta.image, "https://image.tmdb.org/t/p/w500/p.jpg");
  assert.equal(meta.type, "video.movie");
});

test("unknown show falls back to the Watchloom card", () => {
  const meta = previewMetaFor(
    null,
    `${BASE}/show/tv/1`,
    BASE,
    "Track What You Watch",
  );
  assert.deepEqual(
    { title: meta.title, description: meta.description, image: meta.image },
    {
      title: "Watchloom",
      description: "Track What You Watch",
      image: `${BASE}/icon-512.png`,
    },
  );
});

test("escapes HTML in titles/descriptions", () => {
  const html = buildPreviewHtml(
    TEMPLATE,
    previewMetaFor(
      { title: `Tom & "Jerry" <3`, mediaType: "tv" },
      "u",
      BASE,
      "x",
    ),
  );
  assert.match(html, /Tom &amp; &quot;Jerry&quot; &lt;3/);
  assert.doesNotMatch(html, /<3/);
});

test("long overviews are truncated at a word boundary", () => {
  const t = truncate("word ".repeat(100), 50);
  assert.ok(t.length <= 50);
  assert.ok(t.endsWith("…"));
});
