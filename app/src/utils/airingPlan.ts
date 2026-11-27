import {
	AIRING_CAP,
	ALERT_ID,
	AlertType,
	EpisodeScope,
	MediaType,
	PictureStyle,
	QuietMode,
	WatchStatus,
} from "../enums";
import { hasAired } from "./airTime";
import { showDocId } from "./docId";
import {
	onVacation,
	snoozedUntil,
	titleSilenced,
	anyAlertOn,
	type NotifyPrefs,
} from "./notifyConfig";
import { localDateStr } from "./todayStr";

export { anyAlertOn, DEFAULT_NOTIFY_PREFS, parseNotifyPrefs, type NotifyPrefs } from "./notifyConfig";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUDGE_BODY = "Open Watchloom to keep your episode alerts coming.";
/** Expanded episode / premiere alert: the line above the picture */
export const AIRING_TODAY = "Airing today";

// ---- inputs ---------------------------------------------------------------------------------

export interface PlanEpisode {
	episodeNumber: number;
	title: string;
	airDate: string | null;
	/** Exact UTC air time (TVMaze); absent → the day only */
	airStamp?: string;
	/** TMDB still (episode alert picture) */
	stillPath?: string | null;
}

export interface PlanTitle {
	docId: string;
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	status: WatchStatus;
	/** TMDB show status ("Ended", "Canceled", "Returning Series" …) */
	showStatus?: string | null;
	/** Tracking pointer to the next episode to watch (TV); null = nothing announced */
	nextEpisode: { season: number; episode: number } | null;
	/** Movies: release day (YYYY-MM-DD) */
	releaseDate: string | null;
	/** TMDB image paths for the expanded alert picture (backdrop + title logo) */
	backdropPath?: string | null;
	logoPath?: string | null;
	seasons: { seasonNumber: number; episodes: PlanEpisode[] }[];
}

/** A pushed air-time correction (notifyAirings) — wins over the cached catalog until it has passed */
export interface AiringOverride {
	docId: string;
	season: number;
	episode: number;
	name: string;
	airStamp: string;
}

export interface PlanInput {
	now: number;
	titles: PlanTitle[];
	prefs: NotifyPrefs;
	overrides: AiringOverride[];
	/** Last time the app was opened (ms); 0 = unknown → no reopen nudge */
	lastOpenMs: number;
}

export interface PlannedAlert {
	/** Stable (see ALERT_ID): the same alert always has the same id */
	id: string;
	fireAt: number;
	title: string;
	body: string;
	type: AlertType;
	docId?: string;
	tmdbId?: number;
	mediaType?: MediaType;
	/** Expanded view: one row per episode (Android InboxStyle) */
	lines?: string[];
	/**
	 * Expanded view: a picture (TMDB path; an episode still or the backdrop) with the title logo on top and
	 * `caption` rows along its bottom. Falls back to `lines` / the body when it can't be downloaded
	 */
	image?: AlertImage;
}

export interface AlertImage {
	picturePath: string;
	/** The picture is an episode still (sized differently from a backdrop) */
	still?: boolean;
	logoPath?: string;
	caption?: string[];
	/** Expanded view: the line above the picture (in place of the title) */
	heading?: string;
}

type CatalogLike = {
	title: string;
	status?: string | null;
	releaseDate?: string | null;
	backdropPath?: string | null;
	logoPath?: string | null;
	seasons?: {
		seasonNumber: number;
		episodes?: {
			episodeNumber: number;
			title: string;
			airDate: string | null;
			airStamp?: string;
			stillPath?: string | null;
		}[];
	}[];
};

