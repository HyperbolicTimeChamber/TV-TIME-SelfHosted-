import { MediaType } from "../enums";

export interface CompletedItem {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	posterPath: string | null;
	genres: string[];
	completedAt: number;
}

export interface CompletedSection {
	title: string;
	items: CompletedItem[];
}

const SECTION_LIMIT = 10;
/** Genre rows smaller than this fold into the "More" row */
const MIN_ROW_ITEMS = 3;
const MORE_SECTION = "More";

/** Movies row + genre rows for Recently Completed (pure — shared by app and web) */
export function buildCompletedSections(items: CompletedItem[]): CompletedSection[] {
	const sections: CompletedSection[] = [];

	// Movies
	const movies = items
		.filter((i) => i.mediaType === MediaType.MOVIE)
		.sort((a, b) => b.completedAt - a.completedAt)
		.slice(0, SECTION_LIMIT);
	if (movies.length > 0) {
		sections.push({ title: "Movies", items: movies });
	}

	// TV shows — group by genre if available, else single "TV Shows" section
	const tvShows = items.filter((i) => i.mediaType === MediaType.TV);
	const hasGenres = tvShows.some((s) => s.genres.length > 0);

	if (!hasGenres) {
		// No genres yet — simple TV Shows section
		const sorted = tvShows.sort((a, b) => b.completedAt - a.completedAt).slice(0, SECTION_LIMIT);
		if (sorted.length > 0) {
			sections.push({ title: "TV Shows", items: sorted });
		}
	} else {
		// Fewer, fuller rows: each show goes into its most popular genre (most shows in
		// the pool), not its first-listed one — shows list genres in any order
		const genreCount = new Map<string, number>();
		for (const show of tvShows) {
			for (const g of show.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
		}
		const genreMap = new Map<string, CompletedItem[]>();
		for (const show of tvShows) {
			const genre =
				[...show.genres].sort(
					(a, b) => (genreCount.get(b) ?? 0) - (genreCount.get(a) ?? 0) || a.localeCompare(b),
				)[0] ?? MORE_SECTION;
			genreMap.set(genre, [...(genreMap.get(genre) ?? []), show]);
		}

		// Rows with only a couple of items fold into one "More" row at the end
		const more = genreMap.get(MORE_SECTION) ?? [];
		genreMap.delete(MORE_SECTION);
		for (const [genre, shows] of [...genreMap]) {
			if (shows.length < MIN_ROW_ITEMS) {
				more.push(...shows);
				genreMap.delete(genre);
			}
		}

		const byRecent = (list: CompletedItem[]) =>
			list.sort((a, b) => b.completedAt - a.completedAt).slice(0, SECTION_LIMIT);
		const sortedGenres = [...genreMap.entries()].sort(
			(a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
		);
		for (const [genre, shows] of sortedGenres) {
			sections.push({ title: genre, items: byRecent(shows) });
		}
		if (more.length > 0) sections.push({ title: MORE_SECTION, items: byRecent(more) });
	}

	return sections;
}
