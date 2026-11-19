import { COUNTRY_NAMES, WATCH_REGION_NAMES } from "../enums";

/** One row of the "Other Countries" list */
export interface RegionEntry {
	code: string;
	name: string;
	/** Flag emoji ("" for a malformed code) */
	flag: string;
	/** Its Where to Watch is already stored — tapping it needs no network call */
	stored: boolean;
}

const ISO_REGION = /^[A-Z]{2}$/;
const REGIONAL_INDICATOR_A = 0x1f1e6;

/** "IN" -> flag emoji from the two regional-indicator letters; "" when not two capital letters */
export function regionFlag(code: string): string {
	if (!ISO_REGION.test(code)) return "";
	return String.fromCodePoint(...[...code].map((c) => REGIONAL_INDICATOR_A + c.charCodeAt(0) - 65));
}

/** "IN" -> "India": the Where to Watch list, then the chip names, else the code itself */
export function regionName(code: string): string {
	return WATCH_REGION_NAMES[code] ?? COUNTRY_NAMES[code] ?? code;
}

/**
 * The countries to pick from: every Where to Watch country plus any stored code not on that list,
 * minus `exclude` (the viewer's own). `query` filters by name (contains) or exact code, ignoring
 * case. Order: stored countries first, then name matches that START with the query, then A-Z —
 * deterministic (plain comparison, no locale)
 */
export function buildRegionList(
	stored: readonly string[],
	query: string,
	exclude?: string | null,
): RegionEntry[] {
	const have = new Set(stored);
	const codes = new Set([...Object.keys(WATCH_REGION_NAMES), ...stored]);
	if (exclude) codes.delete(exclude);
	const q = query.trim().toLowerCase();
	const found: { entry: RegionEntry; rank: number }[] = [];
	for (const code of codes) {
		const name = regionName(code);
		const lower = name.toLowerCase();
		let rank = 1;
		if (q) {
			if (code.toLowerCase() === q || lower.startsWith(q)) rank = 0;
			else if (!lower.includes(q)) continue;
		}
		found.push({
			entry: { code, name, flag: regionFlag(code), stored: have.has(code) },
			rank,
		});
	}
	found.sort((a, b) => {
		if (a.entry.stored !== b.entry.stored) return a.entry.stored ? -1 : 1;
		if (a.rank !== b.rank) return a.rank - b.rank;
		if (a.entry.name === b.entry.name) return 0;
		return a.entry.name < b.entry.name ? -1 : 1;
	});
	return found.map((f) => f.entry);
}
