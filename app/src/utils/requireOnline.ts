import { useUiStore } from "../stores";
import { createOnlineGuard } from "./onlineGuard";

/**
 * Call at the very start of every user action that writes data or calls a Cloud Function (mark /
 * unwatch, add / remove / pause, lists, import / export, search submit…), before any optimistic UI:
 * offline it opens the "No Internet" popup and returns false — the action must stop there.
 * Browsing cached screens needs no guard. Web shares it (its stores shim maps onto Redux)
 */
export const requireOnline = createOnlineGuard(
	() => useUiStore.getState().isConnected,
	() => useUiStore.getState().setNoInternetVisible(true),
);
