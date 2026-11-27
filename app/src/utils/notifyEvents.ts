import { AlertType, MediaType } from "../enums";
import { DAY_NAMES } from "./notifyConfig";
import { isEndedStatus, type AiringOverride, type PlanTitle } from "./airingPlan";
import { localDateStr } from "./todayStr";

/**
 * One-off alerts that come from a change rather than a schedule: a tracked show ends, a new season appears in
 * its catalog, an episode's air time moves. Pure: the scheduler saves the snapshot and posts what these return
 */

/** What was known of a title the last time alerts were planned */
export interface SeenTitle {
	status: string;
	/** Season numbers above 0 */
	seasons: number[];
}
export type SeenMap = Record<string, SeenTitle>;

export interface TitleEvent {
	/** Stable per change: the same change never alerts twice */
	key: string;
	type: AlertType;
	docId: string;
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	body: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Fri 20 Nov" */
export function dayLabel(date: string): string {
	const [y, m, d] = date.split("-").map(Number);
	return `${DAY_NAMES[new Date(y, m - 1, d).getDay()]} ${d} ${MONTH_NAMES[m - 1]}`;
}

/** "8:00 pm" */
export function clockLabel(ms: number): string {
	const d = new Date(ms);
	const h = d.getHours();
	return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const snapshot = (t: PlanTitle): SeenTitle => ({
	status: t.showStatus ?? "",
	seasons: t.seasons.filter((s) => s.seasonNumber > 0).map((s) => s.seasonNumber).sort((a, b) => a - b),
});

/**
 * Compares the tracked shows with the last snapshot. A first run, or a title seen for the first time, only records
 * (no flood of "new" alerts). Movies and paused titles are ignored by the caller
 */
export function diffTitles(seen: SeenMap | null, titles: PlanTitle[]): { events: TitleEvent[]; next: SeenMap } {
	const next: SeenMap = {};
	const events: TitleEvent[] = [];
	for (const t of titles) {
		const now = snapshot(t);
		next[t.docId] = now;
		const old = seen?.[t.docId];
		if (!old) continue;
		const ref = { docId: t.docId, tmdbId: t.tmdbId, mediaType: t.mediaType, title: t.title };
		if (!isEndedStatus(old.status) && isEndedStatus(t.showStatus)) {
			events.push({
				...ref,
				key: `${t.docId}-${t.showStatus}`,
				type: AlertType.SERIES_ENDED,
				body: t.showStatus === "Canceled" ? "Cancelled" : "Has ended",
			});
		}
		const known = Math.max(0, ...old.seasons);
		const fresh = now.seasons.filter((s) => s > known);
		if (fresh.length > 0) {
			const season = Math.max(...fresh);
			const premiere = t.seasons
				.find((s) => s.seasonNumber === season)
				?.episodes.find((e) => e.episodeNumber === 1)?.airDate;
			events.push({
				...ref,
				key: `${t.docId}-s${season}`,
				type: AlertType.NEW_SEASON,
				body: `Season ${season} announced${premiere && /^\d{4}-\d{2}-\d{2}$/.test(premiere) ? ` · ${dayLabel(premiere)}` : ""}`,
			});
		}
	}
	return { events, next };
}

/** Saved snapshot (JSON) → map; anything unreadable counts as "no snapshot yet" */
export function parseSeen(raw: string | null | undefined): SeenMap | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as SeenMap) : null;
	} catch {
		return null;
	}
}

const MOVED_MIN_MS = 30 * 60 * 1000;

/** The time an episode had before a correction: an earlier correction, else the catalog's air stamp / date */
function previousTime(t: PlanTitle, o: AiringOverride, existing: AiringOverride[]): { at: number; timed: boolean } | null {
	const prior = existing.find((x) => x.docId === o.docId && x.season === o.season && x.episode === o.episode);
	if (prior) return { at: Date.parse(prior.airStamp), timed: true };
	const e = t.seasons.find((s) => s.seasonNumber === o.season)?.episodes.find((x) => x.episodeNumber === o.episode);
	if (!e) return null;
	if (e.airStamp) return { at: Date.parse(e.airStamp), timed: true };
	const day = e.airDate ? Date.parse(`${e.airDate}T00:00:00`) : NaN;
	return Number.isNaN(day) ? null : { at: day, timed: false };
}

/** Pushed corrections that really move an episode (a different day, or a timed one by 30+ minutes) and are still ahead */
export function movedEpisodes(
	titles: PlanTitle[],
	existing: AiringOverride[],
	incoming: AiringOverride[],
	now: number,
): TitleEvent[] {
	const out: TitleEvent[] = [];
	for (const o of incoming) {
		const t = titles.find((x) => x.docId === o.docId);
		const at = Date.parse(o.airStamp);
		if (!t || Number.isNaN(at) || at <= now) continue;
		const before = previousTime(t, o, existing);
		if (!before || Number.isNaN(before.at)) continue;
		const sameDay = localDateStr(new Date(before.at)) === localDateStr(new Date(at));
		if (before.timed ? Math.abs(at - before.at) < MOVED_MIN_MS : sameDay) continue;
		out.push({
			docId: t.docId,
			tmdbId: t.tmdbId,
			mediaType: t.mediaType,
			title: t.title,
			key: `${t.docId}-${o.season}x${o.episode}-${o.airStamp}`,
			type: AlertType.DATE_CHANGED,
			body: `S${o.season} E${o.episode} moved to ${dayLabel(localDateStr(new Date(at)))}, ${clockLabel(at)}`,
		});
	}
	return out;
}
