import { useState } from "react";
import { tmdbBackdropUri, tmdbLogoUri } from "@app/hooks/useTmdbImage";
import { useTitleLogo } from "@app/hooks/useTitleLogo";
import type { MediaType } from "@app/enums";
import { colors } from "../theme/index";
import styles from "./styles/ui.module.scss";

/** Art for ConfirmModal's image slot (app ModalArt) */

/** "Whoa there Speedster!" — skipped-ahead popups */
export const SPEEDSTER_ART = "/speedster.webp";
/** Log Out — Straw Hats, fists up */
export const LOGOUT_ART = "/logout.webp";
/** Delete Account — crying Pikachu */
export const FAREWELL_ART = "/farewell.webp";

const LOGO_MAX_W = 240;
/** Popup content width — image request size */
const CONTENT_W = 300;

/** Heroicons' HiPauseCircle in gray, the bars filled black */
function PauseBadge({ className = styles.pauseBadge }: { className?: string }) {
	return (
		<svg className={className} viewBox="2.25 2.25 19.5 19.5" aria-hidden>
			<circle cx={12} cy={12} r={6.5} fill={colors.background} />
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				fill={colors.textSecondary}
				d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z"
			/>
		</svg>
	);
}

/** Two black pause bars (no circle), larger and closer together than HiPauseCircle's — the big
 *  icon on a paused backdrop */
function PauseBars() {
	return (
		<svg className={styles.pauseCenter} viewBox="0 0 100 100" aria-hidden>
			<rect x={26} y={22} width={20} height={56} rx={5} fill={colors.background} />
			<rect x={54} y={22} width={20} height={56} rx={5} fill={colors.background} />
		</svg>
	);
}

/** Static character art, fit to the slot */
export function ModalArt({ src }: { src: string }) {
	return <img className={styles.modalArt} src={src} alt="" />;
}

/** The show / movie title logo (TMDB), its name when there's none; optional pause badge */
export function ModalLogo({
	logoPath: givenLogo,
	tmdbId,
	mediaType,
	title,
	paused = false,
}: {
	logoPath?: string | null;
	/** Lets a title with no cached logo (not in the library) fetch it from TMDB */
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [failed, setFailed] = useState(false);
	return (
		// Fixed-height slot: the popup keeps one size while the logo is fetched / loaded
		<div className={`${styles.modalLogoSlot} ${paused ? styles.modalLogoSlotPaused : ""}`}>
			{logoPath !== undefined && (
				// Box shrinks to the logo, so the badge lands on its bottom-right corner
				<span className={`${styles.modalLogoBox} ${paused ? styles.modalLogoPaused : ""}`}>
					{logoPath && !failed ? (
						<img className={styles.modalLogo} src={tmdbLogoUri(logoPath, LOGO_MAX_W)} alt={title} onError={() => setFailed(true)} />
					) : (
						<span className={styles.modalLogoName}>{title}</span>
					)}
					{paused && <PauseBadge />}
				</span>
			)}
		</div>
	);
}

/** Show backdrop with its title logo (name as the fallback) over the bottom, edge to edge across
 *  the popup (no side padding); `paused` lays a big translucent pause icon over all of it */
export function ModalBackdrop({
	backdropPath,
	logoPath: givenLogo,
	tmdbId,
	mediaType,
	title,
	paused = false,
}: {
	backdropPath: string;
	logoPath?: string | null;
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [logoFailed, setLogoFailed] = useState(false);
	return (
		<div className={styles.modalBackdrop}>
			<img className={styles.modalBackdropImg} src={tmdbBackdropUri(backdropPath, CONTENT_W)} alt="" />
			<div className={styles.modalBackdropLogo}>
				{logoPath === undefined ? null : logoPath && !logoFailed ? (
					<img src={tmdbLogoUri(logoPath, CONTENT_W * 0.6)} alt={title} onError={() => setLogoFailed(true)} />
				) : (
					<span>{title}</span>
				)}
			</div>
			{paused && (
				<div className={styles.modalBackdropPause}>
					<PauseBars />
				</div>
			)}
		</div>
	);
}
