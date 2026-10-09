/** TMDB placeholder names ("Episode 3") or empty — real title not published yet */
export function isGenericEpisodeTitle(title: string | null | undefined): boolean {
	if (!title) return true;
	return /^episode\s*\d+$/i.test(title.trim());
}

/** Prefer a real title over a placeholder, whichever source has it */
export function pickEpisodeTitle(
	...titles: Array<string | null | undefined>
): string | null {
	const real = titles.find((t) => !isGenericEpisodeTitle(t));
	return real ?? titles.find((t) => !!t) ?? null;
}
