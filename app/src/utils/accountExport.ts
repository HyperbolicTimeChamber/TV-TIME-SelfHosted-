import { ACCOUNT_EXPORT_FORMAT, ACCOUNT_EXPORT_VERSION, MediaType, WatchStatus } from "../enums";
import type { ImportedList } from "./customListsIO";
import { cleanListName } from "./customLists";

/** "watchloom-account-2026-11-02.json" */
export function accountExportFileName(now: number): string {
	return `watchloom-account-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/** One title in the shape importMatches takes (the restore fields are optional there) */
export interface RestoreMatch {
	tmdbId: number;
	mediaType: MediaType;
	status: WatchStatus;
	watchedEpisodes?: Array<{ season: number; episode: number; watchedAt: string; watchCount: number }>;
	movieWatchedAt?: string | null;
	movieRuntime?: number;
	movieWatchCount?: number;
	rewatchCount?: number;
	nextEpisode?: { season: number; episode: number } | null;
}

export type AccountParseResult =
	| { ok: true; matches: RestoreMatch[]; lists: ImportedList[] }
	| { ok: false; reason: "invalid" | "newer" | "empty" };

const STATUSES = Object.values(WatchStatus) as string[];
const TRACKING_ID = /^(tv|movie)_(\d{1,9})$/;
const POSTER_PATH = /^\/[\w.-]{1,100}$/;
const TITLE_MAX = 200;

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isDate = (v: unknown): v is string => typeof v === "string" && !isNaN(new Date(v).getTime());
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) < 1e9;

function episodeRef(raw: any): { season: number; episode: number } | null {
	return isCount(raw?.season) && isCount(raw?.episode)
		? { season: raw.season, episode: raw.episode }
		: null;
}

function parseLists(raw: unknown): ImportedList[] {
	if (!Array.isArray(raw)) return [];
	const sorted = [...raw].sort(
		(a, b) => (a?.order ?? a?.createdAt ?? 0) - (b?.order ?? b?.createdAt ?? 0),
	);
	const lists: ImportedList[] = [];
	for (const l of sorted) {
		const name = cleanListName(typeof l?.name === "string" ? l.name : "");
		if (!name || !Array.isArray(l.items)) continue;
		const items: ImportedList["items"] = [];
		for (const i of l.items) {
			if (!isId(i?.tmdbId) || (i.mediaType !== MediaType.TV && i.mediaType !== MediaType.MOVIE)) continue;
			items.push({
				tmdbId: i.tmdbId,
				mediaType: i.mediaType,
				title: typeof i.title === "string" ? i.title.trim().slice(0, TITLE_MAX) : "",
				posterPath:
					typeof i.posterPath === "string" && POSTER_PATH.test(i.posterPath) ? i.posterPath : null,
			});
		}
		lists.push({ name, items });
	}
	return lists;
}

/**
 * Reads a whole-account export (Settings → Export My Data) back into what the import takes:
 * titles with their status, rewatch count, next episode and every watch, plus the lists.
 * Anything that isn't ours is refused; malformed entries are skipped.
 */
export function parseAccountExport(text: string): AccountParseResult {
	let data: any;
	try {
		data = JSON.parse(text);
	} catch {
		return { ok: false, reason: "invalid" };
	}
	if (data?.format !== ACCOUNT_EXPORT_FORMAT || !Array.isArray(data.tracking)) {
		return { ok: false, reason: "invalid" };
	}
	if (typeof data.version === "number" && data.version > ACCOUNT_EXPORT_VERSION) {
		return { ok: false, reason: "newer" };
	}
	const exportedAt = isDate(data.exportedAt) ? data.exportedAt : new Date().toISOString();
	const episodesByShow: Record<string, any[]> =
		data.watchedEpisodes && typeof data.watchedEpisodes === "object" ? data.watchedEpisodes : {};
	const movies = new Map<number, any>();
	for (const m of Array.isArray(data.watchedMovies) ? data.watchedMovies : []) {
		const id = isId(m?.tmdbId) ? m.tmdbId : Number(m?.id);
		if (isId(id)) movies.set(id, m);
	}

	const matches: RestoreMatch[] = [];
	const seen = new Set<string>();
	const movieMatch = (tmdbId: number, status: WatchStatus, rewatchCount?: number): RestoreMatch => {
		const watched = movies.get(tmdbId);
		return {
			tmdbId,
			mediaType: MediaType.MOVIE,
			status,
			movieWatchedAt: isDate(watched?.lastWatchedAt) ? watched.lastWatchedAt : exportedAt,
			movieRuntime: isCount(watched?.runtime) ? watched.runtime : undefined,
			movieWatchCount: isCount(watched?.watchCount) ? watched.watchCount : 1,
			rewatchCount,
		};
	};

	for (const t of data.tracking) {
		const parsedId = TRACKING_ID.exec(typeof t?.id === "string" ? t.id : "");
		if (!parsedId || seen.has(t.id)) continue;
		seen.add(t.id);
		const tmdbId = Number(parsedId[2]);
		const status: WatchStatus = STATUSES.includes(t.status) ? t.status : WatchStatus.WATCHING;
		const rewatchCount = isCount(t.rewatchCount) ? t.rewatchCount : undefined;

		if (parsedId[1] === MediaType.MOVIE) {
			matches.push(movieMatch(tmdbId, status, rewatchCount));
			continue;
		}
		const watchedEpisodes: NonNullable<RestoreMatch["watchedEpisodes"]> = [];
		for (const e of episodesByShow[String(tmdbId)] ?? []) {
			const ref = episodeRef(e);
			if (!ref) continue;
			const at = [e.watchedAt, e.lastWatchedAt].find(isDate) ?? exportedAt;
			watchedEpisodes.push({ ...ref, watchedAt: at, watchCount: isCount(e.watchCount) ? e.watchCount : 1 });
		}
		matches.push({
			tmdbId,
			mediaType: MediaType.TV,
			status,
			watchedEpisodes,
			rewatchCount,
			// null = caught up, absent = let the import work it out
			nextEpisode: "nextEpisode" in t ? episodeRef(t.nextEpisode) : undefined,
		});
	}
	// Watched movies that have no tracking doc still count as watched
	for (const tmdbId of movies.keys()) {
		if (!seen.has(`movie_${tmdbId}`)) matches.push(movieMatch(tmdbId, WatchStatus.COMPLETED));
	}

	const lists = parseLists(data.customLists);
	return matches.length > 0 || lists.length > 0
		? { ok: true, matches, lists }
		: { ok: false, reason: "empty" };
}
