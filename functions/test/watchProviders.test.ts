import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRegion,
  sameRegionProviders,
} from "../src/hooks/watchProviders/normalize";

const p = (id: number, name: string, priority: number) => ({
  provider_id: id,
  provider_name: name,
  logo_path: `/${id}.jpg`,
  display_priority: priority,
});

test("keeps subscription, free and ad-supported services in TMDB's order, not rent / buy", () => {
  const out = normalizeRegion(
    {
      link: "https://tmdb/watch",
      flatrate: [p(8, "Netflix", 2), p(337, "Disney Plus", 1)],
      free: [p(300, "Pluto TV", 5)],
      ads: [p(8, "Netflix", 2)],
      rent: [p(2, "Apple TV", 0)],
      buy: [p(3, "Google Play", 0)],
    },
    123,
  );
  assert.deepEqual(
    out.providers.map((x) => x.name),
    ["Disney Plus", "Netflix", "Pluto TV"],
  );
  assert.equal(out.link, "https://tmdb/watch");
  assert.equal(out.updatedAt, 123);
  assert.deepEqual(out.providers[0], { id: 337, name: "Disney Plus", logo: "/337.jpg" });
});

test("an ad tier listed as its own service merges into the service", () => {
  const out = normalizeRegion({
    flatrate: [p(8, "Netflix", 1), p(1796, "Netflix Standard with Ads", 2)],
    ads: [p(99, "Foo Basic with Ads", 3)],
  });
  assert.deepEqual(
    out.providers.map((x) => x.name),
    ["Netflix", "Foo Basic with Ads"],
  );
});

test("no offers in a country → an empty list (stored, so it's not refetched)", () => {
  assert.deepEqual(normalizeRegion(undefined, 1), { providers: [], link: null, updatedAt: 1 });
});

test("sameRegionProviders ignores updatedAt, sees service / link changes", () => {
  const a = normalizeRegion({ link: "l", flatrate: [p(8, "Netflix", 1)] }, 1);
  assert.equal(sameRegionProviders(a, { ...a, updatedAt: 2 }), true);
  assert.equal(sameRegionProviders(undefined, a), false);
  assert.equal(sameRegionProviders(a, { ...a, link: "x" }), false);
  assert.equal(
    sameRegionProviders(a, normalizeRegion({ link: "l", flatrate: [p(9, "Prime", 1)] })),
    false,
  );
});
