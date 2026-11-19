import {
	AIRING_CAP,
	AIRING_HORIZON_DAYS,
	AIRING_MORNING_HOUR,
	AIRING_NUDGE_DAYS,
	AIRING_QUIET_END_HOUR,
	AIRING_QUIET_START_HOUR,
	ALERT_ID,
	AlertType,
	MediaType,
	WatchStatus,
} from "../enums";
import { hasAired } from "./airTime";
import { showDocId } from "./docId";
import { NotificationKind } from "./settingsOptions";
import { localDateStr } from "./todayStr";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUDGE_BODY = "Open Watchloom to keep your episode alerts coming.";

// ---- switches -------------------------------------------------------------------------------

export type NotifyPrefs = Record<NotificationKind, boolean>;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
	[NotificationKind.PREMIERES]: true,
	[NotificationKind.NEW_EPISODES]: true,
	[NotificationKind.MOVIE_REMINDERS]: true,
	[NotificationKind.WEEKLY_DIGEST]: true,
	[NotificationKind.QUIET_HOURS]: true,
};

/** Saved switches (JSON) over the defaults; anything unreadable keeps the defaults */
export function parseNotifyPrefs(raw: string | null | undefined): NotifyPrefs {
	const prefs = { ...DEFAULT_NOTIFY_PREFS };
	if (!raw) return prefs;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown> | null;
		for (const kind of Object.values(NotificationKind)) {
			const value = parsed?.[kind];
			if (typeof value === "boolean") prefs[kind] = value;
		}
	} catch {}
	return prefs;
}

/** Any alert switch on (quiet hours alone sends nothing) */
export function anyAlertOn(prefs: NotifyPrefs): boolean {
	return (
		prefs[NotificationKind.PREMIERES] ||
		prefs[NotificationKind.NEW_EPISODES] ||
		prefs[NotificationKind.MOVIE_REMINDERS] ||
		prefs[NotificationKind.WEEKLY_DIGEST]
	);
}

// ---- inputs ---------------------------------------------------------------------------------

export interface PlanEpisode {
	episodeNumber: number;
	title: string;
	airDate: string | null;
	/** Exact UTC air time (TVMaze); absent → the day only */
	airStamp?: string;
}

export interface PlanTitle {
	docId: string;
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	status: WatchStatus;
	/** Tracking pointer to the next episode to watch (TV); null = nothing announced */
	nextEpisode: { season: number; episode: number } | null;
	/** Movies: release day (YYYY-MM-DD) */
	releaseDate: string | null;
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
}

