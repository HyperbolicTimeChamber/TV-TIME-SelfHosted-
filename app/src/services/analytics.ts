import {
	getAnalytics,
	logEvent as firebaseLogEvent,
	setUserProperty,
} from "@react-native-firebase/analytics";
import { LOCAL_RELEASE_CHANNEL, RELEASE_CHANNEL, VersionProperty } from "../enums";
import { APP_BUILD, APP_VERSION } from "../utils/appVersion";
import { trackApiCalled } from "./mixpanel";

type ApiType = "tmdb" | "cloud_function" | "firestore";

interface ApiCallEvent {
	api_type: ApiType;
	method: string;
	success: boolean;
	duration_ms: number;
	error?: string;
}

/** Version as Firebase Analytics user properties: Console → Audiences / reports by build (free).
 *  Call once per launch (native app only) */
export function setVersionUserProperties() {
	const analytics = getAnalytics();
	const props: [VersionProperty, string][] = [
		[VersionProperty.APP_VERSION, APP_VERSION],
		[VersionProperty.APP_BUILD, String(APP_BUILD)],
		[VersionProperty.RELEASE_CHANNEL, RELEASE_CHANNEL || LOCAL_RELEASE_CHANNEL],
	];
	for (const [name, value] of props) setUserProperty(analytics, name, value).catch(() => {});
}

/** Log an API call event to Firebase Analytics and Mixpanel */
export function logApiCall(event: ApiCallEvent) {
	trackApiCalled({
		api_type: event.api_type,
		endpoint: event.method,
		success: event.success,
		duration_ms: event.duration_ms,
		...(event.error ? { error: event.error.substring(0, 100) } : {}),
	});
	firebaseLogEvent(getAnalytics(), "api_call" as any, {
		api_type: event.api_type,
		method: event.method,
		success: event.success,
		duration_ms: event.duration_ms,
		...(event.error ? { error: event.error.substring(0, 100) } : {}),
	});
}

/**
 * Wrap an async function to automatically track it in Firebase Analytics.
 * Usage: const result = await trackApi("tmdb", "getSeasonDetails", () => getSeasonDetails(...))
 */
export async function trackApi<T>(
	apiType: ApiType,
	method: string,
	fn: () => Promise<T>,
): Promise<T> {
	const start = Date.now();
	try {
		const result = await fn();
		logApiCall({
			api_type: apiType,
			method,
			success: true,
			duration_ms: Date.now() - start,
		});
		return result;
	} catch (err: any) {
		logApiCall({
			api_type: apiType,
			method,
			success: false,
			duration_ms: Date.now() - start,
			error: err?.message || String(err),
		});
		throw err;
	}
}
