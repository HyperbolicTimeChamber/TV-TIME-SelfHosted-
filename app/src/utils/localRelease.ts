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

/** The one-line form (info drawer): "Released in Germany on 24 Jul 2025" */
export function localReleaseSentence(text: { label: string; date: string }): string {
	return `${text.label} on ${text.date}`;
}

/**
 * A movie's local release: label "Released in Germany" (Releasing while it's still ahead) and date
 * "24 Jul 2025". Null when there's no date for the viewer's country — nothing is shown then
 */
export function localReleaseText(
	localRelease: string | null | undefined,
	country: string | undefined,
	now = new Date(),
): { label: string; date: string } | null {
	if (!localRelease || !country) return null;
	const verb = isAhead(localRelease, now) ? "Releasing" : "Released";
	return { label: `${verb} in ${country}`, date: formatIsoDate(localRelease) };
}
