import { CatalogShow } from "../tmdb";

export function lookupEpisode(
	catalogMap: Map<number, CatalogShow>,
	tmdbId: number,
	season: number,
	episode: number,
): { title: string; runtime: number } {
	const catalog = catalogMap.get(tmdbId);
	if (!catalog) return { title: "", runtime: 0 };
	const s = catalog.seasons.find((s) => s.seasonNumber === season);
	if (!s) return { title: "", runtime: catalog.runtime || 0 };
	const ep = s.episodes.find((e) => e.episodeNumber === episode);
	if (!ep) return { title: "", runtime: catalog.runtime || 0 };
	return {
		title: ep.title || "",
		runtime: ep.runtime || catalog.runtime || 0,
	};
}
