import { FOREGROUND_RESERVED_THREADS, NATIVE_CALLABLE_THREADS } from "../enums";

/**
 * Cloud Function call priority. On Android, RNFirebase runs callables on its task executor,
 * one thread by default, each call holding it until its response — every callable in the app
 * shared that one lane. The watchlist's self-heal fired ~40 refreshShow calls at once, and a
 * search or an add the user was waiting on sat behind them until it timed out (the server
 * answered each in under a second). firebase.json `react-native.android_task_executor_maximum_pool_size`
 * gives the native side NATIVE_CALLABLE_THREADS threads, FOREGROUND_RESERVED_THREADS of them kept
 * for calls the user is waiting on: background calls are capped at the rest, and start no new
 * ones while a foreground call is in flight.
 */

/** Background calls running at once: the native threads left after the foreground's reserved
 *  ones — so a foreground call always finds a free thread, however many heals are queued */
export const BACKGROUND_CONCURRENCY = NATIVE_CALLABLE_THREADS - FOREGROUND_RESERVED_THREADS;

let foreground = 0;
let running = 0;
const waiting: Array<() => void> = [];

function pump() {
	while (foreground === 0 && running < BACKGROUND_CONCURRENCY && waiting.length > 0) {
		waiting.shift()!();
	}
}

/** A call the user is waiting on (search, add): background calls pause until it settles */
export async function foregroundCall<T>(fn: () => Promise<T>): Promise<T> {
	foreground++;
	try {
		return await fn();
	} finally {
		foreground--;
		pump();
	}
}

/** A call nobody is waiting on (self-heal, shared refresh): queued behind everything else */
export function backgroundCall<T>(fn: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		waiting.push(() => {
			running++;
			fn()
				.then(resolve, reject)
				.finally(() => {
					running--;
					pump();
				});
		});
		pump();
	});
}
