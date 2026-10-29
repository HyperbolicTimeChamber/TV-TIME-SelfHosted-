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
	/** true when entering a rewatch (bump rewatchCount) — fallback for writers without `rewatchCount` */
	incrementRewatch: boolean;
	/** Rewatch run number to store (absolute) while rewatching: level − 1. Keeps the tracking
	 *  doc's count in line with the episode counts instead of relying on +1 bumps */
	rewatchCount?: number;
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
			rewatchCount: level - 1,
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
			const runLevel =
				rewatchLevel(order, counts, {
					status: WatchStatus.REWATCHING,
					nextEpisode: tracking.nextEpisode,
				}) ?? 2;
			return {
				advance: true,
				nextEpisode: { season: tracking.nextEpisode.season, episode: tracking.nextEpisode.episode },
				status: WatchStatus.REWATCHING,
				incrementRewatch: true,
				rewatchCount: runLevel - 1,
			};
		}
	}

	// Unbroken run up to X at this level. During a rewatch the run starts at the current
	// pointer: episodes before it were rewatched or skipped (watchlist "Skip").
	// On a first watch it starts there too when the mark reaches the pointer: everything before
	// it is already watched (or skipped), whatever this device's per-show counts say — they're
	// cached, so a mark made on another device since is missing and stalled the pointer.
	let runStart = 0;
	const ne = tracking.nextEpisode;
	const pointerIdx = ne
		? order.findIndex((e) => e.season === ne.season && e.episode === ne.episode)
		: -1;
	if (rewatching && ne) {
		if (pointerIdx > lastIdx) return NONE; // re-marking an episode already passed
		if (pointerIdx >= 0) runStart = pointerIdx;
	} else if (level === 1 && pointerIdx >= 0 && pointerIdx <= lastIdx) {
		runStart = pointerIdx;
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

const indexOf = (order: EpisodeRef[], e: EpisodeRef | null | undefined) =>
	e ? order.findIndex((o) => o.season === e.season && o.episode === e.episode) : -1;

/**
 * Watch count episodes reach in the rewatch under way (null → not rewatching).
 * The pointer episode sits one below it; when the pointer is on a first-watch hole the
 * episode before it (already rewatched) tells the level. Never below 2.
 */
export function rewatchLevel(
	order: EpisodeRef[],
	counts: Map<string, number>,
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
): number | null {
	const status = tracking?.status;
	if (!status || !IN_REWATCH.includes(status) || !tracking?.nextEpisode) return null;
	const ne = tracking.nextEpisode;
	const pointerIdx = indexOf(order, ne);
	const prev = pointerIdx > 0 ? countOf(counts, order[pointerIdx - 1]) : 0;
	return Math.max(2, countOf(counts, ne) + 1, prev);
}

/**
 * "Whoa there Speedster!" — first episode of `target`'s season that marking `target` jumps
 * past (null → no prompt). `counts` are BEFORE the mark.
 * - First watch (target unwatched): earlier unwatched episodes of the season.
 * - Rewatch (target one below the rewatch level): episodes from the rewatch pointer up to
 *   target still below the level. Earlier ones were skipped on purpose; marking behind
 *   the pointer or past the level never prompts.
 * Returns the level the marked range is brought to (1 = first watch).
 */
export function firstSkippedBefore(
	order: EpisodeRef[],
	counts: Map<string, number>,
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
	target: EpisodeRef,
): { firstSkipped: number; level: number } | null {
	const c = countOf(counts, target);
	const targetIdx = indexOf(order, target);
	if (targetIdx === -1) return null;
	const level = rewatchLevel(order, counts, tracking);
	let from = 0;
	let below = 1;
	if (c > 0) {
		if (level === null || c !== level - 1) return null;
		const pointerIdx = indexOf(order, tracking?.nextEpisode);
		if (pointerIdx >= targetIdx) return null;
		from = Math.max(0, pointerIdx);
		below = level;
	}
	for (let i = from; i < targetIdx; i++) {
		const e = order[i];
		if (e.season === target.season && countOf(counts, e) < below) {
			return { firstSkipped: e.episode, level: below };
		}
	}
	return null;
}

export interface JumpPrompt {
	/** Offer to start a rewatch from here (finished / not-rewatching show) */
	rewatch: boolean;
	/** Earlier episodes are still unwatched (or not yet rewatched) → jumping skips them */
	skipsPrevious: boolean;
	/** Skipping ahead inside the rewatch under way */
	inRewatch: boolean;
}

/**
 * What to ask when marking `target` wouldn't move the watchlist on its own (null → just
 * mark it). `counts` are BEFORE the mark.
 * During a rewatch an already-watched episode never offers a new rewatch: ahead of the
 * pointer it's a skip-ahead within the rewatch, behind it (or past the level) a plain mark.
 */
export function jumpPromptFor(
	order: EpisodeRef[],
	counts: Map<string, number>,
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
	target: EpisodeRef,
): JumpPrompt | null {
	const c = countOf(counts, target);
	const idx = indexOf(order, target);
	const level = rewatchLevel(order, counts, tracking);
	if (level !== null && c > 0) {
		const pointerIdx = indexOf(order, tracking?.nextEpisode);
		if (c === level - 1 && idx > pointerIdx) {
			return { rewatch: false, skipsPrevious: true, inRewatch: true };
		}
		return null;
	}
	const skipsPrevious =
		c === 0 && order.slice(0, Math.max(0, idx)).some((o) => !countOf(counts, o));
	return { rewatch: c > 0, skipsPrevious, inRewatch: false };
}

/**
 * Episodes a season mark should bump: only those below the current level — unwatched ones
 * on a first watch (already-watched episodes never go to ×2: extra counts aren't a rewatch),
 * not-yet-rewatched ones during a rewatch. When every episode is already at the level
 * (finished season → "Rewatch Season"), every episode.
 */
export function seasonMarkEpisodes(
	order: EpisodeRef[],
	counts: Map<string, number>,
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
	season: number,
	episodes: number[],
): number[] {
	const level = rewatchLevel(order, counts, tracking) ?? 1;
	const below = episodes.filter((n) => (counts.get(epKey(season, n)) ?? 0) < level);
	return below.length > 0 ? below : episodes;
}

/** Unaired as far as we know — entries built without episode data (no airDate field) count as aired */
const knownUnaired = (e: EpisodeRef, today: string) =>
	e.airDate !== undefined && notAiredYet(e, today);

/**
 * Rewatch run the episode counts say is under way (null → can't tell / not rewatching).
 * The pointer episode is the run's next one, so it sits one below the run's level: run n
 * brings episodes to n + 1, pointer count = n. Only trusted when the episode before the
 * pointer agrees (rewatched in this run → n + 1, or skipped → n) — a hole at the pointer or
 * stray extra counts never move it. Used to heal a stored rewatchCount that drifted.
 */
export function observedRewatchRun(
	order: EpisodeRef[],
	counts: Map<string, number>,
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
): number | null {
	const status = tracking?.status;
	if (!status || !IN_REWATCH.includes(status)) return null;
	const pointerIdx = indexOf(order, tracking?.nextEpisode);
	if (pointerIdx === -1) return null;
	const c = countOf(counts, order[pointerIdx]);
	if (c < 1) return null;
	if (pointerIdx > 0) {
		const prev = countOf(counts, order[pointerIdx - 1]);
		if (prev !== c && prev !== c + 1) return null;
	}
	return c;
}

/**
 * Episode carousel: an episode counts as watched in the current run once its count exceeds
 * this (0 = first watch). During a rewatch it comes from the counts, not the stored run
 * number (which can be stale): the pointer episode — next of the run — sits at it; a pointer
 * on a first-watch hole falls back to the episode before it (one above).
 */
export function carouselRunBase(
	inRewatch: boolean,
	pointerCount: number | null | undefined,
	prevCount: number | null | undefined,
	storedRewatchCount: number,
): number {
	if (!inRewatch) return 0;
	if (pointerCount && pointerCount > 0) return pointerCount;
	if (prevCount && prevCount > 1) return prevCount - 1;
	return Math.max(1, storedRewatchCount);
}

/**
 * "Whoa there Speedster!" for a whole season: earlier episodes the season mark jumps past
 * (null → no prompt). `counts` BEFORE the mark.
 * - First watch: aired, unwatched episodes of earlier seasons.
 * - Rewatch: episodes from the rewatch pointer up to this season still below the level
 *   (earlier ones were skipped on purpose). Pointer already in / past this season → none.
 * Only when the season mark is a real mark (some episode of the season below the level) —
 * an extra watch of a finished season never prompts.
 * `refs` = the earlier episodes to mark too, at `level`.
 */
export function firstSkippedSeason(
	order: EpisodeRef[],
	counts: Map<string, number>,
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
	season: number,
	today: string = new Date().toISOString().slice(0, 10),
): { firstSeason: number; level: number; refs: EpisodeRef[] } | null {
	const seasonStart = order.findIndex((e) => e.season === season);
	if (seasonStart <= 0) return null;
	const level = rewatchLevel(order, counts, tracking) ?? 1;
	const inSeason = order.filter((e) => e.season === season);
	if (!inSeason.some((e) => countOf(counts, e) < level && !knownUnaired(e, today))) return null;
	let from = 0;
	if (level > 1) {
		const pointerIdx = indexOf(order, tracking?.nextEpisode);
		if (pointerIdx >= seasonStart) return null;
		from = Math.max(0, pointerIdx);
	}
	const refs = order
		.slice(from, seasonStart)
		.filter(
			(e) => countOf(counts, e) < level && !(countOf(counts, e) === 0 && knownUnaired(e, today)),
		)
		.map((e) => ({ season: e.season, episode: e.episode }));
	return refs.length > 0 ? { firstSeason: refs[0].season, level, refs } : null;
}

/**
 * "Rewatch Up To Here" (finished show, marking a later episode): every episode from the
 * start through `target` that this new rewatch hasn't reached yet — already watched ones
 * below target's count + 1. Never-watched holes stay as they are (a rewatch doesn't count as
 * a first watch). `counts` BEFORE the mark. Empty when target is unwatched / unknown.
 */
export function rewatchUpToRefs(
	order: EpisodeRef[],
	counts: Map<string, number>,
	target: EpisodeRef,
): EpisodeRef[] {
	const idx = indexOf(order, target);
	const c = idx === -1 ? 0 : countOf(counts, order[idx]);
	if (c < 1) return [];
	return order
		.slice(0, idx + 1)
		.filter((e) => {
			const n = countOf(counts, e);
			return n >= 1 && n <= c;
		})
		.map((e) => ({ season: e.season, episode: e.episode }));
}

/**
 * Watch count −/+ on one episode (info page sheet): where the watchlist pointer goes, null →
 * it stays. Run x = the watch under way (first watch 1, a rewatch its level; none when the show
 * isn't being watched). `counts` are BEFORE the change.
 * - +: the episode reaches x (finished in this run) and the next one is still at x − 1 (next
 *   to watch in this run) → pointer to that next episode.
 * - −: the episode drops from x to below it and the next one is at x − 1 → pointer back to it.
 * Extra watches past the run, or a run already ahead of the next episode, never move it.
 */
export function stepperPointer(
	order: EpisodeRef[],
	counts: Map<string, number>,
	tracking: { status?: WatchStatus; nextEpisode?: EpisodeRef | null } | null,
	target: EpisodeRef,
	from: number,
	to: number,
): EpisodeRef | null {
	const status = tracking?.status;
	const run =
		status === WatchStatus.WATCHING || status === WatchStatus.PAUSED
			? 1
			: rewatchLevel(order, counts, tracking ?? null);
	if (run === null || from === to) return null;
	const idx = indexOf(order, target);
	const next = idx >= 0 ? order[idx + 1] : undefined;
	if (!next || countOf(counts, next) !== run - 1) return null;
	if (to > from)
		return from < run && to >= run ? { season: next.season, episode: next.episode } : null;
	return from >= run && to < run ? { season: target.season, episode: target.episode } : null;
}
