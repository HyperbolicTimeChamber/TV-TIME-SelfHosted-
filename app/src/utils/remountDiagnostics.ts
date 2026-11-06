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
	REMOUNT_DIAG_MAX_STEPS,
	REMOUNT_DIAG_WINDOW_MS,
	WatchlistRemountKind,
} from "../enums";
import { trackWatchlistRemount } from "../services/mixpanel";

const LAUNCH_MS = Date.now();
const steps: string[] = [];
const mounts: Record<WatchlistRemountKind, number> = {
	[WatchlistRemountKind.TAB]: 0,
	[WatchlistRemountKind.LIST]: 0,
};

const sinceLaunch = () => Date.now() - LAUNCH_MS;

/** A launch step (gate change, auth event, watchlist view change), with its time */
export function noteLaunchStep(step: string) {
	if (sinceLaunch() > REMOUNT_DIAG_WINDOW_MS) return;
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
		steps: steps.join(" | "),
	});
}
