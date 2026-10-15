import type { CatalogShow, HistoryEntry } from "../types";
import { ENDED_STATUSES, HistoryPill, HistoryProgress, MediaType, WatchStatus } from "../enums";
import { formatTime } from "./format";

export interface HistoryCard {
	id: string;
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	logoPath: string | null;
	backdropPath: string | null;
	/** Status pill; null for movies (every movie in history is watched) */
	pill: HistoryPill | null;
	/** formatTime(minutesWatched); no runtime known yet → "N/A" for TV, null (hidden) for movies */
	timeSpent: string | null;
	/** TV: most recently watched episode as "S01 | E24"; null for movies / unknown */
	lastWatched: string | null;
	/** Full watch-throughs — only for Rewatching / Completed */
	watchCount: number | null;
	progress: { kind: HistoryProgress; percent?: number } | null;
	/** "Ongoing" / "Ended" (TV), release year (movies) */
	tag: string | null;
}

const PILL: Record<WatchStatus, HistoryPill> = {
	[WatchStatus.WATCHING]: HistoryPill.WATCHING,
	[WatchStatus.PLAN_TO_WATCH]: HistoryPill.WATCHING,
	[WatchStatus.REWATCHING]: HistoryPill.REWATCHING,
	[WatchStatus.COMPLETED]: HistoryPill.COMPLETED,
	[WatchStatus.PAUSED]: HistoryPill.PAUSED,
	[WatchStatus.PAUSED_REWATCH]: HistoryPill.PAUSED,
};

/** Aired episodes (specials excluded) in watch order */
function airedEpisodes(catalog: CatalogShow | null, today: string) {
	return [...(catalog?.seasons ?? [])]
		.filter((s) => s.seasonNumber > 0)
		.sort((a, b) => a.seasonNumber - b.seasonNumber)
		.flatMap((s) =>
			(s.episodes ?? [])
				.filter((e) => !!e.airDate && e.airDate <= today)
				.map((e) => ({ season: s.seasonNumber, episode: e.episodeNumber })),
		);
}

/** % of aired episodes before the pointer (watched in this run); null pointer = all of them */
function percentWatched(entry: HistoryEntry, aired: { season: number; episode: number }[]) {
	if (aired.length === 0) return 0;
	const p = entry.nextEpisode;
	if (!p) return 100;
	const before = aired.filter(
		(e) => e.season < p.season || (e.season === p.season && e.episode < p.episode),
	).length;
	return Math.round((before / aired.length) * 100);
}

/** Everything Watch History shows for one row — pure, catalog from the shared cache */
export function deriveHistoryCard(
	entry: HistoryEntry,
	catalog: CatalogShow | null,
	today: string,
): HistoryCard {
	const isMovie = entry.mediaType === MediaType.MOVIE;
	const ended = ENDED_STATUSES.includes(catalog?.status ?? "");
	// Watched everything aired on a show that's still airing → caught up, not finished
	const caughtUpAiring =
		!isMovie && !!catalog && !ended && entry.status === WatchStatus.COMPLETED;
	// Still "watching" a show that has ended, with nothing left → finished (the status
	// predates TMDB marking it ended, and the weekly sync skips ended shows)
	const finishedEnded =
		!isMovie &&
		!!catalog &&
		ended &&
		entry.status === WatchStatus.WATCHING &&
		percentWatched(entry, airedEpisodes(catalog, today)) === 100;
	const pill = isMovie
		? null
		: caughtUpAiring
			? HistoryPill.WATCHING
			: finishedEnded
				? HistoryPill.COMPLETED
				: PILL[entry.status];

	let progress: HistoryCard["progress"] = null;
	if (finishedEnded) {
		progress = null;
	} else if (caughtUpAiring) {
		progress = { kind: HistoryProgress.UP_TO_DATE };
	} else if (pill === HistoryPill.PAUSED) {
		progress = { kind: HistoryProgress.PAUSED };
	} else if (pill === HistoryPill.WATCHING || pill === HistoryPill.REWATCHING) {
		const aired = airedEpisodes(catalog, today);
		const percent = percentWatched(entry, aired);
		// Caught up on a still-airing show: nothing aired left to watch
		const upToDate = pill === HistoryPill.WATCHING && !ended && percent === 100;
		progress = upToDate
			? { kind: HistoryProgress.UP_TO_DATE }
			: { kind: HistoryProgress.PERCENT, percent };
	}

	let watchCount: number | null = null;
	if (isMovie) watchCount = entry.plays;
	else if (pill === HistoryPill.COMPLETED) watchCount = entry.rewatchCount + 1;
	else if (pill === HistoryPill.REWATCHING) watchCount = Math.max(1, entry.rewatchCount);

	const year = (catalog?.releaseDate ?? "").slice(0, 4);
	const pad = (n: number) => String(n).padStart(2, "0");
	const last = entry.lastEpisode;
	return {
		id: entry.id,
		tmdbId: entry.tmdbId,
		mediaType: entry.mediaType,
		title: catalog?.title ?? "",
		logoPath: catalog?.logoPath ?? null,
		backdropPath: catalog?.backdropPath ?? null,
		pill,
		// Watched, but TMDB had no runtimes yet → TV "N/A" until the weekly sync heals it;
		// movies just hide Watch Time
		timeSpent:
			entry.minutesWatched > 0
				? formatTime(Math.round(entry.minutesWatched))
				: isMovie
					? null
					: "N/A",
		lastWatched: !isMovie && last ? `S${pad(last.season)} | E${pad(last.episode)}` : null,
		watchCount,
		progress,
		tag: isMovie ? year || null : catalog ? (ended ? "Ended" : "Ongoing") : null,
	};
}
