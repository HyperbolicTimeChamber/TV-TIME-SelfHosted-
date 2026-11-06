/**
 * TEMPORARY — remove once the cold-open watchlist rebuild is found (with
 * AnalyticsEvent.DEBUG_WATCHLIST_REMOUNT, WatchlistRemountKind and the REMOUNT_DIAG_* constants).
 *
 * On some phones the watchlist is thrown away and rebuilt a few seconds after a cold open (every
 * poster blank for a frame, back at "What's Up Next"). The emulator never does it. This keeps a
 * short log of the launch's gates and auth events, and reports it to Mixpanel when the Watchlist
 * tab or its list mounts again within REMOUNT_DIAG_WINDOW_MS of launch.
 */
import {
	JUMP_DIAG_BIG_PX,
	JUMP_DIAG_DRAG_SETTLE_MS,
	JUMP_DIAG_MAX_REPORTS,
	JUMP_DIAG_MIN_PX,
	JUMP_DIAG_WINDOW_MS,
	REMOUNT_DIAG_MAX_STEPS,
	REMOUNT_DIAG_WINDOW_MS,
	WatchlistRemountKind,
} from "../enums";
import { trackWatchlistJump, trackWatchlistRemount } from "../services/mixpanel";

const LAUNCH_MS = Date.now();
const steps: string[] = [];
const mounts: Record<WatchlistRemountKind, number> = {
	[WatchlistRemountKind.TAB]: 0,
	[WatchlistRemountKind.LIST]: 0,
};

const sinceLaunch = () => Date.now() - LAUNCH_MS;

/** A launch step (gate change, auth event, watchlist view change), with its time */
export function noteLaunchStep(step: string) {
	if (sinceLaunch() > JUMP_DIAG_WINDOW_MS) return;
	steps.push(`${sinceLaunch()}ms ${step}`);
	if (steps.length > REMOUNT_DIAG_MAX_STEPS) steps.shift();
}

/** The Watchlist tab / its list mounted: a second mount soon after launch is reported */
export function noteWatchlistMount(kind: WatchlistRemountKind) {
	mounts[kind] += 1;
	noteLaunchStep(`mount:${kind}#${mounts[kind]}`);
	if (mounts[kind] < 2 || sinceLaunch() > REMOUNT_DIAG_WINDOW_MS) return;
	trackWatchlistRemount({
		kind,
		ms_since_launch: sinceLaunch(),
		mount_count: mounts[kind],
		steps: [...steps].reverse().join(" | "),
	});
}

// --- Jumps: the list didn't remount on the phone that jumps, so the view moves inside the list.
// Every scroll step is checked: one the finger didn't make (no drag / fling running), or a big one
// right after the rows changed, is reported with the recent steps (row changes, view changes)
let userScrolling = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let lastOffset: number | null = null;
let lastRowsChange = 0;
let jumpReports = 0;

/** Drag started / fling started (true) or fling ended (false) */
export function noteUserScroll(active: boolean) {
	if (settleTimer) clearTimeout(settleTimer);
	settleTimer = null;
	userScrolling = active;
}

/** Drag released: still the finger's until a fling starts or it settles */
export function noteDragEnd() {
	if (settleTimer) clearTimeout(settleTimer);
	settleTimer = setTimeout(() => {
		userScrolling = false;
		settleTimer = null;
	}, JUMP_DIAG_DRAG_SETTLE_MS);
}

/** The list's rows changed (count, first key, top section) */
export function noteRowsChange(summary: string) {
	lastRowsChange = Date.now();
	noteLaunchStep(`rows:${summary}`);
}

/** The list's scroll offset, every scroll event */
export function noteScrollOffset(offset: number) {
	const prev = lastOffset;
	lastOffset = offset;
	if (prev === null || jumpReports >= JUMP_DIAG_MAX_REPORTS) return;
	if (sinceLaunch() > JUMP_DIAG_WINDOW_MS) return;
	const delta = Math.round(offset - prev);
	if (Math.abs(delta) < JUMP_DIAG_MIN_PX) return;
	const sinceRows = Date.now() - lastRowsChange;
	// Mid-drag / fling only a step no finger makes (a janky fling moved ~1000px in one event)
	if (userScrolling && Math.abs(delta) < JUMP_DIAG_BIG_PX) return;
	jumpReports += 1;
	noteLaunchStep(`jump:${delta}@${Math.round(offset)}${userScrolling ? " (dragging)" : ""}`);
	trackWatchlistJump({
		delta,
		offset: Math.round(offset),
		user_scrolling: userScrolling,
		ms_since_rows_change: sinceRows,
		ms_since_launch: sinceLaunch(),
		// Newest first: Mixpanel shows a property's first 255 characters
		steps: [...steps].reverse().join(" | "),
	});
}
