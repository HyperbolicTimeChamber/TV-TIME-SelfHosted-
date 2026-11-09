import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useCountryName, useWatchProviders } from "@app/hooks/useWatchProviders";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { displayProviders, providerLink, shortProviderName } from "@app/utils/providerNames";
import BottomSheet, { SheetGroup } from "./BottomSheet";
import { PROVIDER_OPEN_GUARD_MS, type MediaType } from "@app/enums";
import SkeletonBlock from "./SkeletonBlock";
import styles from "./styles/WhereToWatch.module.scss";

const LOGO_PX = 60;
/** A touch screen: a service's link opens its app there (which mostly drops a search query) */
const inApp = () => globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
const SKELETONS = [0, 1, 2, 3, 4];
/** When a service was last opened: a double tap (or a tap on a second logo) opens one tab */
let lastOpenAt = 0;
const guardOpen = (e: MouseEvent) => {
	const now = Date.now();
	if (now - lastOpenAt < PROVIDER_OPEN_GUARD_MS) e.preventDefault();
	else lastOpenAt = now;
};

/**
 * Info page "Where to Watch in {country}": the services streaming the title in the viewer's
 * country (IP, else the browser locale) as a sideways-scrolling row of round logos, each opening
 * that service at its search for the title where it allows it (on a touch screen only when its
 * app fills the search in), else the service itself. None → "Not Available to Stream". App: components/WhereToWatch
 */
export default function WhereToWatch({
	tmdbId,
	mediaType,
	title,
}: {
	tmdbId: number;
	mediaType: MediaType;
	/** The title's name — the services' searches are opened with it */
	title: string;
}) {
	const { region, data, isPending, isError } = useWatchProviders(tmdbId, mediaType);
	const country = useCountryName(region);
	// A failed request says nothing about availability: no section rather than a wrong "none"
	if (isError) return null;
	const shown = data ? displayProviders(data.providers) : [];
	const touch = inApp();

	return (
		<section className={styles.section}>
			{country ? (
				<header className={styles.header}>
					<h2 className={styles.title}>Where to Watch in {country}</h2>
					{shown.length > 0 && <span className={styles.endCredit}>via JustWatch</span>}
				</header>
			) : (
				// The title waits for the country: a bar its size, so nothing moves when it lands
				<SkeletonBlock className={styles.skeletonTitle} />
			)}
			{isPending || !data ? (
				<div className={styles.row} aria-busy aria-label="Loading where to watch">
					{SKELETONS.map((i) => (
						<SkeletonBlock key={i} className={styles.skeletonLogo} />
					))}
				</div>
			) : shown.length === 0 ? (
				<div className={styles.empty}>
					<img className={styles.emptyArt} src="/high-seas.webp" alt="" />
					<div>
						<p className={styles.emptyTitle}>Not Available to Stream</p>
						<p className={styles.emptyHint}>Try the High Seas</p>
					</div>
				</div>
			) : (
				<>
					<div className={styles.row}>
						{shown.map((p, i) => (
							<a
								key={p.id}
								className={styles.tile}
								href={providerLink(p.name, title, data.link, touch) ?? undefined}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`Watch on ${p.name}`}
								onClick={guardOpen}
								style={{ "--i": i } as CSSProperties}
							>
								<img
									className={styles.logo}
									src={tmdbPosterUri(p.logo, LOGO_PX)}
									alt=""
									loading="lazy"
								/>
							</a>
						))}
					</div>
				</>
			)}
		</section>
	);
}

/** Where a compact row sits (app WhereToWatchPlacement) */
export enum WhereToWatchPlacement {
	DRAWER = "drawer",
	MODAL = "modal",
}

const COMPACT_LOGO: Record<WhereToWatchPlacement, number> = {
	[WhereToWatchPlacement.DRAWER]: 48,
	[WhereToWatchPlacement.MODAL]: 36,
};
const COMPACT_GAP: Record<WhereToWatchPlacement, number> = {
	[WhereToWatchPlacement.DRAWER]: 12,
	[WhereToWatchPlacement.MODAL]: 8,
};


