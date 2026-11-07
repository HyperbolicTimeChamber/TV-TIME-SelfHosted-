import type { WatchProvider } from "../types";
import { PROVIDER_LINKS } from "../enums";

/** Where to Watch: a service's shorter display name (TMDB has only the full one) */
const RENAMES: Record<string, string> = {
	"amazon prime video": "Prime Video",
	"disney plus": "Disney+",
	"apple tv plus": "Apple TV+",
	"paramount plus": "Paramount+",
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

const isChannel = (name: string) => CHANNEL_SUFFIXES.some((s) => s.test(name.trim()));

/** "RTL+ Max Amazon Channel" → "RTL+ Max", "Disney Plus" → "Disney+" */
export function shortProviderName(name: string): string {
	let short = name.trim();
	for (const suffix of CHANNEL_SUFFIXES) short = short.replace(suffix, "");
	return RENAMES[short.toLowerCase()] ?? short;
}

/**
 * The services to show, in order: an add-on channel ("HBO Max Amazon Channel") is left out when
 * the service itself ("HBO Max") is listed too, kept when it's the only way to get it
 */
export function displayProviders(providers: readonly WatchProvider[]): WatchProvider[] {
	const direct = new Set(
		providers.filter((p) => !isChannel(p.name)).map((p) => shortProviderName(p.name).toLowerCase()),
	);
	return providers.filter(
		(p) => !isChannel(p.name) || !direct.has(shortProviderName(p.name).toLowerCase()),
	);
}

/**
 * Where a service's button goes: its search for the title when it takes one from a link, else the
 * service itself, else (a service not in PROVIDER_LINKS) TMDB's watch page for the title. An
 * add-on channel goes to the store app it plays in
 */
export function providerLink(name: string, title: string, tmdbLink: string | null): string | null {
	// An add-on channel is watched in its store's app: Prime Video / Apple TV
	const store = CHANNEL_STORES.find(([suffix]) => suffix.test(name.trim()))?.[1];
	const known = PROVIDER_LINKS[store ?? shortProviderName(name).toLowerCase()];
	if (!known) return tmdbLink;
	return known.search ? known.search.replace("{q}", encodeURIComponent(title)) : known.home;
}
