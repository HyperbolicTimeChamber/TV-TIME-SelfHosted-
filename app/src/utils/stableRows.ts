/**
 * Keeps list rows' object identity across recomputes when their content hasn't changed.
 *
 * The watchlist rebuilds every row object whenever anything in it changes (a mark, a listener
 * update, a cache write). Memoised rows compare props by reference, so every card re-rendered on
 * every change — 27 cards, up to a second of JS work per update in a dev build, several times
 * per mark. Rows that are equal to their previous version are handed back as that same object.
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** Equal by reference, or by value down to `depth` levels of plain objects / arrays */
export function similar(a: unknown, b: unknown, depth: number): boolean {
	if (Object.is(a, b)) return true;
	if (depth <= 0 || typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
		return false;
	}
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!similar(a[i], b[i], depth - 1)) return false;
		return true;
	}
	if (!isPlainObject(a) || !isPlainObject(b)) return false;
	const ka = Object.keys(a);
	if (ka.length !== Object.keys(b).length) return false;
	for (const k of ka) {
		if (!(k in b) || !similar(a[k], b[k], depth - 1)) return false;
	}
	return true;
}

/** Depth a row is compared to: the row → its payload (card / episode / show) → small nested
 *  values (next episode, credits). Bigger nested data (the catalog) compares by reference */
const ROW_DEPTH = 3;

/**
 * Returns a function mapping the new rows to rows that reuse the previous call's objects where
 * equal (matched by `keyOf`). Returns the previous array itself when nothing changed at all.
 */
export function createRowStabilizer<T extends object>(keyOf: (row: T) => string) {
	let prev = new Map<string, T>();
	let prevList: T[] | null = null;
	return (rows: T[]): T[] => {
		const next = new Map<string, T>();
		let same = prevList !== null && prevList.length === rows.length;
		const out = rows.map((row, i) => {
			const key = keyOf(row);
			const old = prev.get(key);
			const kept = old !== undefined && similar(old, row, ROW_DEPTH) ? old : row;
			next.set(key, kept);
			if (same && prevList![i] !== kept) same = false;
			return kept;
		});
		prev = next;
		if (same) return prevList!;
		prevList = out;
		return out;
	};
}
