import { MediaType } from "@app/enums";
import type { TMDBShow } from "@app/types";

/** TMDB multi-search items: media_type, else infer from TV-only fields */
export const mediaTypeOf = (item: TMDBShow): MediaType =>
	(item.media_type as MediaType) ||
	(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);
