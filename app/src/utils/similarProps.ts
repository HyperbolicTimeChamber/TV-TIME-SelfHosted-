/**
 * Memo comparator for list cards: props equal by value, not just by reference.
 *
 * The watchlist rebuilds every row object whenever anything in it changes (a mark, a listener
 * update, a cache write), so a plain `memo` re-rendered every card on every change — 27 cards,
 * up to a second of JS work per update in a dev build, several times per mark. The rows can't
 * keep their old objects instead: LegendList tracks rows by object, and reused objects at shifted
 * indexes misplaced rows (duplicates, a missing section header). Cards compare their props here.
 */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	Object.getPrototypeOf(v) === Object.prototype;

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

/** Depth below each prop: the card / episode / show → small nested values (next episode,
 *  credits). Bigger nested data (the catalog) compares by reference. Callbacks compare by
 *  reference, so they must be stable */
const PROP_DEPTH = 3;

/** `memo` comparator: every prop `similar` to its previous value */
export function similarProps<P extends object>(prev: Readonly<P>, next: Readonly<P>): boolean {
	const a = prev as Record<string, unknown>;
	const b = next as Record<string, unknown>;
	const keys = Object.keys(b);
	if (Object.keys(a).length !== keys.length) return false;
	for (const k of keys) if (!similar(a[k], b[k], PROP_DEPTH)) return false;
	return true;
}
