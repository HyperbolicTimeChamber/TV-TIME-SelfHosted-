import type {
  RegionWatchProviders,
  StoredWatchProvider,
} from "../../shared/types";

/** TMDB /{type}/{id}/watch/providers: one country's offers */
export interface TmdbRegionProviders {
  link?: string;
  flatrate?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

/** "Netflix Standard with Ads" → "Netflix" */
const AD_TIER = /^(.+?)\s+(?:standard\s+|basic\s+)?with\s+ads$/i;

/**
 * One country's streaming services as stored: subscription, free and ad-supported (not rent /
 * buy), in TMDB's order, each service once — also when its ad tier is listed as its own service
 */
export function normalizeRegion(
  region: TmdbRegionProviders | undefined,
  now = Date.now(),
): RegionWatchProviders {
  const seen = new Set<number>();
  const all = [
    ...(region?.flatrate ?? []),
    ...(region?.free ?? []),
    ...(region?.ads ?? []),
  ]
    .sort((a, b) => a.display_priority - b.display_priority)
    .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id));
  const names = new Set(all.map((p) => p.provider_name.toLowerCase()));
  const providers: StoredWatchProvider[] = all
    .filter((p) => {
      const base = AD_TIER.exec(p.provider_name)?.[1];
      return !base || !names.has(base.toLowerCase());
    })
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
  return { providers, link: region?.link ?? null, updatedAt: now };
}

/** Same services and link (updatedAt aside): the weekly sync skips the write */
export function sameRegionProviders(
  a: RegionWatchProviders | undefined,
  b: RegionWatchProviders,
): boolean {
  if (!a || a.link !== b.link || a.providers.length !== b.providers.length) return false;
  return a.providers.every(
    (p, i) =>
      p.id === b.providers[i].id &&
      p.name === b.providers[i].name &&
      p.logo === b.providers[i].logo,
  );
}
