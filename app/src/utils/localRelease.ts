import { formatIsoDate } from "./format";

/** A "YYYY-MM-DD" date still ahead on this device (today counts as out) */
function isAhead(date: string, now: Date): boolean {
	const pad = (n: number) => String(n).padStart(2, "0");
	return date.slice(0, 10) > `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The label under a movie's release date on its info page */
export function releaseStatLabel(releaseDate: string | null | undefined, now = new Date()): string {
	return releaseDate && isAhead(releaseDate, now) ? "RELEASING" : "RELEASED";
}

/**
 * A movie's local release line: "Released in Germany on 24 Jul 2025" (Releasing while it's still
 * ahead). Null when there's no date for the viewer's country — nothing is shown then
 */
export function localReleaseLine(
	localRelease: string | null | undefined,
	country: string | undefined,
	now = new Date(),
): string | null {
	if (!localRelease || !country) return null;
	const verb = isAhead(localRelease, now) ? "Releasing" : "Released";
	return `${verb} in ${country} on ${formatIsoDate(localRelease)}`;
}
