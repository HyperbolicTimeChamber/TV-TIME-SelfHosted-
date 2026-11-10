/**
 * Debounces "offline" for the offline overlay: reports offline only once the connection has been
 * down for `delayMs` without a break, online at once. `null` (NetInfo hasn't decided yet) is
 * unknown — it changes nothing. Shared by the app (NetInfo) and web (navigator.onLine)
 */
export function createConnectivityGate(
	report: (connected: boolean) => void,
	delayMs: number,
	timers: {
		set: (fn: () => void, ms: number) => unknown;
		clear: (id: unknown) => void;
	} = {
		set: (fn, ms) => setTimeout(fn, ms),
		clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
	},
) {
	let pending: unknown = null;
	const cancel = () => {
		if (pending !== null) timers.clear(pending);
		pending = null;
	};
	return {
		update(connected: boolean | null | undefined) {
			if (connected == null) return;
			if (connected) {
				cancel();
				report(true);
				return;
			}
			if (pending !== null) return;
			pending = timers.set(() => {
				pending = null;
				report(false);
			}, delayMs);
		},
		dispose: cancel,
	};
}
