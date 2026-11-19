import type { CustomList } from "../types";
import { moveElement } from "./customLists";

/** The list being dragged on the Lists page: its id, where it started, where it is now */
export interface ActiveDrag {
	id: string;
	from: number;
	to: number;
}

/** What the Lists page draws for the profile cutoff */
export interface CutoffPlacement {
	/** Lists the profile does not show: faded */
	dimmedIds: Set<string>;
	/** The divider sits on this list's top edge (in the gap above it)... */
	lineTopId: string | null;
	/** ...or on this list's bottom edge (when the list under the line is the one being dragged) */
	lineBottomId: string | null;
}

/** Nothing dimmed, no line (before the page has computed one) */
export const NO_CUTOFF: CutoffPlacement = {
	dimmedIds: new Set<string>(),
	lineTopId: null,
	lineBottomId: null,
};

/** The order the library is showing while a card is dragged (it reports the real one on the drop) */
export function previewOrder(ordered: CustomList[], drag: ActiveDrag | null): CustomList[] {
	return drag ? moveElement(ordered, drag.from, drag.to) : ordered;
}

export function cutoffPlacement(
	ordered: CustomList[],
	count: number,
	draggedId: string | null = null,
): CutoffPlacement {
	const dimmedIds = new Set<string>();
	let shown = 0;
	let lastShown = -1;
	ordered.forEach((list, index) => {
		if (list.items.length > 0 && shown < count) {
			shown += 1;
			lastShown = index;
		} else {
			dimmedIds.add(list.id);
		}
	});
	const below = ordered[lastShown + 1];
	if (!below) return { dimmedIds, lineTopId: null, lineBottomId: null };
	if (below.id !== draggedId) return { dimmedIds, lineTopId: below.id, lineBottomId: null };
	const above = ordered[lastShown];
	return { dimmedIds, lineTopId: null, lineBottomId: above ? above.id : null };
}

/** Does moving the dragged list on to index `nextTo` flip it between shown and faded? (haptic tick) */
export function crossesCutoff(
	ordered: CustomList[],
	drag: ActiveDrag,
	nextTo: number,
	count: number,
): boolean {
	const was = cutoffPlacement(previewOrder(ordered, drag), count).dimmedIds.has(drag.id);
	const now = cutoffPlacement(previewOrder(ordered, { ...drag, to: nextTo }), count).dimmedIds.has(
		drag.id,
	);
	return was !== now;
}
