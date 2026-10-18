/** Replace Google profile photo size param with screen-aware resolution */
export function scaledPhotoURL(url: string, layoutSize: number, pixelRatio = 1): string {
	const px = Math.ceil(layoutSize * pixelRatio);
	return url.replace(/=s\d+-c/, `=s${px}-c`);
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd" */
export function ordinal(n: number) {
	const mod100 = n % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
	const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
	return `${n}${suffix}`;
}

/** Green watch button text: "Mark 2nd Rewatch" during rewatch n, else "Mark as Watched" */
export function markWatchedLabel(rewatchCount: number) {
	return rewatchCount > 0 ? `Mark ${ordinal(rewatchCount)} Rewatch` : "Mark as Watched";
}

/** 1234 → 1.2K, 2_500_000 → 2.5M */
export function formatCount(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
	return `${n}`;
}

/** Minutes → "2y 14d" / "3d 4h" / "5h 12m" / "40m"; a zero second unit is dropped ("1d", not "1d 0h") */
export function formatTime(minutes: number) {
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const years = Math.floor(days / 365);
	const pair = (big: string, small: number, unit: string) => (small > 0 ? `${big} ${small}${unit}` : big);
	if (years > 0) return pair(`${years}y`, days % 365, "d");
	if (days > 0) return pair(`${days}d`, hours % 24, "h");
	if (hours > 0) return pair(`${hours}h`, minutes % 60, "m");
	return `${minutes}m`;
}

/** "E01–E04" — an episode range in popups */
export function episodeRange(from: number, to: number) {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `E${pad(from)}–E${pad(to)}`;
}

/** Copy for the "jumped ahead" popups (season list + episode info) */
export const SKIP_AHEAD_TITLE = "Whoa there Speedster!";
export const skipAheadHint = (range: string) =>
	`You've jumped ahead a few episodes. Do you want to skip to this point or mark the previous episodes (${range})?`;
export const skipAheadConfirm = (range: string) => `Mark ${range} as Watched`;
