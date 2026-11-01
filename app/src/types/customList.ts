import { MediaType } from "../enums";

/** A title bookmarked in a list — denormalised (title + poster) so lists render with no catalog reads */
export interface CustomListItem {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	posterPath: string | null;
	/** Epoch ms */
	addedAt: number;
}

/** users/{uid}/customLists/{id} */
export interface CustomList {
	id: string;
	name: string;
	/** In list order: new titles are appended, the user can reorder */
	items: CustomListItem[];
	/** Epoch ms */
	createdAt: number;
	updatedAt: number;
	/** Position on the profile / Lists page (smaller = earlier). Unset → createdAt */
	order?: number;
}

/** What a list stores about a title (everything but addedAt) */
export type CustomListEntry = Omit<CustomListItem, "addedAt">;
