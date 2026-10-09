import { CatalogShow } from "../tmdb";

/** JSON with sorted keys — Firestore doesn't preserve map key order */
function stableStringify(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
	if (v && typeof v === "object") {
		const o = v as Record<string, unknown>;
		return `{${Object.keys(o)
			.filter((k) => o[k] !== undefined)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v ?? null);
}

/**
 * True when a sync changed anything the app caches/displays for a show.
 * Lets clients re-read only changed catalog docs instead of every tracked show.
 */
export function hasCatalogChanged(oldData: Partial<CatalogShow>, fresh: CatalogShow): boolean {
	return (
		oldData.title !== fresh.title ||
		oldData.posterPath !== fresh.posterPath ||
		oldData.backdropPath !== fresh.backdropPath ||
		oldData.overview !== fresh.overview ||
		oldData.status !== fresh.status ||
		oldData.totalEpisodes !== fresh.totalEpisodes ||
		stableStringify(oldData.seasons ?? []) !== stableStringify(fresh.seasons ?? [])
	);
}
