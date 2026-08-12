import { getAnalytics, logEvent as firebaseLogEvent } from "@react-native-firebase/analytics";

type ApiType = "tmdb" | "cloud_function" | "firestore";

interface ApiCallEvent {
	api_type: ApiType;
	method: string;
	success: boolean;
	duration_ms: number;
	error?: string;
}

/** Log an API call event to Firebase Analytics */
export function logApiCall(event: ApiCallEvent) {
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
