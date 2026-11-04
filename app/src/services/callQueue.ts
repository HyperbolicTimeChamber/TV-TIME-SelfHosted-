/**
 * Cloud Function call priority. The watchlist's self-heal can ask for dozens of refreshShow /
 * addShow calls at once; fired together they filled the device's request queue for the
 * functions host, and a search or an add the user was waiting on sat behind them until it timed
 * out (the server answered each in under a second). Background calls now go one at a time and
 * hold back while any foreground call (something the user is waiting on) is in flight.
 */

/** Background calls running at once — one keeps a user's call at most one call from the front */
const BACKGROUND_CONCURRENCY = 1;

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
