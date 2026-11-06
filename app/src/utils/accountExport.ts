import {
	ACCOUNT_EXPORT_FORMAT,
	ACCOUNT_EXPORT_VERSION,
	ExportContent,
	ExportFilter,
	ExportPart,
	ExportScope,
	MediaType,
	WatchStatus,
} from "../enums";
import type { ImportedList } from "./customListsIO";
import { cleanListName } from "./customLists";

/** What exportAccountData is asked for (Settings → Export's two steps) */
export interface AccountExportOptions {
	scope: ExportScope;
	filter: ExportFilter;
	/** Empty = titles only */
	parts: ExportPart[];
}

/** The sub-filters each scope offers; ALL and LISTS have none */
export const EXPORT_FILTERS: Record<ExportScope, ExportFilter[]> = {
	[ExportScope.ALL]: [],
	[ExportScope.MOVIES]: [
		ExportFilter.ALL,
		ExportFilter.MOVIES_TO_WATCH,
		ExportFilter.MOVIES_UPCOMING,
	],
	[ExportScope.TV]: [ExportFilter.ALL, ExportFilter.TV_ENDED, ExportFilter.TV_ONGOING],
	[ExportScope.LISTS]: [],
};

/** What the second step can tick (custom lists are their own scope) */
export const EXPORT_TITLE_PARTS = [ExportPart.PROGRESS, ExportPart.HISTORY];

/**
 * The two steps' picks → the request (a filter another scope offers falls back to ALL). Custom
 * lists skip the second step: the lists alone. "All the data" of everything is a full backup —
 * the lists go in too; narrowed to movies / shows it's their progress and history
 */
export function accountExportOptions(
	scope: ExportScope,
	filter: ExportFilter,
	content: ExportContent,
	chosen: ReadonlySet<ExportPart>,
): AccountExportOptions {
	let parts: ExportPart[];
	if (scope === ExportScope.LISTS) parts = [ExportPart.LISTS];
	else if (content === ExportContent.EVERYTHING) {
		parts = scope === ExportScope.ALL ? Object.values(ExportPart) : EXPORT_TITLE_PARTS;
	} else if (content === ExportContent.CHOSEN) {
		parts = EXPORT_TITLE_PARTS.filter((p) => chosen.has(p));
	} else parts = [];
	return {
		scope,
		filter: EXPORT_FILTERS[scope].includes(filter) ? filter : ExportFilter.ALL,
		parts,
	};
}

const SCOPE_LABEL: Record<ExportScope, string> = {
	[ExportScope.ALL]: "Everything",
	[ExportScope.MOVIES]: "Movies",
	[ExportScope.TV]: "TV Shows",
	[ExportScope.LISTS]: "Custom lists",
};
const FILTER_LABEL: Record<ExportFilter, string> = {
	[ExportFilter.ALL]: "",
	[ExportFilter.MOVIES_TO_WATCH]: "To be watched",
	[ExportFilter.MOVIES_UPCOMING]: "Upcoming",
	[ExportFilter.TV_ENDED]: "Ended",
	[ExportFilter.TV_ONGOING]: "Ongoing",
};

/** One line for the exporting popup: "Movies · To be watched · Titles only", "Custom lists" */
export function describeAccountExport(options: AccountExportOptions): string {
	if (options.scope === ExportScope.LISTS) return SCOPE_LABEL[ExportScope.LISTS];
	const what = [SCOPE_LABEL[options.scope], FILTER_LABEL[options.filter]].filter(Boolean);
	const how =
		options.parts.length === 0
			? "Titles only"
			: EXPORT_TITLE_PARTS.every((p) => options.parts.includes(p))
				? "All the data"
				: "Certain data";
	return [...what, how].join(" · ");
}

/** What an import file holds, for its confirm popup: "12 shows, 4 movies and 2 lists" */
export function describeAccountImport(matches: RestoreMatch[], lists: ImportedList[]): string {
	const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
	const shows = matches.filter((m) => m.mediaType === MediaType.TV).length;
	const parts = [
		shows > 0 ? count(shows, "show", "shows") : "",
		matches.length - shows > 0 ? count(matches.length - shows, "movie", "movies") : "",
		lists.length > 0 ? count(lists.length, "list", "lists") : "",
	].filter(Boolean);
	return parts.length > 1
		? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
		: (parts[0] ?? "");
}

