import type { CSSProperties } from "react";
import { useCountryName, useWatchProviders } from "@app/hooks/useWatchProviders";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { displayProviders, providerLink } from "@app/utils/providerNames";
import type { MediaType } from "@app/enums";
import SkeletonBlock from "./SkeletonBlock";
import styles from "./styles/WhereToWatch.module.scss";

const LOGO_PX = 60;
const SKELETONS = [0, 1, 2, 3, 4];

/**
 * Info page "Where to Watch in {country}": the services streaming the title in the viewer's
 * country (IP, else the browser locale) as a sideways-scrolling row of round logos, each opening
 * that service at its search for the title where it allows it, else the service itself. None → "Not Available to Stream". App: components/WhereToWatch
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

	return (
		<section className={styles.section}>
			{country ? (
				<header className={styles.header}>
					<h2 className={styles.title}>Where to Watch in {country}</h2>
					{/* TMDB's terms: the availability data is JustWatch's */}
					{shown.length > 0 && <p className={styles.attribution}>Streaming data by JustWatch</p>}
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
								href={providerLink(p.name, title, data.link) ?? undefined}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`Watch on ${p.name}`}
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
