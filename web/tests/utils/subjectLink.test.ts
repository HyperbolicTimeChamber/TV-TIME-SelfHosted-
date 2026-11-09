import { describe, expect, it } from "vitest";
import { personLink, studioLink } from "@app/utils/subjectLink";
import { isSameRelease, localReleaseText } from "@app/utils/localRelease";
import { TmdbStudioType } from "@app/enums";

describe("personLink", () => {
	it("goes to their IMDb page when the id is known", () => {
		expect(personLink("Brad Pitt", "nm0000093").url).toBe("https://www.imdb.com/name/nm0000093/");
	});

	it("falls back to IMDb's name search without an id", () => {
		expect(personLink("Brad Pitt", null).url).toBe("https://www.imdb.com/find/?q=Brad%20Pitt&s=nm");
	});
});

describe("studioLink", () => {
	it("prefers the studio's own website", () => {
		expect(studioLink(420, { type: TmdbStudioType.COMPANY, homepage: "https://a24films.com" })).toEqual({
			url: "https://a24films.com",
			label: "Visit Website",
		});
	});

	it("falls back to the TMDB page of the right kind", () => {
		expect(studioLink(49, { type: TmdbStudioType.NETWORK, homepage: null })).toEqual({
			url: "https://www.themoviedb.org/network/49",
			label: "View on TMDB",
		});
	});

	it("ignores a homepage that isn't a web link, and assumes a company when unresolved", () => {
		expect(studioLink(7, { type: TmdbStudioType.COMPANY, homepage: "javascript:alert(1)" }).url).toBe(
			"https://www.themoviedb.org/company/7",
		);
		expect(studioLink(7, null).url).toBe("https://www.themoviedb.org/company/7");
	});
});

describe("localReleaseText", () => {
	const now = new Date(2026, 0, 15);

	it("titles the info page line without the country", () => {
		expect(localReleaseText("2025-07-24", "Germany", now)?.title).toBe("Released locally on");
		expect(localReleaseText("2026-07-24", "Germany", now)?.title).toBe("Releasing locally on");
	});

	it("keeps the country for the drawer's sentence", () => {
		expect(localReleaseText("2025-07-24", "Germany", now)?.label).toBe("Released in Germany");
	});
});

describe("isSameRelease", () => {
	it("matches on the day", () => {
		expect(isSameRelease("2025-07-24", "2025-07-24")).toBe(true);
		expect(isSameRelease("2025-07-24T00:00:00.000Z", "2025-07-24")).toBe(true);
	});

	it("differs on another day or a missing date", () => {
		expect(isSameRelease("2025-07-25", "2025-07-24")).toBe(false);
		expect(isSameRelease(null, "2025-07-24")).toBe(false);
		expect(isSameRelease("2025-07-24", undefined)).toBe(false);
	});
});
