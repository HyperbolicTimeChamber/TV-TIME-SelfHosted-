import { Mixpanel } from "mixpanel-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
	AnalyticsEvent,
	AppOpenSource,
	CacheKey,
	ClientPlatform,
	FIRESTORE_OPS_FLUSH_MS,
	MIXPANEL_SERVER_URL,
	MIXPANEL_TOKEN,
	SIGN_UP_WINDOW_MS,
	TRACKING_SESSION_IDLE_MS,
	type UpdateDownloadResult,
	type UpdateDrawerAction,
} from "../enums";
import { detectAppUpdate } from "../utils/updateAnalytics";

// Web swaps mixpanel-react-native for a mixpanel-browser shim (web/src/platform/mixpanel.ts).
// No token configured (fork / local build without .env) → everything below is a no-op
const mixpanel = MIXPANEL_TOKEN ? new Mixpanel(MIXPANEL_TOKEN, false) : null;
let ready: Promise<Mixpanel | null> | null = null;

const DAY_MS = 24 * 60 * 60 * 1000;
const PLATFORM_NAMES: Record<string, string> = { ios: "iOS", android: "Android", web: "Web" };
const DEVICE_PLATFORM = PLATFORM_NAMES[Platform.OS] ?? Platform.OS;

/** app vs web — on every event, and sent with Cloud Function calls (backend caller_platform) */
export const CLIENT_PLATFORM = Platform.OS === "web" ? ClientPlatform.WEB : ClientPlatform.APP;

/** Start the SDK once, on boot. Resolves to the SDK, or null when tracking is off */
export function initMixpanel() {
	ready ??= mixpanel
		? mixpanel
				.init(false, {}, MIXPANEL_SERVER_URL)
				.then(() => {
					mixpanel.registerSuperProperties({
						client_platform: CLIENT_PLATFORM,
						device_platform: DEVICE_PLATFORM,
					});
					return mixpanel;
				})
				.catch((err) => {
					console.warn("Mixpanel init failed:", err);
					return mixpanel;
				})
		: Promise.resolve(null);
	return ready;
}

function track(event: AnalyticsEvent, props: Record<string, unknown>) {
	initMixpanel().then((mp) => mp?.track(event, props));
}

/** YYYY-MM bucket (UTC) */
function monthUtc(date = new Date()) {
	return date.toISOString().slice(0, 7);
}

/**
 * Signed-in uid → Mixpanel distinct id (call on every auth resolve), plus a profile so cost
 * reports can name the user. A just-created account also sends sign_up_completed, once (email
 * and Google sign-ups alike)
 */
export function identifyUser(
	uid: string,
	createdAtMs?: number,
	profile?: { email?: string | null; name?: string | null },
) {
	initMixpanel().then(async (mp) => {
		if (!mp) return;
		await mp.identify(uid);
		await syncProfile(mp, uid, {
			...(profile?.email ? { $email: profile.email } : {}),
			...(profile?.name ? { $name: profile.name } : {}),
			client_platform: CLIENT_PLATFORM,
		});
		if (!createdAtMs || Date.now() - createdAtMs > SIGN_UP_WINDOW_MS) return;
		const key = CacheKey.SIGN_UP_TRACKED + uid;
		try {
			if (await AsyncStorage.getItem(key)) return;
			await AsyncStorage.setItem(key, "1");
		} catch {}
		mp.track(AnalyticsEvent.SIGN_UP_COMPLETED, { month_utc: monthUtc() });
	});
}

/** Profile props only change on account edits — send them when they differ from the last send */
async function syncProfile(mp: Mixpanel, uid: string, props: Record<string, string>) {
	const key = CacheKey.MIXPANEL_PROFILE + uid;
	const fingerprint = JSON.stringify(props);
	try {
		if ((await AsyncStorage.getItem(key)) === fingerprint) return;
		await AsyncStorage.setItem(key, fingerprint);
	} catch {}
	mp.getPeople().set(props);
}

/** Sign-out: next user must not merge into this one */
export function resetUser() {
	initMixpanel().then((mp) => mp?.reset());
}

export async function trackAppOpened(source: AppOpenSource, appVersion: string) {
	const now = Date.now();
	let daysSinceLastOpen: number | undefined;
	try {
		const last = Number(await AsyncStorage.getItem(CacheKey.LAST_APP_OPEN));
		if (last > 0) daysSinceLastOpen = Math.floor((now - last) / DAY_MS);
		await AsyncStorage.setItem(CacheKey.LAST_APP_OPEN, String(now));
	} catch {}
	track(AnalyticsEvent.APP_OPENED, {
		source,
		...(daysSinceLastOpen !== undefined ? { days_since_last_open: daysSinceLastOpen } : {}),
		device_platform: DEVICE_PLATFORM,
		app_version: appVersion,
	});
}

// --- In-app updates: how people get a new build (Android) ---

export interface UpdateEventProps {
	from_version: string;
	from_build: number;
	to_version: string;
	to_build: number;
	forced: boolean;
}

export function trackUpdateDrawerShown(props: UpdateEventProps) {
	track(AnalyticsEvent.UPDATE_DRAWER_SHOWN, { ...props });
}

export function trackUpdateDrawerAction(action: UpdateDrawerAction, props: UpdateEventProps) {
	track(AnalyticsEvent.UPDATE_DRAWER_ACTION, { action, ...props });
}