/** A tracking doc + its cached catalog show → what the planner reads; null without a cached title (no network here) */
export function toPlanTitle(
	doc: {
		tmdbId: number;
		mediaType: MediaType;
		status: WatchStatus;
		releaseDate?: string | null;
		nextEpisode?: { season: number; episode: number } | null;
	},
	catalog: CatalogLike | null | undefined,
): PlanTitle | null {
	if (!catalog?.title) return null;
	return {
		docId: showDocId(doc.tmdbId, doc.mediaType),
		tmdbId: doc.tmdbId,
		mediaType: doc.mediaType,
		title: catalog.title,
		status: doc.status,
		showStatus: catalog.status ?? null,
		nextEpisode: doc.nextEpisode ?? null,
		releaseDate: doc.releaseDate ?? catalog.releaseDate ?? null,
		backdropPath: catalog.backdropPath ?? null,
		logoPath: catalog.logoPath ?? null,
		seasons: (catalog.seasons ?? []).map((s) => ({
			seasonNumber: s.seasonNumber,
			episodes: (s.episodes ?? []).map((e) => ({
				episodeNumber: e.episodeNumber,
				title: e.title,
				airDate: e.airDate,
				...(e.airStamp ? { airStamp: e.airStamp } : {}),
				...(e.stillPath ? { stillPath: e.stillPath } : {}),
			})),
		})),
	};
}

/** Titles worth an FCM topic: tracked, not paused, movies not yet watched */
export function topicDocIds(
	docs: { tmdbId: number; mediaType: MediaType; status: WatchStatus }[],
): string[] {
	return docs.filter((d) => isActive(d.status) && !(d.mediaType === MediaType.MOVIE && d.status === WatchStatus.COMPLETED))
		.map((d) => showDocId(d.tmdbId, d.mediaType));
}

function isActive(status: WatchStatus): boolean {
	return status !== WatchStatus.PAUSED && status !== WatchStatus.PAUSED_REWATCH;
}

/** TMDB's closing statuses */
export function isEndedStatus(status: string | null | undefined): boolean {
	return status === "Ended" || status === "Canceled";
}

// ---- overrides ------------------------------------------------------------------------------

/** Corrections whose air time is more than a day past are dropped */
export function pruneOverrides(list: AiringOverride[], now: number): AiringOverride[] {
	return list.filter((o) => {
		const t = Date.parse(o.airStamp);
		return !Number.isNaN(t) && t > now - DAY_MS;
	});
}

/** `incoming` replaces an older correction of the same episode */
export function mergeOverrides(existing: AiringOverride[], incoming: AiringOverride[]): AiringOverride[] {
	const key = (o: AiringOverride) => `${o.docId}|${o.season}|${o.episode}`;
	const merged = new Map(existing.map((o) => [key(o), o]));
	for (const o of incoming) merged.set(key(o), o);
	return [...merged.values()];
}

// ---- time helpers (local wall clock; DST-safe: Date normalises the day shift) -----------------

/** Local ms of "YYYY-MM-DD" at `hour`, `days` calendar days later */
function localAt(date: string, hour: number, days = 0): number {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d + days, hour, 0, 0, 0).getTime();
}

type Quiet = NotifyPrefs["quiet"];

/** Inside the quiet window (it may cross midnight: 22 → 8; start = end means never) */
function inQuietWindow(ms: number, q: Quiet): boolean {
	const hour = new Date(ms).getHours();
	if (q.startHour === q.endHour) return false;
	return q.startHour > q.endHour ? hour >= q.startHour || hour < q.endHour : hour >= q.startHour && hour < q.endHour;
}

/** Quiet hours apply to this moment: on, a quiet weekday, inside the window */
function isQuiet(ms: number, prefs: NotifyPrefs): boolean {
	const q = prefs.quiet;
	return q.on && q.days.includes(new Date(ms).getDay()) && inQuietWindow(ms, q);
}

/** The morning hour an alert landing in quiet hours waits for (never before the window ends) */
function nextMorning(ms: number, q: Quiet): number {
	const d = new Date(ms);
	const overnight = q.startHour > q.endHour;
	const nextDay = overnight && d.getHours() >= q.startHour ? 1 : 0;
	const at = (hour: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + nextDay, hour, 0, 0, 0).getTime();
	return Math.max(at(q.morningHour), at(q.endHour));
}

/**
 * When a one-off alert (a show ended, a new season, a moved air time) should show: now, or the morning hour when
 * it lands in quiet hours; null when quiet hours drop it. A pause, snooze or vacation also holds it back (null)
 */
