import { useEffect, useState } from "react";
import { SLOW_LOAD_MS } from "../enums";

/**
 * True once `isPending` has stayed true for `thresholdMs`; false the moment it clears. Only a
 * flag for a hint — it never touches the request itself
 */
export function useSlowPending(isPending: boolean, thresholdMs: number = SLOW_LOAD_MS): boolean {
	const [slow, setSlow] = useState(false);
	useEffect(() => {
		if (!isPending) {
			setSlow(false);
			return;
		}
		const t = setTimeout(() => setSlow(true), thresholdMs);
		return () => clearTimeout(t);
	}, [isPending, thresholdMs]);
	// `&& isPending` so no stale `true` is returned for the render before the effect resets it
	return isPending && slow;
}
