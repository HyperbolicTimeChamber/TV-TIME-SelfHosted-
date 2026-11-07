import type { Studio } from "../types";

/** Company-form words that don't tell studios apart ("OLM, Inc." = "OLM") */
const CORPORATE = /\b(?:inc|co|ltd|llc|corp|corporation|company|gmbh|plc|limited)\b/g;

/** "OLM Digital, Inc." → "olm digital" */
const baseName = (name: string) =>
	name
		.toLowerCase()
		.replace(/[.,]/g, " ")
		.replace(CORPORATE, " ")
		.replace(/\s+/g, " ")
		.trim();

/**
 * The info page's studios, each company once: a division ("OLM Digital", "Toho Animation") is
 * left out when its parent ("OLM", "Toho") is listed too, and so is a second entry with the same
 * name or logo. Order kept
 */
export function mainStudios(studios: readonly Studio[]): Studio[] {
	const names = studios.map((s) => baseName(s.name));
	const logos = new Set<string>();
	const seen = new Set<string>();
	return studios.filter((s, i) => {
		const name = names[i];
		const isDivision = names.some((other) => other && other !== name && name.startsWith(`${other} `));
		if (isDivision || seen.has(name) || logos.has(s.logo)) return false;
		seen.add(name);
		logos.add(s.logo);
		return true;
	});
}