export function oneOffTime(prefs: NotifyPrefs, now: number): number | null {
	if (!anyAlertOn(prefs) || snoozedUntil(prefs, now) > 0 || onVacation(prefs, now)) return null;
	if (!isQuiet(now, prefs)) return now;
	return prefs.quiet.mode === QuietMode.DROP ? null : nextMorning(now, prefs.quiet);
}

// ---- episodes ---------------------------------------------------------------------------------

enum EntryKind {
	EPISODE,
	PREMIERE,
	FINALE,
	SERIES_FINALE,
}

interface AirEpisode {
	docId: string;
	tmdbId: number;
	mediaType: MediaType;
	show: string;
	season: number;
	episode: number;
	name: string;
	/** The moment it airs (exact stamp, else the default hour of its day) */
	at: number;
	/** `at` is an exact air time (not a date's default hour) */
	timed: boolean;
	/** The last episode of its season in the catalog */
	last: boolean;
	/** The show is over and this closes its final season */
	seriesEnd: boolean;
	stillPath?: string;
	backdropPath?: string;
	logoPath?: string;
}

function episodeTime(e: PlanEpisode, defaultHour: number): number {
	const stamp = e.airStamp ? Date.parse(e.airStamp) : NaN;
	if (!Number.isNaN(stamp)) return stamp;
	return e.airDate && DATE_RE.test(e.airDate) ? localAt(e.airDate, defaultHour) : NaN;
}

function titleEpisodes(t: PlanTitle, overrides: AiringOverride[], defaultHour: number): AirEpisode[] {
	const pushed = new Map(
		overrides.filter((o) => o.docId === t.docId).map((o) => [`${o.season}x${o.episode}`, o]),
	);
	const base = {
		docId: t.docId,
		tmdbId: t.tmdbId,
		mediaType: t.mediaType,
		show: t.title,
		...(t.backdropPath ? { backdropPath: t.backdropPath } : {}),
		...(t.logoPath ? { logoPath: t.logoPath } : {}),
	};
	const finalSeason = Math.max(0, ...t.seasons.map((s) => s.seasonNumber));
	const ended = isEndedStatus(t.showStatus);
	const out: AirEpisode[] = [];
	const seen = new Set<string>();
	for (const season of t.seasons) {
		const lastNumber = Math.max(0, ...season.episodes.map((e) => e.episodeNumber));
		for (const e of season.episodes) {
			const key = `${season.seasonNumber}x${e.episodeNumber}`;
			seen.add(key);
			const o = pushed.get(key);
			const at = o ? Date.parse(o.airStamp) : episodeTime(e, defaultHour);
			if (Number.isNaN(at)) continue;
			const last = e.episodeNumber === lastNumber && season.seasonNumber > 0;
			out.push({
				...base,
				season: season.seasonNumber,
				episode: e.episodeNumber,
				name: o?.name || e.title,
				at,
				timed: !!o || !!e.airStamp,
				last,
				seriesEnd: last && ended && season.seasonNumber === finalSeason,
				...(e.stillPath ? { stillPath: e.stillPath } : {}),
			});
		}
	}
	// A pushed episode the cached catalog doesn't know yet
	for (const [key, o] of pushed) {
		if (seen.has(key)) continue;
		const at = Date.parse(o.airStamp);
		if (!Number.isNaN(at))
			out.push({ ...base, season: o.season, episode: o.episode, name: o.name, at, timed: true, last: false, seriesEnd: false });
	}
	return out;
}

interface Entry {
	ep: AirEpisode;
	fireAt: number;
	kind: EntryKind;
	/** Landed in quiet hours, moved to the morning hour */
	deferred: boolean;
}

const GENERIC_NAME = /^Episode \d+$/i;

const MINUTE_MS = 60 * 1000;

function episodeName(e: AirEpisode, spoilerSafe: boolean): string {
	return !spoilerSafe && e.name && !GENERIC_NAME.test(e.name) ? e.name : "";
}

