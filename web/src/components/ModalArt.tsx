import { useEffect, useState } from "react";
import { tmdbBackdropUri, tmdbLogoUri } from "@app/hooks/useTmdbImage";
import { useTitleLogo } from "@app/hooks/useTitleLogo";
import type { MediaType } from "@app/enums";
import { colors } from "../theme/index";
import styles from "./styles/ui.module.scss";
import SkeletonBlock from "./SkeletonBlock";

/** Art for ConfirmModal's image slot (app ModalArt) */

/** "Whoa there Speedster!" — skipped-ahead popups */
export const SPEEDSTER_ART = "/speedster.webp";
/** Rewatch floor hit — Mr. Mime, palms on the invisible wall */
export const HIT_A_WALL_ART = "/hit-a-wall.webp";
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
	nameDelay = 0,
}: {
	logoPath?: string | null;
	/** Lets a title with no cached logo (not in the library) fetch it from TMDB */
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
	/** Wait this long (ms) for the logo before showing the name — 0: name right away */
	nameDelay?: number;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [failed, setFailed] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const [waited, setWaited] = useState(nameDelay <= 0);
	useEffect(() => {
		if (nameDelay <= 0) return;
		const t = setTimeout(() => setWaited(true), nameDelay);
		return () => clearTimeout(t);
	}, [nameDelay]);
	const showLogo = !!logoPath && !failed;
	// Known to have no logo (or it failed): the name straight away; still loading: after nameDelay
	const showName = logoPath === null || failed || (!loaded && waited);
	return (
		// Fixed-height slot: the popup keeps one size while the logo is fetched / loaded; the name
		// shows until the logo image is actually in
		<div className={`${styles.modalLogoSlot} ${paused ? styles.modalLogoSlotPaused : ""}`}>
			{/* Box shrinks to the logo, so the badge lands on its bottom-right corner */}
			<span className={`${styles.modalLogoBox} ${paused ? styles.modalLogoPaused : ""}`}>
				{showName && <span className={styles.modalLogoName}>{title}</span>}
				{showLogo && (
					<img
						className={`${styles.modalLogo} ${loaded ? "" : styles.logoLoading}`}
						src={tmdbLogoUri(logoPath, LOGO_MAX_W)}
						alt={title}
						onLoad={() => setLoaded(true)}
						onError={() => setFailed(true)}
					/>
				)}
				{paused && <PauseBadge />}
			</span>
		</div>
	);
}

/** Show backdrop with its title logo (name as the fallback) over the bottom, edge to edge across
 *  the popup (no side padding); `paused` lays a big translucent pause icon over all of it.
 *  ConfirmModal pulls it up to the popup's top edge and passes its title as `heading` */
export function ModalBackdrop({
	backdropPath,
	logoPath: givenLogo,
	tmdbId,
	mediaType,
	title,
	paused = false,
	nameDelay = 0,
	heading,
}: {
	backdropPath: string;
	logoPath?: string | null;
	tmdbId?: number;
	mediaType?: MediaType;
	title: string;
	paused?: boolean;
	/** Wait this long (ms) for the logo before showing the name — 0: name right away */
	nameDelay?: number;
	/** Popup title over the top (set by ConfirmModal) */
	heading?: string;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [logoFailed, setLogoFailed] = useState(false);
	const [logoLoaded, setLogoLoaded] = useState(false);
	const [waited, setWaited] = useState(nameDelay <= 0);
	useEffect(() => {
		if (nameDelay <= 0) return;
		const t = setTimeout(() => setWaited(true), nameDelay);
		return () => clearTimeout(t);
	}, [nameDelay]);
	// Known to have no logo (or it failed): the name straight away; still coming: after nameDelay
	const showName = logoPath === null || logoFailed || (!logoLoaded && waited);
	const [loaded, setLoaded] = useState(false);
	return (
		<div className={`${styles.modalBackdrop} ${loaded ? "" : styles.modalBackdropLoading}`}>
			<img
				className={styles.modalBackdropImg}
				src={tmdbBackdropUri(backdropPath, CONTENT_W)}
				alt=""
				onLoad={() => setLoaded(true)}
				onError={() => setLoaded(true)}
			/>
			{/* Skeleton until the banner image is in; its overlays come in with it */}
			{!loaded && <SkeletonBlock className={styles.modalBackdropSkeleton} />}
			<div className={styles.modalBackdropLogo}>
				{/* Name until the logo image is in (or when there's none) */}
				{showName && <span>{title}</span>}
				{!!logoPath && !logoFailed && (
					<img
						className={logoLoaded ? "" : styles.logoLoading}
						src={tmdbLogoUri(logoPath, CONTENT_W * 0.6)}
						alt={title}
						onLoad={() => setLogoLoaded(true)}
						onError={() => setLogoFailed(true)}
					/>
				)}
			</div>
			{paused && (
				<div className={styles.modalBackdropPause}>
					<PauseBars />
				</div>
			)}
			{/* Title on a top shade (mirrors the logo's bottom one), there from the skeleton on */}
			{!!heading && <p className={styles.modalBackdropHeading}>{heading}</p>}
		</div>
	);
}
