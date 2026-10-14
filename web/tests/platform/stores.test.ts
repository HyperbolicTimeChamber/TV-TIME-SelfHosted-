import { describe, expect, it } from "vitest";
import { useAuthStore, useUiStore } from "../../src/platform/stores";
import { store } from "../../src/store";
import { userChanged } from "../../src/store/authSlice";

describe("compat stores (shared app hooks → Redux)", () => {
	it("getState reads live Redux state", () => {
		store.dispatch(
			userChanged({ uid: "u9", email: null, displayName: null, photoURL: null, providerData: [] }),
		);
		expect(useAuthStore.getState().user?.uid).toBe("u9");
	});

	it("ui actions dispatch to Redux", () => {
		useUiStore.getState().setConnected(false);
		expect(store.getState().ui.isConnected).toBe(false);
		useUiStore.getState().setWatchlistLoading(false);
		expect(useUiStore.getState().watchlistLoading).toBe(false);
	});
});