function episodeBody(e: AirEpisode, kind: EntryKind, spoilerSafe: boolean): string {
	const named = episodeName(e, spoilerSafe);
	const name = named ? ` · ${named}` : "";
	switch (kind) {
		case EntryKind.PREMIERE:
			return `Season ${e.season} premiere${name}`;
		case EntryKind.SERIES_FINALE:
			return `Series finale${name}`;
		case EntryKind.FINALE:
			return `Season ${e.season} finale${name}`;
		default:
			return `S${e.season} E${e.episode}${name}`;
	}
}

/** At most `max` rows; the overflow becomes a "+N more" row */
function capLines(lines: string[], max: number): string[] {
	if (lines.length <= max) return lines;
	return [...lines.slice(0, max - 1), `+${lines.length - max + 1} more`];
}

const byEpisode = (a: Entry, b: Entry) => a.ep.season - b.ep.season || a.ep.episode - b.ep.episode;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The caption row under the first episode: "1 more episode", "7 more episodes" */
export function moreEpisodes(more: number): string {
	return `${more} more episode${more === 1 ? "" : "s"}`;
}

/** "S01E04" */
export function episodeCode(season: number, episode: number): string {
	return `S${pad2(season)}E${pad2(episode)}`;
}

/**
 * One title's alert picture: a premiere / finale shows the backdrop ("Season 2 Premiere"), an episode its still
 * (backdrop when it has none) with "S01E04"; several episodes add an "N more episodes" row. Spoiler-safe alerts
 * never use a still or the episode name. Null without a picture
 */
function titleImage(sorted: Entry[], spoilerSafe: boolean): AlertImage | null {
	const { ep, kind } = sorted[0];
	const backdropFirst = kind !== EntryKind.EPISODE || spoilerSafe;
	const picturePath = spoilerSafe
		? ep.backdropPath
		: backdropFirst
			? (ep.backdropPath ?? ep.stillPath)
			: (ep.stillPath ?? ep.backdropPath);
	if (!picturePath) return null;
	const name = episodeName(ep, spoilerSafe);
	const code = episodeCode(ep.season, ep.episode);
	const first =
		kind === EntryKind.PREMIERE
			? `Season ${ep.season} Premiere`
			: kind === EntryKind.SERIES_FINALE
				? "Series Finale"
				: kind === EntryKind.FINALE
					? `Season ${ep.season} Finale`
					: name
						? `${code} · ${name}`
						: code;
	const caption = [first];
	if (sorted.length > 1) caption.push(moreEpisodes(sorted.length - 1));
	return {
		picturePath,
		...(picturePath === ep.stillPath ? { still: true } : {}),
		...(ep.logoPath ? { logoPath: ep.logoPath } : {}),
		caption,
		heading: AIRING_TODAY,
	};
}

function groupType(group: Entry[]): AlertType {
	if (group.some((g) => g.kind === EntryKind.PREMIERE)) return AlertType.PREMIERE;
	if (group.some((g) => g.kind === EntryKind.SERIES_FINALE)) return AlertType.SERIES_FINALE;
	if (group.some((g) => g.kind === EntryKind.FINALE)) return AlertType.FINALE;
	return AlertType.EPISODE;
}

function groupAlert(group: Entry[], prefs: NotifyPrefs, split: boolean): PlannedAlert {
	const sorted = [...group].sort(byEpisode);
	const first = sorted[0];
	const { ep, fireAt } = first;
	const many = sorted.length > 1;
	const { spoilerSafe, picture } = prefs.look;
	const image = picture === PictureStyle.RICH ? titleImage(sorted, spoilerSafe) : null;
	return {
		// Split episodes of one minute need their own ids
		id: `${ALERT_ID.AIR}${ep.docId}-${fireAt}${split ? `-${ep.season}x${ep.episode}` : ""}`,
		fireAt,
		title: ep.show,
		body: many ? `${sorted.length} new episodes` : episodeBody(ep, first.kind, spoilerSafe),
		...(many ? { lines: capLines(sorted.map((g) => episodeBody(g.ep, g.kind, spoilerSafe)), prefs.grouping.maxRows) } : {}),
		...(image ? { image } : {}),
		type: groupType(group),
		docId: ep.docId,
		tmdbId: ep.tmdbId,
		mediaType: ep.mediaType,
	};
}

