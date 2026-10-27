import type { MediaType } from "../enums";

/** A failed "add to watch list", with enough to draw the title's banner in the retry popup */
export interface AddFailure {
	title: string;
	tmdbId: number;
	mediaType: MediaType;
	backdropPath?: string | null;
	logoPath?: string | null;
	message: string;
}