type CatalogLike = {
	title: string;
	releaseDate?: string | null;
	seasons?: {
		seasonNumber: number;
		episodes?: { episodeNumber: number; title: string; airDate: string | null; airStamp?: string }[];
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
		nextEpisode: doc.nextEpisode ?? null,
		releaseDate: doc.releaseDate ?? catalog.releaseDate ?? null,
		seasons: (catalog.seasons ?? []).map((s) => ({
			seasonNumber: s.seasonNumber,
			episodes: (s.episodes ?? []).map((e) => ({
				episodeNumber: e.episodeNumber,
				title: e.title,
				airDate: e.airDate,
				...(e.airStamp ? { airStamp: e.airStamp } : {}),
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

function isQuiet(ms: number): boolean {
	const hour = new Date(ms).getHours();
	return hour >= AIRING_QUIET_START_HOUR || hour < AIRING_QUIET_END_HOUR;
}

/** The 9 am an alert landing in quiet hours waits for (before 8 am → today, from 10 pm → tomorrow) */
function nextMorning(ms: number): number {
	const d = new Date(ms);
	const nextDay = d.getHours() >= AIRING_QUIET_START_HOUR ? 1 : 0;
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + nextDay, AIRING_MORNING_HOUR, 0, 0, 0).getTime();
}

// ---- episodes ---------------------------------------------------------------------------------

interface AirEpisode {
	docId: string;
	tmdbId: number;
	mediaType: MediaType;
	show: string;
	season: number;
	episode: number;
	name: string;
	/** The moment it airs (exact stamp, else 9 am local of its day) */
	at: number;
}

function episodeTime(e: PlanEpisode): number {
	const stamp = e.airStamp ? Date.parse(e.airStamp) : NaN;
	if (!Number.isNaN(stamp)) return stamp;
	return e.airDate && DATE_RE.test(e.airDate) ? localAt(e.airDate, AIRING_MORNING_HOUR) : NaN;
}

function titleEpisodes(t: PlanTitle, overrides: AiringOverride[]): AirEpisode[] {
	const pushed = new Map(
		overrides.filter((o) => o.docId === t.docId).map((o) => [`${o.season}x${o.episode}`, o]),
	);
	const base = { docId: t.docId, tmdbId: t.tmdbId, mediaType: t.mediaType, show: t.title };
	const out: AirEpisode[] = [];
	const seen = new Set<string>();
	for (const season of t.seasons) {
		for (const e of season.episodes) {
			const key = `${season.seasonNumber}x${e.episodeNumber}`;
			seen.add(key);
			const o = pushed.get(key);
			const at = o ? Date.parse(o.airStamp) : episodeTime(e);
			if (Number.isNaN(at)) continue;
			out.push({ ...base, season: season.seasonNumber, episode: e.episodeNumber, name: o?.name || e.title, at });
		}
	}
	// A pushed episode the cached catalog doesn't know yet
	for (const [key, o] of pushed) {
		if (seen.has(key)) continue;
		const at = Date.parse(o.airStamp);
		if (!Number.isNaN(at)) out.push({ ...base, season: o.season, episode: o.episode, name: o.name, at });
	}
	return out;
}

interface Entry {
	ep: AirEpisode;
	fireAt: number;
	/** Counts as a season premiere alert (E1 with the premieres switch on) */
	premiere: boolean;
	/** Landed in quiet hours, moved to 9 am */
	deferred: boolean;
}

const GENERIC_NAME = /^Episode \d+$/i;

function episodeBody(e: AirEpisode, premiere: boolean): string {
	const name = e.name && !GENERIC_NAME.test(e.name) ? ` · ${e.name}` : "";
	return premiere ? `Season ${e.season} premiere${name}` : `S${e.season} E${e.episode}${name}`;
}

function groupAlert(group: Entry[]): PlannedAlert {
	const first = group[0];
	const { ep, fireAt } = first;
	return {
		id: `${ALERT_ID.AIR}${ep.docId}-${fireAt}`,
		fireAt,
		title: ep.show,
		body: group.length === 1 ? episodeBody(ep, first.premiere) : `${group.length} new episodes`,
		type: group.some((g) => g.premiere) ? AlertType.PREMIERE : AlertType.EPISODE,
		docId: ep.docId,
		tmdbId: ep.tmdbId,
		mediaType: ep.mediaType,
	};
}

function episodeAlerts(episodes: AirEpisode[], prefs: NotifyPrefs, now: number, horizon: number): PlannedAlert[] {
	const entries: Entry[] = [];
	for (const ep of episodes) {
		if (ep.at <= now || ep.at > horizon) continue;
		const premiere = ep.episode === 1 && prefs[NotificationKind.PREMIERES];
		// A premiere with its switch off is a plain new episode
		if (!premiere && !prefs[NotificationKind.NEW_EPISODES]) continue;
		const quiet = prefs[NotificationKind.QUIET_HOURS] && isQuiet(ep.at);
		entries.push({ ep, fireAt: quiet ? nextMorning(ep.at) : ep.at, premiere, deferred: quiet });
	}
	// Same title, same minute → one alert ("Scrubs: 8 new episodes")
	const groups = new Map<string, Entry[]>();
	for (const entry of entries) {
		const key = `${entry.ep.docId}|${entry.fireAt}`;
		const list = groups.get(key);
		if (list) list.push(entry);
		else groups.set(key, [entry]);
	}
	const out: PlannedAlert[] = [];
	const overnight = new Map<number, Entry[][]>();
	for (const group of groups.values()) {
		if (!group.some((g) => g.deferred)) {
			out.push(groupAlert(group));
			continue;
		}
		const list = overnight.get(group[0].fireAt);
		if (list) list.push(group);
		else overnight.set(group[0].fireAt, [group]);
	}
	// Several titles overnight → one grouped 9 am alert; a single title keeps its own
	for (const [fireAt, titles] of overnight) {
		if (titles.length < 2) {
			out.push(groupAlert(titles[0]));
			continue;
		}
		const total = titles.reduce((n, g) => n + g.length, 0);
		out.push({
			id: `${ALERT_ID.MORNING}${localDateStr(new Date(fireAt))}`,
			fireAt,
			title: "New Episodes",
			body: `${total} new episodes landed overnight`,
			type: AlertType.MORNING,
		});
	}
	return out;
}

// ---- movies, digest, nudge ---------------------------------------------------------------------

function movieAlerts(movies: PlanTitle[], prefs: NotifyPrefs, now: number, horizon: number): PlannedAlert[] {
	const out: PlannedAlert[] = [];
	for (const t of movies) {
		const date = t.releaseDate;
		if (!date || !DATE_RE.test(date)) continue;
		const ref = { docId: t.docId, tmdbId: t.tmdbId, mediaType: t.mediaType };
		const release = localAt(date, AIRING_MORNING_HOUR);
		if (prefs[NotificationKind.PREMIERES] && release > now && release <= horizon) {
			out.push({
				id: `${ALERT_ID.MOVIE}${t.docId}-${date}`,
				fireAt: release,
				title: t.title,
				body: "Out today",
				type: AlertType.MOVIE,
				...ref,
			});
		}
		const remind = localAt(date, AIRING_MORNING_HOUR, -7);
		if (prefs[NotificationKind.MOVIE_REMINDERS] && remind > now && remind <= horizon) {
			out.push({
				id: `${ALERT_ID.REMINDER}${t.docId}-${date}`,
				fireAt: remind,
				title: t.title,
				body: "Out in 7 days",
				type: AlertType.MOVIE_REMINDER,
				...ref,
			});
		}
	}
	return out;
}

function digestAlerts(
	episodes: AirEpisode[],
	movies: PlanTitle[],
	now: number,
	horizon: number,
): PlannedAlert[] {
	const out: PlannedAlert[] = [];
	const start = new Date(now);
	for (let i = 0; i <= AIRING_HORIZON_DAYS; i++) {
		const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		if (day.getDay() !== 0) continue;
		const sunday = localDateStr(day);
		const fireAt = localAt(sunday, AIRING_MORNING_HOUR);
		if (fireAt <= now || fireAt > horizon) continue;
		// Monday … Saturday ahead (today, the Sunday, is excluded)
		const from = localDateStr(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
		const to = localDateStr(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 6));
		const names = new Set<string>();
		for (const ep of episodes) {
			const date = localDateStr(new Date(ep.at));
			if (date >= from && date <= to) names.add(ep.show);
		}
		for (const m of movies) if (m.releaseDate && m.releaseDate >= from && m.releaseDate <= to) names.add(m.title);
		if (names.size === 0) continue;
		const list = [...names];
		const more = list.length - 3;
		out.push({
			id: `${ALERT_ID.DIGEST}${sunday}`,
			fireAt,
			title: "Your Week Ahead",
			body: `${list.slice(0, 3).join(", ")}${more > 0 ? `, +${more} more` : ""}`,
			type: AlertType.DIGEST,
		});
	}
	return out;
}

function nudgeAlert(lastOpenMs: number, now: number): PlannedAlert | null {
	if (!(lastOpenMs > 0)) return null;
	const fireAt = localAt(localDateStr(new Date(lastOpenMs)), AIRING_MORNING_HOUR, AIRING_NUDGE_DAYS);
	if (fireAt <= now) return null;
	return { id: ALERT_ID.NUDGE, fireAt, title: "Watchloom", body: NUDGE_BODY, type: AlertType.NUDGE };
}

/**
 * Caught up: the tracking nextEpisode exists in the catalog and has NOT aired yet. A title whose next
 * episode already aired is a backlog and gets no episode alerts
 */
function isCaughtUp(t: PlanTitle, overrides: AiringOverride[], now: number): boolean {
	const next = t.nextEpisode;
	if (!next) return false;
	const e = t.seasons.find((s) => s.seasonNumber === next.season)?.episodes.find((x) => x.episodeNumber === next.episode);
	const o = overrides.find((x) => x.docId === t.docId && x.season === next.season && x.episode === next.episode);
	if (!e && !o) return false;
	return !hasAired(o?.airStamp ?? e?.airStamp, e?.airDate, localDateStr(new Date(now)), now);
}

/** Only episodes from the tracking nextEpisode onward are alerted */
function fromNext(e: AirEpisode, next: { season: number; episode: number } | null): boolean {
	if (!next) return false;
	return e.season > next.season || (e.season === next.season && e.episode >= next.episode);
}

// ---- the plan ------------------------------------------------------------------------------------

/**
 * Every alert to have scheduled right now: the next AIRING_HORIZON_DAYS from the cached catalog, tracking
 * state (episodes only for caught-up watching / rewatching shows, from the next episode on), switches and pushed corrections. Pure and deterministic — ids are stable, so applying it
 * twice changes nothing. All off → nothing (not even the reopen nudge). At most AIRING_CAP, nearest first
 */
export function buildAiringPlan(input: PlanInput): PlannedAlert[] {
	const { now, titles, prefs, overrides, lastOpenMs } = input;
	if (!anyAlertOn(prefs)) return [];
	const horizon = now + AIRING_HORIZON_DAYS * DAY_MS;
	const active = titles.filter((t) => isActive(t.status));
	// Episode alerts: only watching / rewatching titles the user is caught up on
	const shows = titles.filter(
		(t) =>
			t.mediaType === MediaType.TV &&
			(t.status === WatchStatus.WATCHING || t.status === WatchStatus.REWATCHING) &&
			isCaughtUp(t, overrides, now),
	);
	const movies = active.filter((t) => t.mediaType === MediaType.MOVIE && t.status !== WatchStatus.COMPLETED);
	const episodes = shows.flatMap((t) => titleEpisodes(t, overrides).filter((e) => fromNext(e, t.nextEpisode)));

	const alerts = [
		...episodeAlerts(episodes, prefs, now, horizon),
		...movieAlerts(movies, prefs, now, horizon),
		...(prefs[NotificationKind.WEEKLY_DIGEST] ? digestAlerts(episodes, movies, now, horizon) : []),
	].sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));

	const nudge = nudgeAlert(lastOpenMs, now);
	const kept = alerts.slice(0, AIRING_CAP - (nudge ? 1 : 0));
	if (nudge) kept.push(nudge);
	return kept.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
}