function episodeAlerts(episodes: AirEpisode[], prefs: NotifyPrefs, now: number, horizon: number): PlannedAlert[] {
	const entries: Entry[] = [];
	const headsUps: PlannedAlert[] = [];
	const { episodes: eps, premieres, finales, quiet, grouping, look } = prefs;
	for (const ep of episodes) {
		if (ep.at > horizon) continue;
		const premiere = ep.episode === 1 && ep.season > 0 && premieres.on;
		const finale = !premiere && ep.last && finales.on;
		// A premiere / finale with its own switch off is a plain new episode
		if (!premiere && !finale && !eps.on) continue;
		const kind = premiere
			? EntryKind.PREMIERE
			: finale
				? ep.seriesEnd
					? EntryKind.SERIES_FINALE
					: EntryKind.FINALE
				: EntryKind.EPISODE;
		const base = ep.timed ? ep.at - eps.leadMin * MINUTE_MS : ep.at;
		let quietNow = isQuiet(base, prefs);
		if (quietNow && quiet.mode === QuietMode.DROP) continue;
		if (quietNow && quiet.mode === QuietMode.IMPORTANT && kind !== EntryKind.EPISODE) quietNow = false;
		const fireAt = quietNow ? nextMorning(base, quiet) : base;
		// Aired already: only a quiet-hours alert still waiting for its morning stays planned
		if (fireAt > now) entries.push({ ep, fireAt, kind, deferred: quietNow });
		// The day before a premiere
		if (premiere && premieres.dayBefore) {
			const day = localDateStr(new Date(ep.at));
			const headsUp = localAt(day, prefs.timing.defaultHour, -1);
			if (headsUp > now && headsUp <= horizon) {
				headsUps.push({
					id: `${ALERT_ID.HEADSUP}${ep.docId}-${ep.season}`,
					fireAt: headsUp,
					title: ep.show,
					body: `Season ${ep.season} premieres tomorrow`,
					type: AlertType.HEADSUP,
					docId: ep.docId,
					tmdbId: ep.tmdbId,
					mediaType: ep.mediaType,
				});
			}
		}
	}
	// Same title, same minute → one alert ("Scrubs: 8 new episodes"); split: one alert per episode
	const split = !grouping.combineEpisodes;
	const groups = new Map<string, Entry[]>();
	for (const entry of entries) {
		const key = `${entry.ep.docId}|${entry.fireAt}${split ? `|${entry.ep.season}x${entry.ep.episode}` : ""}`;
		const list = groups.get(key);
		if (list) list.push(entry);
		else groups.set(key, [entry]);
	}
	const out: PlannedAlert[] = [...headsUps];
	const overnight = new Map<number, Entry[][]>();
	for (const group of groups.values()) {
		if (!grouping.overnight || !group.some((g) => g.deferred)) {
			out.push(groupAlert(group, prefs, split));
			continue;
		}
		const list = overnight.get(group[0].fireAt);
		if (list) list.push(group);
		else overnight.set(group[0].fireAt, [group]);
	}
	// Several titles overnight → one grouped morning alert; a single title keeps its own
	for (const [fireAt, titles] of overnight) {
		if (titles.length < 2) {
			out.push(groupAlert(titles[0], prefs, split));
			continue;
		}
		const total = titles.reduce((n, g) => n + g.length, 0);
		const ordered = titles.map((g) => [...g].sort(byEpisode)).sort((a, b) => a[0].ep.show.localeCompare(b[0].ep.show));
		const rows = ordered.flatMap((g) => g.map((e) => `${e.ep.show} · ${episodeBody(e.ep, e.kind, look.spoilerSafe)}`));
		out.push({
			id: `${ALERT_ID.MORNING}${localDateStr(new Date(fireAt))}`,
			fireAt,
			title: `${total} Episodes to Watch Today`,
			body: ordered.map((g) => g[0].ep.show).join(", "),
			type: AlertType.MORNING,
			lines: capLines(rows, grouping.maxRows),
		});
	}
	return out;
}

