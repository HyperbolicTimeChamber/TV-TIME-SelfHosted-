import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction, MediaType } from "../enums";
import type { RegionWatchProviders } from "../types";
import { trackApi } from "./analytics";
import { foregroundCall } from "./callQueue";

/**
 * A title's streaming services in one country, from the watchProviders CF (Firestore first, TMDB
 * only for a country nobody asked about yet — the answer is stored). Works signed in or not
 */
export function fetchWatchProviders(
	tmdbId: number,
	mediaType: MediaType,
	region: string,
): Promise<RegionWatchProviders> {
	return foregroundCall(() =>
		trackApi("cloud_function", CloudFunction.WATCH_PROVIDERS, async () => {
			const res = await httpsCallable(
				getFunctions(),
				CloudFunction.WATCH_PROVIDERS,
			)({ tmdbId, mediaType, region });
			return res.data as RegionWatchProviders;
		}),
	);
}
