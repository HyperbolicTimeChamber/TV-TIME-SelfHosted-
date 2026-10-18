import { WatchStatus } from "../enums";

export interface EpisodeRef {
	season: number;
	episode: number;
	/** Used to ignore not-yet-aired episodes when checking for a uniform watch count */
	airDate?: string | null;
}

export interface TrackingAdvance {
	/** false → leave tracking doc untouched (watchlist flow unaffected) */
	advance: boolean;
	nextEpisode: EpisodeRef | null;
	/** Status to write when advancing (undefined → keep current) */
	status?: WatchStatus;
	/** true when entering a rewatch (bump rewatchCount) */
	incrementRewatch: boolean;
}

const IN_REWATCH: WatchStatus[] = [WatchStatus.REWATCHING, WatchStatus.PAUSED_REWATCH];

export const epKey = (season: number, episode: number) => `${season}-${episode}`;

const NONE: TrackingAdvance = { advance: false, nextEpisode: null, incrementRewatch: false };

const countOf = (counts: Map<string, number>, e: EpisodeRef) =>
	counts.get(epKey(e.season, e.episode)) ?? 0;

const notAiredYet = (e: EpisodeRef, today: string) => !e.airDate || e.airDate > today;

function lastMarkedIndex(order: EpisodeRef[], marked: EpisodeRef[]): number {
	const keys = new Set(marked.map((m) => epKey(m.season, m.episode)));
	let idx = -1;
	for (let i = 0; i < order.length; i++) {
		if (keys.has(epKey(order[i].season, order[i].episode))) idx = i;
	}
	return idx;
}

/** First episode after `fromIdx` still below `level` — skips eps already watched at that level */
function firstBelow(
	order: EpisodeRef[],
	counts: Map<string, number>,
	fromIdx: number,
	level: number,
) {
	for (let i = fromIdx + 1; i < order.length; i++) {
		if (countOf(counts, order[i]) < level) return order[i];
	}
	return null;
}

function result(
	next: EpisodeRef | null,
	level: number,
	status: WatchStatus | undefined,
): TrackingAdvance {
	const nextEpisode = next ? { season: next.season, episode: next.episode } : null;
	if (!nextEpisode) {
		return { advance: true, nextEpisode, status: WatchStatus.COMPLETED, incrementRewatch: false };
	}
	if (level > 1) {
		return {
			advance: true,
			nextEpisode,
			status: WatchStatus.REWATCHING,
			incrementRewatch: !status || !IN_REWATCH.includes(status),
		};
	}
	const leaveFinished =
		status === WatchStatus.COMPLETED || (!!status && IN_REWATCH.includes(status));
	return {
		advance: true,
		nextEpisode,
		status: leaveFinished ? WatchStatus.WATCHING : undefined,
		incrementRewatch: false,
	};
}

/**
 * Decide whether marking episodes should move the watchlist pointer.
 * X = last marked episode, c = its watch count after marking.
 *
 * - First watch (c = 1): pointer moves only if every earlier episode is watched
 *   (an unbroken run). It jumps to the first later episode still unwatched.
 * - In a rewatch (c > 1, status rewatching): same, at level c, counted from the
 *   current pointer (earlier episodes were rewatched or skipped).
 * - Starting a rewatch (c > 1, not rewatching): only by re-marking from episode 1,
 *   and only if every other aired episode sits at the same count (c - 1) —
 *   i.e. the show was watched uniformly. Otherwise nothing moves; the UI may
 *   offer "start a rewatch from here" (computeJumpFrom).
 * - A first-time watch during a rewatch never moves the rewatch pointer.
 *
 * @param order all episodes in watch order (season 0 excluded)
 * @param counts watch counts AFTER the mark is applied
 * @param marked episodes being marked in this action (non-empty)
 */
export function computeTrackingAdvance(
	order: EpisodeRef[],
	counts: Map<string, number>,
	marked: EpisodeRef[],
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
	today: string = new Date().toISOString().slice(0, 10),
): TrackingAdvance {
	if (!tracking || marked.length === 0) return NONE;
	const lastIdx = lastMarkedIndex(order, marked);
	if (lastIdx === -1) return NONE;

	const level = countOf(counts, order[lastIdx]);
	if (level < 1) return NONE;
	const status = tracking.status;
	const rewatching = !!status && IN_REWATCH.includes(status);

	if (level === 1 && rewatching) return NONE;

	// Filling the last gap of the first watch while a rewatch is already under way (episode 1
	// at ×2, pointer further on — e.g. imported with holes, rewatched via the watchlist, holes
	// marked later on the show page): it's a rewatch now — keep the pointer, flag it
	if (level === 1 && tracking.nextEpisode && countOf(counts, order[0]) >= 2) {
		const firstWatchDone = order.every((e) => countOf(counts, e) >= 1 || notAiredYet(e, today));
		if (firstWatchDone) {
			return {
				advance: true,
				nextEpisode: { season: tracking.nextEpisode.season, episode: tracking.nextEpisode.episode },
				status: WatchStatus.REWATCHING,
				incrementRewatch: true,
			};
		}
	}

	// Unbroken run up to X at this level. During a rewatch the run starts at the current
	// pointer: episodes before it were rewatched or skipped (watchlist "Skip").
	let runStart = 0;
	if (rewatching && tracking.nextEpisode) {
		const ne = tracking.nextEpisode;
		const pointerIdx = order.findIndex((e) => e.season === ne.season && e.episode === ne.episode);
		if (pointerIdx > lastIdx) return NONE; // re-marking an episode already passed
		if (pointerIdx >= 0) runStart = pointerIdx;
	}
	for (let i = runStart; i < lastIdx; i++) {
		if (countOf(counts, order[i]) < level) return NONE;
	}

	if (level > 1 && !rewatching) {
		// Starting a rewatch: must include episode 1, rest of the show uniform at level - 1
		const firstKey = epKey(order[0].season, order[0].episode);
		if (!marked.some((m) => epKey(m.season, m.episode) === firstKey)) return NONE;
		for (let i = lastIdx + 1; i < order.length; i++) {
			const c = countOf(counts, order[i]);
			if (c === 0 && notAiredYet(order[i], today)) continue;
			if (c !== level - 1) return NONE;
		}
	}

	return result(firstBelow(order, counts, lastIdx, level), level, status);
}

/**
 * User explicitly chose "watch / rewatch from this episode": point the watchlist at
 * the first episode after X still below X's count, regardless of earlier episodes.
 */
export function computeJumpFrom(
	order: EpisodeRef[],
	counts: Map<string, number>,
	marked: EpisodeRef[],
	tracking: { status?: WatchStatus } | null,
): TrackingAdvance {
	const lastIdx = lastMarkedIndex(order, marked);
	if (lastIdx === -1) return NONE;
	const level = countOf(counts, order[lastIdx]);
	if (level < 1) return NONE;
	return result(firstBelow(order, counts, lastIdx, level), level, tracking?.status);
}
