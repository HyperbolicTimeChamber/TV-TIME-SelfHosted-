import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getLynkilyConfig } from "../hooks/apiKey";
import { MediaType, LYNKILY_BASE } from "../shared/enums";

interface DeepLinkRequest {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
}

export const createDeepLink = onCall(
	{
		maxInstances: 10,
		timeoutSeconds: 15,
		memory: "256MiB",
	},
	async (request): Promise<{ shortUrl: string }> => {
		if (!request.auth) {
			throw new HttpsError("unauthenticated", "Must be signed in");
		}

		const { tmdbId, mediaType, title } = request.data as DeepLinkRequest;

		if (!tmdbId || !mediaType || !title) {
			throw new HttpsError("invalid-argument", "tmdbId, mediaType, and title are required");
		}

		const { apiKey, appId } = await getLynkilyConfig();

		const type = mediaType === MediaType.TV ? "tv" : "movie";
		const path = `/show/${type}/${tmdbId}`;
		const fallbackUrl = `https://www.themoviedb.org/${type}/${tmdbId}`;

		const res = await fetch(`${LYNKILY_BASE}/deeplinks`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				app_id: appId,
				path,
				url: fallbackUrl,
				title,
			}),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new HttpsError("internal", `Lynkily API error: ${res.status} ${body}`);
		}

		const data = (await res.json()) as { data: { short_url: string } };
		return { shortUrl: data.data.short_url };
	},
);
