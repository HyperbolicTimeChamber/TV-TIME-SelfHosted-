import { CrewJob } from "../enums";
import type { CatalogShow, TMDBShow } from "../types";

export interface MovieSheetDetails {
	runtime: number | null;
	directors: string[];
	overview: string;
}

/** The add sheet's details from a complete cached catalog doc that has credits; null otherwise */
export function movieSheetFromCatalog(c: CatalogShow | null | undefined): MovieSheetDetails | null {
	if (!c || c.partial || !c.title || !c.credits) return null;
	return {
		runtime: c.runtime || null,
		directors: [...new Set(c.credits.directors)],
		overview: c.overview ?? "",
	};
}

/** The same from a TMDB details response (credits ride along) */
export function movieSheetFromTmdb(show: TMDBShow): MovieSheetDetails {
	const crew = show.credits?.crew ?? [];
	return {
		runtime: show.runtime || null,
		directors: [...new Set(crew.filter((m) => m.job === CrewJob.DIRECTOR).map((m) => m.name))],
		overview: show.overview ?? "",
	};
}

/** 112 -> "1h 52m", 45 -> "45m", 120 -> "2h"; nothing known -> null */
export function formatMovieRuntime(minutes: number | null | undefined): string | null {
	if (!minutes || minutes <= 0) return null;
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "2010 · 2h 28m" from whatever is known; null when neither */
export function movieSheetMeta(year: string | null, runtime: number | null): string | null {
	const parts = [year || null, formatMovieRuntime(runtime)].filter((p): p is string => !!p);
	return parts.length ? parts.join(" · ") : null;
}

export const directorLabel = (count: number): string => (count === 1 ? "Director" : "Directors");
