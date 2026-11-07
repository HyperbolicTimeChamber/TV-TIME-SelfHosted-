import { describe, expect, it } from "vitest";
import { displayProviders, providerLink, shortProviderName } from "@app/utils/providerNames";

const p = (id: number, name: string) => ({ id, name, logo: `/${id}.png` });

describe("Where to Watch provider names", () => {
	it("shortens names", () => {
		expect(shortProviderName("Amazon Prime Video")).toBe("Prime Video");
		expect(shortProviderName("Disney Plus")).toBe("Disney+");
		expect(shortProviderName("RTL+ Max Amazon Channel")).toBe("RTL+ Max");
		expect(shortProviderName("Netflix")).toBe("Netflix");
	});

	it("drops an add-on channel when the service itself is listed, keeps it otherwise", () => {
		const shown = displayProviders([
			p(1, "Netflix"),
			p(2, "HBO Max"),
			p(3, "HBO Max Amazon Channel"),
			p(4, "RTL+"),
			p(5, "RTL+ Max Amazon Channel"),
		]).map((x) => x.name);
		expect(shown).toEqual(["Netflix", "HBO Max", "RTL+", "RTL+ Max Amazon Channel"]);
	});

	it("links each service to its search for the title, its home, or TMDB's watch page", () => {
		expect(providerLink("Netflix", "Breaking Bad", "tmdb")).toBe(
			"https://www.netflix.com/search?q=Breaking%20Bad",
		);
		// An add-on channel plays in its store's app
		expect(providerLink("RTL+ Max Amazon Channel", "The Wire", "tmdb")).toBe(
			"https://www.primevideo.com/search/ref=atv_nb_sr?phrase=The%20Wire",
		);
		expect(providerLink("Disney Plus", "Loki", "tmdb")).toBe("https://www.disneyplus.com/");
		expect(providerLink("Some Local Service", "Loki", "tmdb")).toBe("tmdb");
	});
});
