import { useState } from "react";
import { tmdbLogoUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { colors } from "../theme/index";
import styles from "./styles/ui.module.scss";

/** Art for ConfirmModal's image slot (app ModalArt) */

/** "Whoa there Speedster!" — skipped-ahead popups */
export const SPEEDSTER_ART = "/speedster.webp";

const LOGO_MAX_W = 240;
const POSTER_H = 150;

/** Bootstrap's BsFillPauseCircleFill in pause blue, the bars filled white */
function PauseBadge() {
	return (
		<svg className={styles.pauseBadge} viewBox="0 0 16 16" aria-hidden>
			<circle cx={8} cy={8} r={6} fill={colors.text} />
			<path
				fill={colors.stopBlue}
				d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M6.25 5C5.56 5 5 5.56 5 6.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C7.5 5.56 6.94 5 6.25 5m3.5 0c-.69 0-1.25.56-1.25 1.25v3.5a1.25 1.25 0 1 0 2.5 0v-3.5C11 5.56 10.44 5 9.75 5"
			/>
		</svg>
	);
}

/** Static character art, fit to the slot */
export function ModalArt({ src }: { src: string }) {
	return <img className={styles.modalArt} src={src} alt="" />;
}

/** The show / movie title logo (TMDB), its name when there's none; optional pause badge */
export function ModalLogo({ logoPath, title, paused = false }: { logoPath?: string | null; title: string; paused?: boolean }) {
	const [failed, setFailed] = useState(false);
	return (
		// Box shrinks to the logo, so the badge lands on its bottom-right corner
		<span className={`${styles.modalLogoBox} ${paused ? styles.modalLogoPaused : ""}`}>
			{logoPath && !failed ? (
				<img className={styles.modalLogo} src={tmdbLogoUri(logoPath, LOGO_MAX_W)} alt={title} onError={() => setFailed(true)} />
			) : (
				<span className={styles.modalLogoName}>{title}</span>
			)}
			{paused && <PauseBadge />}
		</span>
	);
}

/** A season (or show) poster */
export function ModalPoster({ posterPath }: { posterPath: string }) {
	return <img className={styles.modalPoster} src={tmdbPosterUri(posterPath, (POSTER_H * 2) / 3)} alt="" />;
}