// ---- movies, digests, backlog, nudge ------------------------------------------------------------

function movieAlerts(movies: PlanTitle[], prefs: NotifyPrefs, now: number, horizon: number): PlannedAlert[] {
	const out: PlannedAlert[] = [];
	const hour = prefs.timing.defaultHour;
	for (const t of movies) {
		const date = t.releaseDate;
		if (!date || !DATE_RE.test(date)) continue;
		const ref = { docId: t.docId, tmdbId: t.tmdbId, mediaType: t.mediaType };
		const release = localAt(date, hour);
		if (prefs.movies.releaseOn && release > now && release <= horizon) {
			out.push({
				id: `${ALERT_ID.MOVIE}${t.docId}-${date}`,
				fireAt: release,
				title: t.title,
				body: "Out today",
				type: AlertType.MOVIE,
				...ref,
				...(t.backdropPath && prefs.look.picture === PictureStyle.RICH
					? {
							image: { picturePath: t.backdropPath, ...(t.logoPath ? { logoPath: t.logoPath } : {}) },
						}
					: {}),
			});
		}
		if (!prefs.movies.remindOn) continue;
		for (const days of new Set(prefs.movies.remindDays)) {
			const remind = localAt(date, hour, -days);
			if (!(remind > now && remind <= horizon)) continue;
			out.push({
				// The week-before reminder keeps its original id
				id: `${ALERT_ID.REMINDER}${t.docId}-${date}${days === 7 ? "" : `-${days}`}`,
				fireAt: remind,
				title: t.title,
				body: days === 1 ? "Out tomorrow" : `Out in ${days} days`,
				type: AlertType.MOVIE_REMINDER,
				...ref,
			});
		}
	}
	return out;
}

/** "A, B, C, +N more" */
function nameList(names: string[]): string {
	const more = names.length - 3;
	return `${names.slice(0, 3).join(", ")}${more > 0 ? `, +${more} more` : ""}`;
}

/** Titles airing on each local day (episodes and movie releases) */
function namesOn(episodes: AirEpisode[], movies: PlanTitle[], from: string, to: string): string[] {
	const names = new Set<string>();
	for (const ep of episodes) {
		const date = localDateStr(new Date(ep.at));
		if (date >= from && date <= to) names.add(ep.show);
	}
	for (const m of movies) if (m.releaseDate && m.releaseDate >= from && m.releaseDate <= to) names.add(m.title);
	return [...names];
}

