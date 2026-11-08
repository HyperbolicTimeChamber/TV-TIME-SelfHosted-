import { useRef } from "react";
import { useTitleExtras } from "@app/hooks/useTitleExtras";
import { useCountryName } from "@app/hooks/useWatchProviders";
import { localReleaseSentence, localReleaseText } from "@app/utils/localRelease";
import { MediaType } from "@app/enums";
import styles from "./styles/LocalReleaseLine.module.scss";

function useLocalRelease(tmdbId: number, className?: string) {
	const { data, region } = useTitleExtras(tmdbId, MediaType.MOVIE);
	const country = useCountryName(region);
	const text = localReleaseText(data?.localRelease, country);
	const hadTextAtOpen = useRef(text !== null).current;
	const classes = [!hadTextAtOpen && styles.fadeIn, className].filter(Boolean).join(" ");
	return { text, classes };
}

/**
 * Info page: a movie's release in the viewer's country, as a red label like the credits' over the
 * date in the stats' big numeral face. Nothing when there's no date
 */
export default function LocalReleaseLine({
	tmdbId,
	className,
}: {
	tmdbId: number;
	className?: string;
}) {
	const { text, classes } = useLocalRelease(tmdbId, className);
	if (!text) return null;
	return (
		<div className={classes}>
			<p className={styles.label}>{text.label}</p>
			<p className={styles.date}>{text.date}</p>
		</div>
	);
}

/** Info drawer: the same, as one line of text beside the runtime */
export function LocalReleaseInline({
	tmdbId,
	className,
}: {
	tmdbId: number;
	className?: string;
}) {
	const { text, classes } = useLocalRelease(tmdbId, className);
	if (!text) return null;
	return <p className={classes}>{localReleaseSentence(text)}</p>;
}
