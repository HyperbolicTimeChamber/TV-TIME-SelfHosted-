import { getFirestore } from "firebase-admin/firestore";

// Cached TMDB API key — survives across invocations on same instance
let cachedApiKey: string | null = null;

export async function getTmdbApiKey(): Promise<string> {
	if (cachedApiKey) return cachedApiKey;
	const configDoc = await getFirestore().doc("config/app").get();
	const key = configDoc.data()?.tmdbApiKey;
	if (!key) throw new Error("TMDB API key not configured in config/app");
	cachedApiKey = key;
	return key;
}

export function invalidateApiKeyCache(): void {
	cachedApiKey = null;
}

// Cached Lynkily config — survives across invocations on same instance
let cachedLynkilyKey: string | null = null;
let cachedLynkilyAppId: string | null = null;

export async function getLynkilyConfig(): Promise<{ apiKey: string; appId: string }> {
	if (cachedLynkilyKey && cachedLynkilyAppId) {
		return { apiKey: cachedLynkilyKey, appId: cachedLynkilyAppId };
	}
	const configDoc = await getFirestore().doc("config/app").get();
	const data = configDoc.data();
	const apiKey = data?.lynkilyApiKey;
	const appId = data?.lynkilyAppId;
	if (!apiKey || !appId) throw new Error("Lynkily config not set in config/app");
	cachedLynkilyKey = apiKey;
	cachedLynkilyAppId = appId;
	return { apiKey, appId };
}