/**
 * Where to Watch for the info drawer / episode modal (app WhereToWatchCompact): one row that
 * never overflows — as many logos as fit, the last slot a "+N" tile opening every service in a
 * sheet when there are more. Nothing while loading, on an error or when nothing streams it
 */
export function WhereToWatchCompact({
	tmdbId,
	mediaType,
	title,
	placement,
}: {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	placement: WhereToWatchPlacement;
}) {
	const { region, data } = useWatchProviders(tmdbId, mediaType);
	const country = useCountryName(region);
	const rowRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [sheetOpen, setSheetOpen] = useState(false);
	const shown = data ? displayProviders(data.providers) : [];
	const hasAny = shown.length > 0;
	useEffect(() => {
		const el = rowRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasAny]);
	if (!hasAny || !data) return null;

	const size = COMPACT_LOGO[placement];
	const gap = COMPACT_GAP[placement];
	const fit = width > 0 ? Math.max(1, Math.floor((width + gap) / (size + gap))) : 0;
	const overflow = shown.length > fit;
	const visible = overflow ? shown.slice(0, Math.max(0, fit - 1)) : shown;
	const touch = inApp();
	const heading =
		placement === WhereToWatchPlacement.MODAL ? "Watch on" : `Where to Watch${country ? ` in ${country}` : ""}`;
	const logoStyle = { width: size, height: size } as CSSProperties;

	return (
		<section className={placement === WhereToWatchPlacement.MODAL ? styles.compactModal : styles.compactDrawer}>
			{placement === WhereToWatchPlacement.MODAL ? (
				<h3 className={styles.compactLabel}>
					{heading}
					<span className={styles.inlineCredit}>(via JustWatch)</span>
				</h3>
			) : (
				<div className={styles.creditRow}>
					<h3 className={styles.compactTitle}>{heading}</h3>
					<span className={styles.endCredit}>via JustWatch</span>
				</div>
			)}
			<div ref={rowRef} className={styles.compactRow} style={{ gap }}>
				{width > 0 &&
					visible.map((p) => (
						<a
							key={p.id}
							className={styles.compactTile}
							href={providerLink(p.name, title, data.link, touch) ?? undefined}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Watch on ${p.name}`}
							onClick={guardOpen}
						>
							<img className={styles.logo} style={logoStyle} src={tmdbPosterUri(p.logo, size)} alt="" />
						</a>
					))}
				{width > 0 && overflow && (
					<button
						type="button"
						className={styles.compactTile}
						onClick={() => setSheetOpen(true)}
						aria-label={`${shown.length - visible.length} more streaming services`}
					>
						<img className={styles.logo} style={logoStyle} src={tmdbPosterUri(shown[visible.length].logo, size)} alt="" />
						<span className={styles.moreOverlay} style={{ fontSize: size > 40 ? 15 : 12 }}>
							+{shown.length - visible.length}
						</span>
					</button>
				)}
			</div>
			<BottomSheet visible={sheetOpen} label="Where to Watch" onClose={() => setSheetOpen(false)}>
				<div className={styles.sheetBody}>
					<div className={styles.creditRow}>
						<h3 className={styles.sheetTitle}>Where to Watch{country ? ` in ${country}` : ""}</h3>
						<span className={styles.endCredit}>via JustWatch</span>
					</div>
					<SheetGroup>
						{shown.map((p) => (
							<a
								key={p.id}
								className={styles.sheetRow}
								href={providerLink(p.name, title, data.link, touch) ?? undefined}
								target="_blank"
								rel="noopener noreferrer"
								onClick={guardOpen}
							>
								<img className={styles.sheetLogo} src={tmdbPosterUri(p.logo, 40)} alt="" />
								<span>{shortProviderName(p.name)}</span>
							</a>
						))}
					</SheetGroup>
				</div>
			</BottomSheet>
		</section>
	);
}
