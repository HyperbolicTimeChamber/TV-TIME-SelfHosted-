import { MediaType } from "../enums";
import type { UpcomingEpisode } from "../types/tmdb";
import type { CatalogShow } from "../types/catalog";
import { isGenericEpisodeTitle } from "./episodeTitle";

/** Max distinct past air dates kept in the local "past days" queue */
export const PAST_DAYS_LIMIT = 20;

export const upcomingEpKey = (ep: Pick<UpcomingEpisode, "tmdbShowId" | "season" | "episode">) =>
	`${ep.tmdbShowId}_${ep.season}_${ep.episode}`;

/**
 * Past-days queue: keep only aired episodes (airDate < today), dedupe, and retain
 * the PAST_DAYS_LIMIT most recent air dates — pushing a new day past the limit
 * drops the oldest. Sorted oldest → newest.
 */
export function trimPastQueue(eps: UpcomingEpisode[], today: string): UpcomingEpisode[] {
	const seen = new Set<string>();
	const deduped: UpcomingEpisode[] = [];
	for (const ep of eps) {
		if (ep.airDate >= today) continue;
		const k = upcomingEpKey(ep);
		if (seen.has(k)) continue;
		seen.add(k);
		deduped.push(ep);
	}
	const dates = [...new Set(deduped.map((e) => e.airDate))].sort().slice(-PAST_DAYS_LIMIT);
	const keep = new Set(dates);
	return deduped
		.filter((e) => keep.has(e.airDate))
		.sort((a, b) => a.airDate.localeCompare(b.airDate));
}

/** Show+season pairs that still have placeholder episode names */
export function placeholderTargets(
	episodes: UpcomingEpisode[],
	skip: Set<string>,
): Map<string, { tmdbId: number; season: number }> {
	const targets = new Map<string, { tmdbId: number; season: number }>();
	for (const ep of episodes) {
		if (ep.mediaType === MediaType.MOVIE || !isGenericEpisodeTitle(ep.episodeTitle)) continue;
		const k = `${ep.tmdbShowId}_${ep.season}`;
		if (skip.has(k)) continue;
		targets.set(k, { tmdbId: ep.tmdbShowId, season: ep.season });
	}
	return targets;
}

/** Real titles for a season from a cached catalog (key = upcomingEpKey) */
export function titlesFromCatalog(
	catalog: CatalogShow | null,
	tmdbId: number,
	season: number,
): Map<string, string> {
	const out = new Map<string, string>();
	const s = catalog?.seasons?.find((x) => x.seasonNumber === season);
	for (const e of s?.episodes ?? []) {
		if (!isGenericEpisodeTitle(e.title)) {
			out.set(upcomingEpKey({ tmdbShowId: tmdbId, season, episode: e.episodeNumber }), e.title);
		}
	}
	return out;
}

/** Replace placeholder titles; returns same array ref when nothing changed */
export function applyTitles(prev: UpcomingEpisode[], titles: Map<string, string>): UpcomingEpisode[] {
	let changed = false;
	const next = prev.map((ep) => {
		const t = titles.get(upcomingEpKey(ep));
		if (!t || t === ep.episodeTitle || !isGenericEpisodeTitle(ep.episodeTitle)) return ep;
		changed = true;
		return { ...ep, episodeTitle: t };
	});
	return changed ? next : prev;
}
