import { describe, expect, it } from "vitest";
import reducer, {
	initialAuthState,
	loadAppConfig,
	loadCachedProfilePrefs,
	loadUserFlags,
	saveProfilePrefs,
	userChanged,
} from "../../src/store/authSlice";
import { TMDB_PROXY_KEY } from "@app/enums";

const user = { uid: "u1", email: "a@b.c", displayName: null, photoURL: null, providerData: [] };

describe("authSlice", () => {
	it("guests use the TMDB proxy key", () => {
		const s = reducer(initialAuthState, userChanged(null));
		expect(s.user).toBeNull();
		expect(s.loading).toBe(false);
		expect(s.appTmdbApiKey).toBe(TMDB_PROXY_KEY);
		expect(s.appTmdbApiKeyLoading).toBe(false);
	});

	it("signed-in users wait for config/app, then use its key", () => {
		let s = reducer(initialAuthState, userChanged(user));
		expect(s.appTmdbApiKeyLoading).toBe(true);
		s = reducer(
			s,
			loadAppConfig.fulfilled(
				{
					appTmdbApiKey: "real",
					minVersion: "1.0.0",
					lastCatalogSync: "2026-10-04T03:00:00.000Z",
					previousCatalogSync: null,
					changedShowIds: ["tv_1"],
				},
				"",
			),
		);
		expect(s.appTmdbApiKey).toBe("real");
		expect(s.changedShowIds).toEqual(["tv_1"]);
		expect(s.appTmdbApiKeyLoading).toBe(false);
	});

	it("config read failure falls back to the proxy", () => {
		let s = reducer(initialAuthState, userChanged(user));
		s = { ...s, appTmdbApiKey: null };
		s = reducer(s, loadAppConfig.rejected(new Error("denied"), ""));
		expect(s.appTmdbApiKey).toBe(TMDB_PROXY_KEY);
	});

	it("sign-out resets to guest config", () => {
		let s = reducer(initialAuthState, userChanged(user));
		s = reducer(s, userChanged(null));
		expect(s.appTmdbApiKey).toBe(TMDB_PROXY_KEY);
		expect(s.hasCompletedImport).toBe(false);
	});

	it("profile settings: default, saved copy, user doc, optimistic change, reset on sign-out", () => {
		let s = reducer(initialAuthState, userChanged(user));
		expect(s.profilePrefs).toEqual({ listCount: 5, showCompleted: true });
		s = reducer(s, loadCachedProfilePrefs.fulfilled({ listCount: 2, showCompleted: false }, "", "u1"));
		expect(s.profilePrefs).toEqual({ listCount: 2, showCompleted: false });
		s = reducer(
			s,
			loadUserFlags.fulfilled(
				{ hasCompletedImport: true, profilePrefs: { listCount: 8, showCompleted: true } },
				"",
				"u1",
			),
		);
		expect(s.profilePrefs).toEqual({ listCount: 8, showCompleted: true });
		// The optimistic change lands on pending, and a count out of range is clamped
		s = reducer(s, saveProfilePrefs.pending("", { uid: "u1", patch: { listCount: 99 } }));
		expect(s.profilePrefs.listCount).toBe(10);
		s = reducer(s, saveProfilePrefs.pending("", { uid: "u1", patch: { showCompleted: false } }));
		expect(s.profilePrefs).toEqual({ listCount: 10, showCompleted: false });
		// Same account reported again keeps them; signing out resets them
		s = reducer(s, userChanged(user));
		expect(s.profilePrefs.listCount).toBe(10);
		s = reducer(s, userChanged(null));
		expect(s.profilePrefs).toEqual({ listCount: 5, showCompleted: true });
	});
});
