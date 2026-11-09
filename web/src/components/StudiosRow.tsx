import type { CSSProperties } from "react";
import PhotoTrigger from "./PhotoViewer";
import { useTitleExtras } from "@app/hooks/useTitleExtras";
import { tmdbLogoUri } from "@app/hooks/useTmdbImage";
import { mainStudios } from "@app/utils/studioNames";
import { studioSubject } from "@app/utils/subjectLink";
import type { MediaType } from "@app/enums";
import SkeletonBlock from "./SkeletonBlock";
import styles from "./styles/StudiosRow.module.scss";

const CHIP_PX = 112;
const CHIP_RADIUS = 12;
const SKELETONS = [0, 1, 2, 3];

/**
 * Info page Studios: the networks / production companies' logos only, each on a light chip (most
 * logos are dark on transparent), in a row that scrolls off the screen edge. Stored with the
 * title's extras (titleExtras CF). None with a logo → no section. App: components/StudiosRow
 */
export default function StudiosRow({
	tmdbId,
	mediaType,
}: {
	tmdbId: number;
	mediaType: MediaType;
}) {
	const { data, isPending, isError } = useTitleExtras(tmdbId, mediaType);
	// Each company once: a division drops out next to its parent (OLM Digital beside OLM)
	const studios = data?.studios && mainStudios(data.studios);
	if (isError || (studios && studios.length === 0)) return null;

	return (
		<section className={styles.section}>
			<h2 className={styles.label}>Studios</h2>
			<div className={styles.row}>
				{isPending || !studios
					? SKELETONS.map((i) => <SkeletonBlock key={i} className={styles.chip} />)
					: studios.map((s, i) => (
							<PhotoTrigger
								key={s.id}
								subject={studioSubject(s, { tmdbId, mediaType })}
								radius={CHIP_RADIUS}
								thumbWidth={CHIP_PX}
								className={`${styles.chip} ${styles.logoChip}`}
								style={{ "--i": i } as CSSProperties}
							>
								<img src={tmdbLogoUri(s.logo, CHIP_PX)} alt="" loading="lazy" />
							</PhotoTrigger>
						))}
			</div>
		</section>
	);
}
