import { useEffect, useRef } from "react";
import { onReconnect } from "../utils/reconnectRetry";

/**
 * For loaders outside React Query: calls `retry` when the device comes back online, but only
 * while `failed` — a loader that has its data is never asked again
 */
export function useRetryOnReconnect(failed: boolean, retry: () => void): void {
	const retryRef = useRef(retry);
	retryRef.current = retry;
	useEffect(() => {
		if (!failed) return;
		return onReconnect(() => retryRef.current());
	}, [failed]);
}
