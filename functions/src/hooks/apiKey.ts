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
