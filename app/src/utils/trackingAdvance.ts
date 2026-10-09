import { WatchStatus } from "../enums";

export interface EpisodeRef {
	season: number;
	episode: number;
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

const REWATCH_STATUSES: WatchStatus[] = [
	WatchStatus.COMPLETED,
	WatchStatus.REWATCHING,
	WatchStatus.PAUSED_REWATCH,
];

export const epKey = (season: number, episode: number) => `${season}-${episode}`;

/**
 * Decide whether marking episodes should move the watchlist pointer.
 *
 * Rule: after marking, let X = last marked episode and c = its new watch count.
 * The pointer only moves if every episode before X has watch count >= c
 * (i.e. X continues an unbroken run at level c). It then jumps to the first
 * episode after X whose count is < c — skipping episodes already watched at
 * that level instead of jumping back to them.
 *
 * Rewatch levels (c > 1) only drive the pointer when the show is finished /
 * already rewatching / caught up — re-marking a random episode mid-watch
 * never yanks the pointer.
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
): TrackingAdvance {
	const none: TrackingAdvance = { advance: false, nextEpisode: null, incrementRewatch: false };
	if (!tracking || marked.length === 0) return none;

	const markedKeys = new Set(marked.map((m) => epKey(m.season, m.episode)));
	let lastIdx = -1;
	for (let i = 0; i < order.length; i++) {
		if (markedKeys.has(epKey(order[i].season, order[i].episode))) lastIdx = i;
	}
	if (lastIdx === -1) return none;

	const last = order[lastIdx];
	const level = counts.get(epKey(last.season, last.episode)) ?? 0;
	if (level < 1) return none;

	const status = tracking.status;
	const caughtUp = !tracking.nextEpisode;
	if (level > 1 && !caughtUp && !(status && REWATCH_STATUSES.includes(status))) return none;
	// Mid-rewatch, a first-time watch of some episode must not move the rewatch pointer
	if (level === 1 && (status === WatchStatus.REWATCHING || status === WatchStatus.PAUSED_REWATCH)) {
		return none;
	}

	for (let i = 0; i < lastIdx; i++) {
		if ((counts.get(epKey(order[i].season, order[i].episode)) ?? 0) < level) return none;
	}

	let next: EpisodeRef | null = null;
	for (let i = lastIdx + 1; i < order.length; i++) {
		if ((counts.get(epKey(order[i].season, order[i].episode)) ?? 0) < level) {
			next = order[i];
			break;
		}
	}

	if (!next) {
		return { advance: true, nextEpisode: null, status: WatchStatus.COMPLETED, incrementRewatch: false };
	}
	if (level > 1) {
		const entering = status !== WatchStatus.REWATCHING;
		return {
			advance: true,
			nextEpisode: next,
			status: WatchStatus.REWATCHING,
			incrementRewatch: entering && status !== WatchStatus.PAUSED_REWATCH,
		};
	}
	return {
		advance: true,
		nextEpisode: next,
		status: status === WatchStatus.COMPLETED ? WatchStatus.WATCHING : undefined,
		incrementRewatch: false,
	};
}
