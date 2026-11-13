import type { QueryClient, QueryState } from "@tanstack/react-query";

/**
 * Loads that failed while the device was offline stay failed until something asks again —
 * React Query isn't told about connectivity on the app (an offline cold start left Trending empty
 * until a restart). This retries ONLY what failed: queries with no data, and the hooks' own
 * loaders that report an error. Anything that already has data is never refetched (cached data
 * is kept to save Firestore reads). Shared by the app (NetInfo) and web (navigator.onLine)
 */

type Listener = () => void;

/**
 * Turns raw connectivity reports into "back online" events: fires the listeners when a report
 * goes from offline to online. `null` / undefined (not known yet) changes nothing; the first
 * known report only sets the starting point
 */
export function createReconnectNotifier() {
	const listeners = new Set<Listener>();
	let connected: boolean | null = null;
	return {
		report(next: boolean | null | undefined) {
			if (next == null) return;
			const wasOffline = connected === false;
			connected = next;
			if (wasOffline && next) listeners.forEach((fn) => fn());
		},
		subscribe(fn: Listener) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		},
	};
}

const reconnect = createReconnectNotifier();
/** Raw connectivity (not the debounced uiStore flag: a short drop can fail a load too) */
export const reportConnectivity = reconnect.report;
/** Called each time the device comes back online */
export const onReconnect = reconnect.subscribe;

/**
 * A query whose load failed and that has nothing to show: errored (retries used up) or failed
 * and left idle. One with data — even if its last refetch failed — is not a failed load, and
 * one fetching / paused is already on its way
 */
export function isFailedLoad(
	state: Pick<QueryState, "data" | "status" | "fetchStatus" | "fetchFailureCount">,
): boolean {
	if (state.data !== undefined) return false;
	if (state.fetchStatus !== "idle") return false;
	return state.status === "error" || state.fetchFailureCount > 0;
}

/** Refetches the on-screen queries whose load failed — nothing else (see isFailedLoad) */
export function retryFailedQueries(client: QueryClient): Promise<void> {
	return client.refetchQueries({ type: "active", predicate: (q) => isFailedLoad(q.state) });
}
