import type { CatalogShow, UpcomingEpisode } from "../types";
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
export function localizeCatalog<T extends Pick<CatalogShow, "seasons"> | null | undefined>(show: T): T {
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

/** Calendar card subtitle: "Episode name • 08:00 PM" (just the name when no time is known) */
export function withAirTime(label: string, airStamp?: string): string {
	const time = formatAirTime(airStamp);
	return time ? `${label} • ${time}` : label;
}
