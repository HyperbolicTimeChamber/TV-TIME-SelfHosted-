import { useState, type CSSProperties } from "react";
import { IoChevronForward, IoPerson } from "react-icons/io5";
import { useTitleExtras } from "@app/hooks/useTitleExtras";
import CastSheet from "./CastSheet";
import PhotoTrigger from "./PhotoViewer";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { personSubject } from "@app/utils/subjectLink";
import { FEATURED_CAST_MAX, type MediaType } from "@app/enums";
import SkeletonBlock from "./SkeletonBlock";
import styles from "./styles/CastRow.module.scss";

const CARD_PX = 104;
const CARD_RADIUS = 14;
const SKELETONS = [0, 1, 2, 3, 4];

/**
 * Info page Cast: a movie's leads / a show's regulars as photo cards with the name over a black
 * fade at the foot, in a row that scrolls off the screen edge, ending in View All (the whole cast,
 * paged, in a sheet). Stored with the title's extras (titleExtras CF). App: components/CastRow
 */
export default function CastRow({
	tmdbId,
	mediaType,
	title,
}: {
	tmdbId: number;
	mediaType: MediaType;
	/** The title's name (the View All sheet's subtitle) */
	title: string;
}) {
	const { data: extras, isPending, isError } = useTitleExtras(tmdbId, mediaType);
	// At most FEATURED_CAST_MAX before View All (casts stored before the cap was lowered too)
	const data = extras?.cast.slice(0, FEATURED_CAST_MAX);
	const [sheetOpen, setSheetOpen] = useState(false);
	if (isError || (data && data.length === 0)) return null;

	return (
		<section className={styles.section}>
			<h2 className={styles.title}>Cast</h2>
			<div className={styles.row} aria-busy={isPending || undefined}>
				{isPending || !data
					? SKELETONS.map((i) => <SkeletonBlock key={i} className={styles.card} />)
					: data.map((m, i) => (
							<figure
								key={m.id}
								className={styles.card}
								style={{ "--i": i } as CSSProperties}
								aria-label={m.character ? `${m.name} as ${m.character}` : m.name}
							>
								{m.profile ? (
									<PhotoTrigger
										subject={personSubject(m, { tmdbId, mediaType })}
										radius={CARD_RADIUS}
										thumbWidth={CARD_PX}
										className={styles.photoTrigger}
									>
										<img
											className={styles.photo}
											src={tmdbPosterUri(m.profile, CARD_PX)}
											alt=""
											loading="lazy"
										/>
									</PhotoTrigger>
								) : (
									<span className={styles.noPhoto}>
										<IoPerson size={40} />
									</span>
								)}
								<figcaption className={styles.name}>{m.name}</figcaption>
							</figure>
						))}
				{data && (extras?.castTotal ?? 0) > 0 && (
					<button
						type="button"
						className={`${styles.card} ${styles.viewAll}`}
						style={{ "--i": data.length } as CSSProperties}
						onClick={() => setSheetOpen(true)}
						aria-label={`View all ${extras?.castTotal} cast`}
					>
						<span className={styles.viewAllArrow}>
							<IoChevronForward size={24} />
						</span>
						<span className={styles.viewAllText}>View All</span>
						<span className={styles.viewAllCount}>{extras?.castTotal} people</span>
					</button>
				)}
			</div>
			<CastSheet
				visible={sheetOpen}
				onClose={() => setSheetOpen(false)}
				tmdbId={tmdbId}
				mediaType={mediaType}
				title={title}
				castTotal={extras?.castTotal ?? 0}
			/>
		</section>
	);
}
