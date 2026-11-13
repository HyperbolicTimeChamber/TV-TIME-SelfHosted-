/**
 * Builds requireOnline: true when the action may run, else `onBlocked` (the "No Internet" popup)
 * and false. `isOnline` is the debounced connectivity state (connectivityGate) — unknown counts
 * as online, so nothing is blocked before NetInfo / the browser has decided
 */
export function createOnlineGuard(isOnline: () => boolean, onBlocked: () => void): () => boolean {
	return () => {
		if (isOnline()) return true;
		onBlocked();
		return false;
	};
}
