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
} from "../enums";

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
