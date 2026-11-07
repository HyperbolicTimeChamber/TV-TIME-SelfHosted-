import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	CacheKey,
	COUNTRY_LOOKUP_TIMEOUT_MS,
	COUNTRY_LOOKUP_URL,
	USER_REGION_TTL_MS,
} from "../enums";

const ISO_COUNTRY = /^[A-Z]{2}$/;

/** The device locale's region ("en-GB" → "GB"); US when the locale names none */
export function localeRegion(): string {
	try {
		const locale = Intl.DateTimeFormat().resolvedOptions().locale;
		const region = locale.split(/[-_]/).find((p, i) => i > 0 && ISO_COUNTRY.test(p));
		if (region) return region;
	} catch {
		// Fall through
	}
	return "US";
}

async function lookupCountry(): Promise<string | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), COUNTRY_LOOKUP_TIMEOUT_MS);
	try {
		const res = await fetch(COUNTRY_LOOKUP_URL, { signal: controller.signal });
		if (!res.ok) return null;
		const country = (await res.json())?.country;
		return typeof country === "string" && ISO_COUNTRY.test(country) ? country : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * The viewer's country (ISO 3166-1, e.g. "IN"): from their IP — no permission prompt — kept a
 * day; the device locale's region when the lookup fails (offline, blocked)
 */
export async function getUserRegion(): Promise<string> {
	try {
		const saved = await AsyncStorage.getItem(CacheKey.USER_REGION);
		if (saved) {
			const { region, at } = JSON.parse(saved);
			if (ISO_COUNTRY.test(region) && Date.now() - at < USER_REGION_TTL_MS) return region;
		}
	} catch {
		// Re-look it up
	}
	const looked = await lookupCountry();
	if (!looked) return localeRegion();
	AsyncStorage.setItem(CacheKey.USER_REGION, JSON.stringify({ region: looked, at: Date.now() })).catch(
		() => {},
	);
	return looked;
}

/** "IN" → "India" from the runtime's region names; null where it has none (Hermes) */
export function intlCountryName(region: string): string | null {
	try {
		const name = new Intl.DisplayNames(["en"], { type: "region" }).of(region);
		return name && name !== region ? name : null;
	} catch {
		return null;
	}
}
