import { useRef } from "react";
import { useTitleExtras } from "@app/hooks/useTitleExtras";
import { useCountryName } from "@app/hooks/useWatchProviders";
import { localReleaseLine } from "@app/utils/localRelease";
import { MediaType } from "@app/enums";
import styles from "./styles/LocalReleaseLine.module.scss";

/** A movie's release in the viewer's country (info page, info drawer). Nothing when there's no date */
export default function LocalReleaseLine({
	tmdbId,
	className,
}: {
	tmdbId: number;
	className?: string;
}) {
	const { data, region } = useTitleExtras(tmdbId, MediaType.MOVIE);
	const country = useCountryName(region);
	const line = localReleaseLine(data?.localRelease, country);
	const hadLineAtOpen = useRef(line !== null).current;
	if (!line) return null;
	const classes = [styles.line, !hadLineAtOpen && styles.fadeIn, className].filter(Boolean).join(" ");
	return <p className={classes}>{line}</p>;
}
