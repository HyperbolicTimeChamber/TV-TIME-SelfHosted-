import type { CSSProperties } from "react";
import { useTitleExtras } from "@app/hooks/useTitleExtras";
import { tmdbLogoUri } from "@app/hooks/useTmdbImage";
import type { MediaType } from "@app/enums";
import SkeletonBlock from "./SkeletonBlock";
import styles from "./styles/StudiosRow.module.scss";

const CHIP_PX = 112;
const SKELETONS = [0, 1, 2, 3];

/**
 * Info page Studios: the networks / production companies' logos only, each on a light chip (most
 * logos are dark on transparent), in a row that scrolls off the screen edge. Stored with the
 * title's extras (titleExtras CF). None with a logo → no section. App: components/StudiosRow
 */
export default function StudiosRow({
	tmdbId,
	mediaType,
	compact = false,
}: {
	tmdbId: number;
	mediaType: MediaType;
	/** Movies: sits under the credits — their red label, a smaller gap above */
	compact?: boolean;
}) {
	const { data, isPending, isError } = useTitleExtras(tmdbId, mediaType);
	const studios = data?.studios;
	if (isError || (studios && studios.length === 0)) return null;

	return (
		<section className={compact ? styles.sectionCompact : styles.section}>
			<h2 className={compact ? styles.label : styles.title}>Studios</h2>
			<div className={styles.row}>
				{isPending || !studios
					? SKELETONS.map((i) => <SkeletonBlock key={i} className={styles.chip} />)
					: studios.map((s, i) => (
							<span
								key={s.id}
								className={`${styles.chip} ${styles.logoChip}`}
								style={{ "--i": i } as CSSProperties}
								role="img"
								aria-label={s.name}
							>
								<img src={tmdbLogoUri(s.logo, CHIP_PX)} alt="" loading="lazy" />
							</span>
						))}
			</div>
		</section>
	);
}
