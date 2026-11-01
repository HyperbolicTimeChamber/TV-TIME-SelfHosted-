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
