type ListItem = { type: string; card?: { tmdbId: number } };

/**
 * Shows just marked (tmdbId → when) moved to the top of the active section, newest first, before
 * Firestore confirms the new priority. Saved as-is, so closing the app right after a mark doesn't
 * bring the card back in its old spot on the next launch. Nothing to promote → the same list.
 */
export function promoteShows<T extends ListItem>(list: T[], promoted: ReadonlyMap<number, number>): T[] {
	if (promoted.size === 0) return list;
	const lifted = list
		.filter((i) => i.type === "show" && i.card && promoted.has(i.card.tmdbId))
		.sort((a, b) => promoted.get(b.card!.tmdbId)! - promoted.get(a.card!.tmdbId)!);
	if (lifted.length === 0) return list;
	const rest = list.filter((i) => !lifted.includes(i));
	const firstShow = rest.findIndex((i) => i.type === "show");
	// Right after the active section's header (before its first show, or at the end)
	const at = firstShow === -1 ? rest.length : firstShow;
	return [...rest.slice(0, at), ...lifted, ...rest.slice(at)];
}

/**
 * Live tracking pages arrive by Firestore priorityDate, but the list sorts by effective priority
 * (a freshly aired episode lifts a card past its priorityDate) — such a card can rank near the
 * top yet sit on a later page. Saved cards the live pages haven't reached keep their saved spot
 * between the live ones (appended at the end, they vanished from the top and jumped back once
 * their page loaded). All saved cards live → the live list as-is.
 */
export function mergeCachedShows<T extends ListItem>(cached: T[], live: T[]): T[] {
	const liveIds = new Set<number>();
	for (const i of live) if (i.type === "show" && i.card) liveIds.add(i.card.tmdbId);
	const saved = cached.filter((i) => i.type === "show" && i.card);
	if (saved.every((i) => liveIds.has(i.card!.tmdbId))) return live;
	const savedAt = new Map(saved.map((i, k) => [i.card!.tmdbId, k]));
	const out: T[] = [];
	let next = 0;
	const flushTo = (end: number) => {
		for (; next < end; next++) if (!liveIds.has(saved[next].card!.tmdbId)) out.push(saved[next]);
	};
	for (const item of live) {
		const at = item.type === "show" && item.card ? savedAt.get(item.card.tmdbId) : undefined;
		if (at !== undefined) flushTo(at);
		out.push(item);
		if (at !== undefined) next = Math.max(next, at + 1);
	}
	if (liveIds.size === 0) {
		// The saved active section's own header (not "Previously Watched")
		const header = cached[cached.indexOf(saved[0]) - 1];
		if (header?.type === "sectionHeader") out.push(header);
	}
	flushTo(saved.length);
	return out;
}
