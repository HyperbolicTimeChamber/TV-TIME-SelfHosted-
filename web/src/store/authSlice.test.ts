import { describe, expect, it } from "vitest";
import reducer, { initialAuthState, loadAppConfig, userChanged } from "./authSlice";
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
});
