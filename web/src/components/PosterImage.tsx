import type { CSSProperties } from "react";
import { IoFilmOutline, IoTvOutline } from "react-icons/io5";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { MediaType } from "@app/enums";
import { colors } from "../theme";

const POSTER_WIDTH = 100;

interface Props {
	posterPath: string | null | undefined;
	mediaType?: MediaType | string;
	className?: string;
	style?: CSSProperties;
	title?: string;
	/** Rendered width hint (px) for picking the TMDB size */
	width?: number;
}

/** Poster with the app's film/tv placeholder when TMDB has no image */
export default function PosterImage({ posterPath, mediaType, className, style, title, width }: Props) {
	if (posterPath) {
		return (
			<img
				src={tmdbPosterUri(posterPath, width ?? POSTER_WIDTH)}
				alt={title ?? ""}
				loading="lazy"
				className={className}
				style={{ objectFit: "cover", display: "block", ...style }}
			/>
		);
	}
	const Icon = mediaType === MediaType.MOVIE ? IoFilmOutline : IoTvOutline;
	return (
		<div
			className={className}
			style={{
				background: colors.surfaceLight,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				padding: 4,
				...style,
			}}
		>
			<Icon size={title ? 22 : 28} color={colors.textMuted} />
			{title && (
				<span style={{ fontSize: 9, color: colors.textMuted, textAlign: "center", marginTop: 2 }}>
					{title}
				</span>
			)}
		</div>
	);
}
