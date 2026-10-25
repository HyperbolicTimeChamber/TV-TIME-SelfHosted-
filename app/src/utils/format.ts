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
	const pair = (big: string, small: number, unit: string) =>
		small > 0 ? `${big} ${small}${unit}` : big;
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
export const skipAheadConfirm = (range: string) => `Mark ${range} Watched`;

/**
 * Season speedster copy: marking Season `season` while earlier seasons (from `firstSeason`)
 * are unwatched — or, in a rewatch, not reached yet.
 */
export function seasonSkipAheadCopy(
	firstSeason: number,
	season: number,
	inRewatch: boolean,
): { hint: string; confirmLabel: string; secondaryLabel: string } {
	const single = firstSeason >= season - 1;
	const earlier = single ? `Season ${firstSeason}` : `Seasons ${firstSeason}–${season - 1}`;
	const ahead = single ? "a season" : "a few seasons";
	return {
		hint: inRewatch
			? `You've jumped ahead ${ahead} in this rewatch. Rewatch the rest of ${earlier} too, or just this season? Skipped episodes keep their watch count.`
			: `You've jumped ahead ${ahead}. Mark ${earlier} too, or just this season?`,
		confirmLabel: `Mark S${firstSeason}–S${season} Watched`,
		secondaryLabel: "Just This Season",
	};
}

/** "Start a Rewatch?" copy (finished show, marking a later episode). `upTo` = episodes
 *  "Rewatch Up To Here" would mark (1 → only this one: no such option) */
export function startRewatchCopy(o: { label: string; firstLabel: string; upTo: number }): {
	hint: string;
	confirmLabel: string;
	secondaryLabel: string;
	tertiaryLabel?: string;
} {
	if (o.upTo > 1) {
		return {
			hint: `Rewatch Up To Here also counts ${o.firstLabel}–${o.label} (${o.upTo} episodes) as rewatched. Rewatch From Here only marks ${o.label} and starts the rewatch there. Either way your watchlist continues from the next episode.`,
			confirmLabel: "Rewatch Up To Here",
			secondaryLabel: "Rewatch From Here",
			tertiaryLabel: "Just Mark It",
		};
	}
	return {
		hint: `Rewatch from ${o.label}? Your watchlist will continue from the next episode.`,
		confirmLabel: "Rewatch From Here",
		secondaryLabel: "Just Mark It",
	};
}

/**
 * Season tick confirm copy. `toMark` = episodes the mark actually bumps (see
 * seasonMarkEpisodes) — fewer than `total` means only the rest of the season gets marked.
 */
export function seasonMarkCopy(o: {
	seasonNumber: number;
	seasonName: string;
	total: number;
	toMark: number;
	allWatched: boolean;
	inRewatch: boolean;
}): { title: string; hint: string; confirmLabel: string; secondaryLabel?: string } {
	const { seasonNumber: n, seasonName, total, toMark, allWatched, inRewatch } = o;
	const eps = (c: number) => `${c} episode${c === 1 ? "" : "s"}`;
	if (toMark < total && inRewatch) {
		const done = total - toMark;
		return {
			title: `Rewatch Rest of Season ${n}?`,
			hint: `${eps(done)} of ${seasonName} ${done === 1 ? "is" : "are"} already rewatched. Mark Rest marks the other ${eps(toMark)} as watched again; Mark All Again adds one more watch to all ${total}, including the ones already rewatched.`,
			confirmLabel: "Mark Rest",
			secondaryLabel: "Mark All Again",
		};
	}
	if (toMark < total) {
		return {
			title: `Mark Season ${n} as Watched?`,
			hint: `Mark the ${eps(toMark)} of ${seasonName} you haven't watched yet? Episodes already watched keep their count.`,
			confirmLabel: "Mark Season",
		};
	}
	if (allWatched) {
		return {
			title: `Rewatch Season ${n}?`,
			hint: `Mark every episode of ${seasonName} as watched again?`,
			confirmLabel: "Rewatch Season",
		};
	}
	return {
		title: `Mark Season ${n} as Watched?`,
		hint: `Mark all ${total} episodes of ${seasonName} as watched?`,
		confirmLabel: "Mark Season",
	};
}