export function trackUpdateDownloadFinished(result: UpdateDownloadResult, props: UpdateEventProps) {
	track(AnalyticsEvent.UPDATE_DOWNLOAD_FINISHED, { result, ...props });
}

/** Remembers that the drawer started downloading this build (app_updated `source`) */
export function rememberDrawerDownload(build: number) {
	AsyncStorage.setItem(CacheKey.UPDATE_DRAWER_BUILD, String(build)).catch(() => {});
}

/** Each launch: sends app_updated when this is the first launch on a newer build */
export async function trackAppUpdated(currentBuild: number, currentVersion: string) {
	if (currentBuild <= 0) return;
	try {
		const [last, drawer] = await Promise.all([
			AsyncStorage.getItem(CacheKey.LAST_RUN_BUILD),
			AsyncStorage.getItem(CacheKey.UPDATE_DRAWER_BUILD),
		]);
		await AsyncStorage.setItem(CacheKey.LAST_RUN_BUILD, String(currentBuild));
		const update = detectAppUpdate(Number(last) || 0, currentBuild, Number(drawer) || 0);
		if (!update) return;
		track(AnalyticsEvent.APP_UPDATED, {
			from_build: update.fromBuild,
			to_build: currentBuild,
			to_version: currentVersion,
			source: update.source,
		});
	} catch {}
}

/** Screen (app) / route (web) shown */
export function trackPageViewed(page: string) {
	track(AnalyticsEvent.PAGE_VIEWED, { page });
}

export interface ApiCallProps {
	api_type: string;
	endpoint: string;
	success: boolean;
	duration_ms: number;
	error?: string;
}

export function trackApiCalled(props: ApiCallProps) {
	// /tv/1399/season/2 → /tv/:id/season/:id, so endpoints group in reports
	track(AnalyticsEvent.API_CALLED, {
		...props,
		endpoint: props.endpoint.replace(/\/\d+/g, "/:id"),
	});
}

// --- Firestore reads / writes / deletes: tallied here, sent as one event per flush ---

const ops = { reads: 0, writes: 0, deletes: 0 };
let opsTimer: ReturnType<typeof setTimeout> | null = null;

function flushFirestoreOps() {
	if (opsTimer) clearTimeout(opsTimer);
	opsTimer = null;
	const { reads, writes, deletes } = ops;
	const total = reads + writes + deletes;
	if (total === 0) return;
	ops.reads = ops.writes = ops.deletes = 0;
	track(AnalyticsEvent.FIRESTORE_OPS, { reads, writes, deletes, total_ops: total });
}

/** Count Firestore ops (see utils/countFirestoreOps) — sent within FIRESTORE_OPS_FLUSH_MS */
export function recordFirestoreOps(reads: number, writes: number, deletes: number) {
	if (reads + writes + deletes === 0) return;
	ops.reads += reads;
	ops.writes += writes;
	ops.deletes += deletes;
	opsTimer ??= setTimeout(flushFirestoreOps, FIRESTORE_OPS_FLUSH_MS);
}

/** App backgrounded / tab hidden: send what's pending before the OS may kill us */
export function flushAnalytics() {
	flushTrackingSession();
	flushFirestoreOps();
}

// --- Episode tracking session: marks less than TRACKING_SESSION_IDLE_MS apart ---

interface TrackingSession {
	start: number;
	last: number;
	count: number;
	shows: Set<number>;
}

let session: TrackingSession | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Close the open session now (idle timeout, or the app going to the background) */
export function flushTrackingSession() {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = null;
	if (!session) return;
	const { start, last, count, shows } = session;
	session = null;
	track(AnalyticsEvent.EPISODE_TRACKING_SESSION_COMPLETED, {
		items_tracked_count: count,
		month_utc: monthUtc(new Date(last)),
		duration_seconds: Math.round((last - start) / 1000),
		show_count_covered: shows.size,
	});
}

/** Count episodes marked watched toward the current session (single or bulk marks) */
export function recordTrackedEpisodes(tmdbShowId: number, count: number) {
	if (count <= 0) return;
	const now = Date.now();
	session ??= { start: now, last: now, count: 0, shows: new Set() };
	session.last = now;
	session.count += count;
	session.shows.add(tmdbShowId);
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(flushTrackingSession, TRACKING_SESSION_IDLE_MS);
}

export function trackEpisodeMarked(
	tmdbShowId: number,
	showId: string,
	episodeId: string,
	episodeNumber: number,
) {
	track(AnalyticsEvent.EPISODE_MARKED_TRACKED, {
		show_id: showId,
		episode_id: episodeId,
		episode_number: episodeNumber,
		month_utc: monthUtc(),
	});
	recordTrackedEpisodes(tmdbShowId, 1);
}

/** Episode unwatched (`watchCountAfter` 0) or its watch count lowered by one */
export function trackEpisodeUnwatched(
	showId: string,
	episodeId: string,
	episodeNumber: number,
	watchCountAfter: number,
) {
	track(AnalyticsEvent.EPISODE_UNWATCHED, {
		show_id: showId,
		episode_id: episodeId,
		episode_number: episodeNumber,
		watch_count_after: watchCountAfter,
		fully_unwatched: watchCountAfter === 0,
		month_utc: monthUtc(),
	});
}
