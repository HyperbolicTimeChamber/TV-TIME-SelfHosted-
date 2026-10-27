import { IoFilmOutline, IoTvOutline } from "react-icons/io5";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { MediaType } from "@app/enums";
import { colors } from "../theme";

const POSTER_WIDTH = 100;

interface Props {
	posterPath: string | null | undefined;
	mediaType?: MediaType | string;
	className?: string;
	title?: string;
	/** Rendered width hint (px) for picking the TMDB size */
	width?: number;
}

/** Poster with the app's film/tv placeholder when TMDB has no image */
export default function PosterImage({
	posterPath,
	mediaType,
	className = "",
	title,
	width,
}: Props) {
	if (posterPath) {
		return (
			<img
				src={tmdbPosterUri(posterPath, width ?? POSTER_WIDTH)}
				alt={title ?? ""}
				loading="lazy"
				className={`block object-cover ${className}`}
			/>
		);
	}
	const Icon = mediaType === MediaType.MOVIE ? IoFilmOutline : IoTvOutline;
	return (
		<div className={`flex flex-col items-center justify-center bg-surface-light p-1 ${className}`}>
			<Icon size={title ? 22 : 28} color={colors.textMuted} />
			{title && <span className="mt-0.5 text-center text-[9px] text-fg-muted">{title}</span>}
		</div>
	);
}