function digestAlerts(
	episodes: AirEpisode[],
	movies: PlanTitle[],
	prefs: NotifyPrefs,
	now: number,
	horizon: number,
): PlannedAlert[] {
	const out: PlannedAlert[] = [];
	const start = new Date(now);
	const { weeklyDigest: weekly, dailyDigest: daily } = prefs;
	for (let i = 0; i <= prefs.timing.horizonDays; i++) {
		const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		const date = localDateStr(day);
		if (weekly.on && day.getDay() === weekly.weekday) {
			const fireAt = localAt(date, weekly.hour);
			if (fireAt > now && fireAt <= horizon) {
				// The days after the digest day (that day itself is excluded)
				const from = localDateStr(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
				const to = localDateStr(new Date(day.getFullYear(), day.getMonth(), day.getDate() + weekly.windowDays));
				const names = namesOn(episodes, movies, from, to);
				if (names.length > 0) {
					out.push({
						id: `${ALERT_ID.DIGEST}${date}`,
						fireAt,
						title: "Your Week Ahead",
						body: nameList(names),
						type: AlertType.DIGEST,
					});
				}
			}
		}
		if (daily.on) {
			const fireAt = localAt(date, daily.hour);
			if (fireAt > now && fireAt <= horizon) {
				const names = namesOn(episodes, movies, date, date);
				if (names.length > 0) {
					out.push({
						id: `${ALERT_ID.DAILY}${date}`,
						fireAt,
						title: "Airing Today",
						body: nameList(names),
						type: AlertType.DAILY,
						...(names.length > 1 ? { lines: capLines(names, prefs.grouping.maxRows) } : {}),
					});
				}
			}
		}
	}
	return out;
}

/** Aired episodes from the tracking pointer on, summed over shows the user fell behind on */
function backlogCounts(
	shows: PlanTitle[],
	overrides: AiringOverride[],
	prefs: NotifyPrefs,
	now: number,
): { titles: number; episodes: number } {
	let titles = 0;
	let episodes = 0;
	for (const t of shows) {
		if (!t.nextEpisode || isCaughtUp(t, overrides, now, prefs)) continue;
		let count = 0;
		for (const e of titleEpisodes(t, overrides, prefs.timing.defaultHour)) {
			if (e.season > 0 && fromNext(e, t.nextEpisode) && e.at <= now) count++;
		}
		if (count > 0) {
			titles++;
			episodes += count;
		}
	}
	return { titles, episodes };
}

function backlogAlert(counts: { titles: number; episodes: number }, prefs: NotifyPrefs, now: number, horizon: number): PlannedAlert[] {
	if (!prefs.backlog.on || counts.episodes === 0) return [];
	const start = new Date(now);
	for (let i = 0; i <= 7; i++) {
		const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		if (day.getDay() !== prefs.backlog.weekday) continue;
		const date = localDateStr(day);
		const fireAt = localAt(date, prefs.backlog.hour);
		if (fireAt <= now || fireAt > horizon) continue;
		const e = counts.episodes;
		const t = counts.titles;
		return [
			{
				id: `${ALERT_ID.BACKLOG}${date}`,
				fireAt,
				title: "Catch Up",
				body: `${e} unwatched episode${e === 1 ? "" : "s"} across ${t} show${t === 1 ? "" : "s"}`,
				type: AlertType.BACKLOG,
			},
		];
	}
	return [];
}

function nudgeAlert(lastOpenMs: number, now: number, prefs: NotifyPrefs): PlannedAlert | null {
	if (!(lastOpenMs > 0) || !prefs.nudge.on) return null;
	const fireAt = localAt(localDateStr(new Date(lastOpenMs)), prefs.timing.defaultHour, prefs.nudge.days);
	if (fireAt <= now) return null;
	return { id: ALERT_ID.NUDGE, fireAt, title: "Watchloom", body: NUDGE_BODY, type: AlertType.NUDGE };
}

/**
 * Caught up: the tracking nextEpisode exists in the catalog and has NOT aired yet. A title whose next
 * episode already aired is a backlog and gets no episode alerts
 */
function isCaughtUp(t: PlanTitle, overrides: AiringOverride[], now: number, prefs: NotifyPrefs): boolean {
	const next = t.nextEpisode;
	if (!next) return false;
	const e = t.seasons.find((s) => s.seasonNumber === next.season)?.episodes.find((x) => x.episodeNumber === next.episode);
	const o = overrides.find((x) => x.docId === t.docId && x.season === next.season && x.episode === next.episode);
	if (!e && !o) return false;
	if (!hasAired(o?.airStamp ?? e?.airStamp, e?.airDate, localDateStr(new Date(now)), now)) return true;
	// Aired overnight and its morning alert hasn't fired yet: still caught up (a replan must not cancel it)
	const at = o ? Date.parse(o.airStamp) : e ? episodeTime(e, prefs.timing.defaultHour) : NaN;
	return !Number.isNaN(at) && prefs.quiet.mode !== QuietMode.DROP && isQuiet(at, prefs) && nextMorning(at, prefs.quiet) > now;
}

/** Only episodes from the tracking nextEpisode onward are alerted */
function fromNext(e: AirEpisode, next: { season: number; episode: number } | null): boolean {
	if (!next) return false;
	return e.season > next.season || (e.season === next.season && e.episode >= next.episode);
}

// ---- cap per day, pause / vacation -------------------------------------------------------------

const COUNTED_PER_DAY = new Set<AlertType>([
	AlertType.EPISODE,
	AlertType.PREMIERE,
	AlertType.FINALE,
	AlertType.SERIES_FINALE,
	AlertType.MOVIE,
	AlertType.MORNING,
]);

/** More than `max` alerts on one local day: the first `max` stay, the rest become one "N more" alert */
function capPerDay(alerts: PlannedAlert[], max: number): PlannedAlert[] {
	if (max <= 0) return alerts;
	const perDay = new Map<string, PlannedAlert[]>();
	for (const a of alerts) {
		if (!COUNTED_PER_DAY.has(a.type)) continue;
		const day = localDateStr(new Date(a.fireAt));
		const list = perDay.get(day);
		if (list) list.push(a);
		else perDay.set(day, [a]);
	}
	const dropped = new Set<string>();
	const rolled: PlannedAlert[] = [];
	for (const [day, list] of perDay) {
		if (list.length <= max) continue;
		const rest = list.slice(max);
		for (const a of rest) dropped.add(a.id);
		const names = [...new Set(rest.map((a) => a.title))];
		rolled.push({
			id: `${ALERT_ID.OVERFLOW}${day}`,
			fireAt: rest[0].fireAt,
			title: `${rest.length} More Alert${rest.length === 1 ? "" : "s"} Today`,
			body: nameList(names),
			type: AlertType.OVERFLOW,
			lines: names,
		});
	}
	return [...alerts.filter((a) => !dropped.has(a.id)), ...rolled];
}

// ---- the plan ------------------------------------------------------------------------------------

/**
 * Every alert to have scheduled right now: the next `timing.horizonDays` from the cached catalog, tracking
 * state, the user's switches, muted titles, quiet hours, pauses and pushed corrections. Pure and deterministic —
 * ids are stable, so applying it twice changes nothing. All off → nothing (not even the reopen nudge).
 * At most AIRING_CAP, nearest first
 */
export function buildAiringPlan(input: PlanInput): PlannedAlert[] {
	const { now, titles, prefs, overrides, lastOpenMs } = input;
	if (!anyAlertOn(prefs)) return [];
	const horizon = now + prefs.timing.horizonDays * DAY_MS;
	const allowed = titles.filter((t) => !titleSilenced(prefs, t.docId, now));
	const active = allowed.filter((t) => isActive(t.status));
	const watching = (t: PlanTitle) => t.status === WatchStatus.WATCHING || t.status === WatchStatus.REWATCHING;
	const tv = allowed.filter((t) => t.mediaType === MediaType.TV);
	// Episode alerts: which shows depends on the scope
	const scope = prefs.episodes.scope;
	const shows = tv.filter((t) => {
		if (scope === EpisodeScope.TRACKED) return isActive(t.status);
		if (scope === EpisodeScope.WATCHING) return watching(t);
		return watching(t) && isCaughtUp(t, overrides, now, prefs);
	});
	const movies = active.filter((t) => t.mediaType === MediaType.MOVIE && t.status !== WatchStatus.COMPLETED);
	const episodes = shows.flatMap((t) =>
		titleEpisodes(t, overrides, prefs.timing.defaultHour).filter(
			(e) => (!prefs.episodes.skipSpecials || e.season > 0) && (scope === EpisodeScope.CAUGHT_UP ? fromNext(e, t.nextEpisode) : true),
		),
	);

	const backlog = backlogAlert(backlogCounts(tv.filter(watching), overrides, prefs, now), prefs, now, horizon);
	const snoozed = snoozedUntil(prefs, now);
	const alerts = capPerDay(
		[
			...episodeAlerts(episodes, prefs, now, horizon),
			...movieAlerts(movies, prefs, now, horizon),
			...digestAlerts(episodes, movies, prefs, now, horizon),
			...backlog,
		]
			// A snooze or a vacation drops what falls inside it
			.filter((a) => a.fireAt >= snoozed && !onVacation(prefs, a.fireAt))
			.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id)),
		prefs.timing.maxPerDay,
	);

	const nudge = nudgeAlert(lastOpenMs, now, prefs);
	const nudgeOk = nudge && nudge.fireAt >= snoozed && !onVacation(prefs, nudge.fireAt) ? nudge : null;
	const kept = alerts
		.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id))
		.slice(0, AIRING_CAP - (nudgeOk ? 1 : 0));
	if (nudgeOk) kept.push(nudgeOk);
	return kept.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
}
