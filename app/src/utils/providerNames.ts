import type { WatchProvider } from "../types";
import { PROVIDER_LINKS } from "../enums";

/** Where to Watch: a service's shorter display name (TMDB has only the full one) */
const RENAMES: Record<string, string> = {
	"amazon prime video": "Prime Video",
	"disney plus": "Disney+",
	"apple tv plus": "Apple TV+",
	"paramount plus": "Paramount+",
	"animation digital network": "ADN",
};

/** Endings that only say which store sells the service as an add-on */
const CHANNEL_SUFFIXES = [
	/\s+amazon channel$/i,
	/\s+apple tv channel$/i,
	/\s+roku premium channel$/i,
];

/** An add-on channel → the store app it plays in (a PROVIDER_LINKS key) */
const CHANNEL_STORES: [RegExp, string][] = [
	[/\s+amazon channel$/i, "prime video"],
	[/\s+apple tv channel$/i, "apple tv"],
];

/** A cut of a service that opens the same service: not listed beside it */
const SAME_SERVICE: Record<string, string> = { "netflix kids": "netflix" };

const isChannel = (name: string) => CHANNEL_SUFFIXES.some((s) => s.test(name.trim()));

/** "RTL+ Max Amazon Channel" → "RTL+ Max", "Disney Plus" → "Disney+" */
export function shortProviderName(name: string): string {
	let short = name.trim();
	for (const suffix of CHANNEL_SUFFIXES) short = short.replace(suffix, "");
	return RENAMES[short.toLowerCase()] ?? short;
}

/** "Animation Digital Network" → "adn" (a channel is often listed under its service's initials) */
const initials = (name: string) =>
	name
		.split(/\s+/)
		.map((w) => w[0] ?? "")
		.join("")
		.toLowerCase();

/**
 * The services to show, in order: an add-on channel ("HBO Max Amazon Channel") is left out when
 * the service itself ("HBO Max", or its spelled-out name: "ADN Amazon Channel" next to
 * "Animation Digital Network") or the store it plays in (Prime Video) is listed too — kept only
 * when it's the only way to get it. Netflix Kids goes the same way next to Netflix
 */
export function displayProviders(providers: readonly WatchProvider[]): WatchProvider[] {
	const direct = new Set<string>();
	for (const p of providers) {
		if (isChannel(p.name)) continue;
		direct.add(shortProviderName(p.name).toLowerCase());
		if (/\s/.test(p.name.trim())) direct.add(initials(p.name.trim()));
	}
	const store = (name: string) => CHANNEL_STORES.find(([suffix]) => suffix.test(name.trim()))?.[1];
	return providers.filter((p) => {
		if (!isChannel(p.name)) {
			const main = SAME_SERVICE[p.name.trim().toLowerCase()];
			return !(main && direct.has(main));
		}
		const via = store(p.name);
		return !direct.has(shortProviderName(p.name).toLowerCase()) && !(via && direct.has(via));
	});
}

/**
 * Where a service's button goes: its search for the title when it takes one from a link, else the
 * service itself, else (a service not in PROVIDER_LINKS) TMDB's watch page for the title. An
 * add-on channel goes to the store app it plays in. `inApp` (a phone, where the link opens the
 * service's app): the search only when the app fills it in, else the home page — not an empty
 * search page
 */
export function providerLink(
	name: string,
	title: string,
	tmdbLink: string | null,
	inApp: boolean,
): string | null {
	// An add-on channel is watched in its store's app: Prime Video / Apple TV
	const store = CHANNEL_STORES.find(([suffix]) => suffix.test(name.trim()))?.[1];
	const known = PROVIDER_LINKS[store ?? shortProviderName(name).toLowerCase()];
	if (!known) return tmdbLink;
	const search = known.search && (!inApp || known.appSearch) ? known.search : null;
	return search ? search.replace("{q}", encodeURIComponent(title)) : known.home;
}

/** The service's Android app package (PROVIDER_LINKS androidPackage), add-on channels → their store's */
export function providerApp(name: string): string | null {
	const store = CHANNEL_STORES.find(([suffix]) => suffix.test(name.trim()))?.[1];
	return PROVIDER_LINKS[store ?? shortProviderName(name).toLowerCase()]?.androidPackage ?? null;
}
