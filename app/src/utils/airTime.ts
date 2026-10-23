import type { CatalogEpisode, CatalogShow, UpcomingEpisode } from "../types";
import { localDateStr } from "./todayStr";

/**
 * TMDB only gives an episode's US air date; when the catalog has TVMaze's exact UTC
 * airStamp, the episode belongs on the viewer's local day instead (a US Wednesday
 * 8pm ET episode is Thursday morning in India).
 */
export function localAirDate(airDate: string | null, airStamp?: string): string | null {
	if (!airStamp) return airDate;
	const d = new Date(airStamp);
	return Number.isNaN(d.getTime()) ? airDate : localDateStr(d);
}

/** Rewrite a catalog's episode airDates to the local day (idempotent — airStamp is kept) */
export function localizeCatalog<
	T extends { seasons?: { episodes?: Pick<CatalogEpisode, "airDate" | "airStamp">[] }[] } | null | undefined,
>(show: T): T {
	for (const season of show?.seasons ?? []) {
		for (const ep of season.episodes ?? []) {
			if (ep.airStamp) ep.airDate = localAirDate(ep.airDate, ep.airStamp);
		}
	}
	return show;
}

/** Same for an upcoming-episode doc */
export function localizeUpcoming(ep: UpcomingEpisode): UpcomingEpisode {
	return ep.airStamp ? { ...ep, airDate: localAirDate(ep.airDate, ep.airStamp) ?? ep.airDate } : ep;
}

/** Local air day of a show's next episode: catalog (localized) first, else the tracking doc's date */
export function nextEpisodeLocalAirDate(
	nextEpisode: { season: number; episode: number } | null | undefined,
	catalog: Pick<CatalogShow, "seasons"> | null | undefined,
	fallback: string | null | undefined,
): string | null {
	if (nextEpisode && catalog) {
		const ep = catalog.seasons
			?.find((s) => s.seasonNumber === nextEpisode.season)
			?.episodes?.find((e) => e.episodeNumber === nextEpisode.episode);
		if (ep?.airStamp) return localAirDate(ep.airDate, ep.airStamp);
	}
	return fallback ?? null;
}

/** Local air time as "hh:mm a" (e.g. "08:00 PM"); null when only the date is known */
export function formatAirTime(airStamp?: string): string | null {
	if (!airStamp) return null;
	const d = new Date(airStamp);
	if (Number.isNaN(d.getTime())) return null;
	const h = d.getHours();
	const hh = String(h % 12 || 12).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	return `${hh}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

/** Exact UTC air time (TVMaze) of a show's next episode, when the catalog has it */
export function nextEpisodeAirStamp(
	nextEpisode: { season: number; episode: number } | null | undefined,
	catalog: Pick<CatalogShow, "seasons"> | null | undefined,
): string | undefined {
	if (!nextEpisode || !catalog) return undefined;
	return catalog.seasons
		?.find((s) => s.seasonNumber === nextEpisode.season)
		?.episodes?.find((e) => e.episodeNumber === nextEpisode.episode)?.airStamp;
}

/** Aired yet? With an exact time the moment counts, otherwise the (local) day */
export function hasAired(
	airStamp: string | undefined,
	airDate: string | null | undefined,
	today: string,
	now = Date.now(),
): boolean {
	const t = airStamp ? Date.parse(airStamp) : NaN;
	if (!Number.isNaN(t)) return t <= now;
	return !!airDate && airDate <= today;
}

/** A day's episodes by air time (exact time first, earliest first); untimed keep their order after */
export function sortByAirTime<T extends { airStamp?: string }>(eps: T[]): T[] {
	const t = (e: T) => (e.airStamp ? Date.parse(e.airStamp) : NaN);
	return [...eps].sort((a, b) => {
		const ta = t(a);
		const tb = t(b);
		if (Number.isNaN(ta)) return Number.isNaN(tb) ? 0 : 1;
		if (Number.isNaN(tb)) return -1;
		return ta - tb;
	});
}