/** What a file holds, in its name */
const FILE_TITLES: Record<ExportScope, Partial<Record<ExportFilter, string>>> = {
	[ExportScope.ALL]: { [ExportFilter.ALL]: "All Titles" },
	[ExportScope.MOVIES]: {
		[ExportFilter.ALL]: "Movies",
		[ExportFilter.MOVIES_TO_WATCH]: "Movies to Watch",
		[ExportFilter.MOVIES_UPCOMING]: "Upcoming Movies",
	},
	[ExportScope.TV]: {
		[ExportFilter.ALL]: "TV Shows",
		[ExportFilter.TV_ENDED]: "Ended Shows",
		[ExportFilter.TV_ONGOING]: "Ongoing Shows",
	},
	[ExportScope.LISTS]: { [ExportFilter.ALL]: "Custom Lists" },
};
const FILE_MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/** The file's name in the share sheet / Files: what it holds and when, readable at a glance —
 *  "Watchloom - Full Backup - 6 Nov 2026.json", "Watchloom - Movies to Watch (Titles Only) - …" */
export function accountExportFileName(now: number, options?: AccountExportOptions): string {
	const d = new Date(now);
	const date = `${d.getDate()} ${FILE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
	let name: string;
	if (
		!options ||
		(options.scope === ExportScope.ALL && options.parts.length === Object.values(ExportPart).length)
	) {
		name = "Full Backup";
	} else if (options.scope === ExportScope.LISTS) {
		name = FILE_TITLES[ExportScope.LISTS][ExportFilter.ALL]!;
	} else {
		const titles =
			FILE_TITLES[options.scope][options.filter] ?? FILE_TITLES[options.scope][ExportFilter.ALL]!;
		const has = (p: ExportPart) => options.parts.includes(p);
		const what =
			options.parts.length === 0
				? " (Titles Only)"
				: has(ExportPart.PROGRESS) && has(ExportPart.HISTORY)
					? ""
					: has(ExportPart.PROGRESS)
						? " (Progress)"
						: " (Watch History)";
		name = `${titles}${what}`;
	}
	return `Watchloom - ${name} - ${date}.json`;
}

/** One title in the shape importMatches takes (the restore fields are optional there) */
export interface RestoreMatch {
	tmdbId: number;
	mediaType: MediaType;
	status: WatchStatus;
	watchedEpisodes?: Array<{
		season: number;
		episode: number;
		watchedAt: string;
		watchCount: number;
	}>;
	movieWatchedAt?: string | null;
	movieRuntime?: number;
	movieWatchCount?: number;
	rewatchCount?: number;
	nextEpisode?: { season: number; episode: number } | null;
}

export type AccountParseResult =
	| { ok: true; matches: RestoreMatch[]; lists: ImportedList[]; exportedAt: string }
	| { ok: false; reason: "invalid" | "newer" | "empty" };

const STATUSES = Object.values(WatchStatus) as string[];
const TRACKING_ID = /^(tv|movie)_(\d{1,9})$/;
const POSTER_PATH = /^\/[\w.-]{1,100}$/;
const TITLE_MAX = 200;

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isDate = (v: unknown): v is string => typeof v === "string" && !isNaN(new Date(v).getTime());
const isId = (v: unknown): v is number =>
	Number.isInteger(v) && (v as number) > 0 && (v as number) < 1e9;

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
			if (!isId(i?.tmdbId) || (i.mediaType !== MediaType.TV && i.mediaType !== MediaType.MOVIE))
				continue;
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
			watchedEpisodes.push({
				...ref,
				watchedAt: at,
				watchCount: isCount(e.watchCount) ? e.watchCount : 1,
			});
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
	// Watched movies that have no tracking doc still count as watched (a titles-only file has none)
	for (const tmdbId of movies.keys()) {
		if (!seen.has(`movie_${tmdbId}`)) matches.push(movieMatch(tmdbId, WatchStatus.COMPLETED));
	}

	const lists = parseLists(data.customLists);
	return matches.length > 0 || lists.length > 0
		? { ok: true, matches, lists, exportedAt }
		: { ok: false, reason: "empty" };
}
