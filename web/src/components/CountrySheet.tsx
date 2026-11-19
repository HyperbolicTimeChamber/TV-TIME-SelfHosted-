import { useMemo, useState, type MouseEvent } from "react";
import { IoChevronBack, IoChevronForward, IoCloseCircle, IoSearch } from "react-icons/io5";
import { useRegionProviders, useStoredRegions } from "@app/hooks/useRegionProviders";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { displayProviders, shortProviderName } from "@app/utils/providerNames";
import { requireOnline } from "@app/utils/requireOnline";
import { buildRegionList, regionFlag, regionName, type RegionEntry } from "@app/utils/watchRegions";
import { COUNTRY_SEARCH_MAX_LENGTH, type MediaType } from "@app/enums";
import BottomSheet from "./BottomSheet";
import SkeletonBlock from "./SkeletonBlock";
import styles from "./styles/CountrySheet.module.scss";

const SKELETON_ROWS = [0, 1, 2, 3, 4];

/**
 * Where to Watch "Other Countries": a search + every country (stored ones first); picking one
 * shows its services in the sheet (skeleton while they load, "Not Available to Stream" when none),
 * the back arrow returns to the list. The list has a fixed height, so results never resize the
 * sheet. App: modals/CountrySheet
 */
export default function CountrySheet({
	visible,
	onClose,
	tmdbId,
	mediaType,
	currentRegion,
	hrefFor,
	onLinkClick,
}: {
	visible: boolean;
	onClose: () => void;
	tmdbId: number;
	mediaType: MediaType;
	/** The viewer's country: left out of the list (the footer row shows it) */
	currentRegion: string | undefined;
	/** A service's link for the picked country's TMDB watch page */
	hrefFor: (name: string, link: string | null) => string | undefined;
	/** WhereToWatch's double-open guard */
	onLinkClick: (e: MouseEvent) => void;
}) {
	const [input, setInput] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const stored = useStoredRegions(tmdbId, mediaType, visible, selected);
	const storedSet = useMemo(() => new Set(stored), [stored]);
	const list = useMemo(
		() => buildRegionList(stored, input, currentRegion),
		[stored, input, currentRegion],
	);
	// Opening again starts from the whole list
	const close = () => {
		setInput("");
		setSelected(null);
		onClose();
	};
	const pick = (entry: RegionEntry) => {
		// A second click before the detail shows does nothing
		if (selected) return;
		// Only a country not on the page yet calls the server
		if (!storedSet.has(entry.code) && !requireOnline()) return;
		setSelected(entry.code);
	};

	return (
		<BottomSheet visible={visible} label="Other Countries" onClose={close}>
			{selected ? (
				<RegionDetail
					region={selected}
					tmdbId={tmdbId}
					mediaType={mediaType}
					onBack={() => setSelected(null)}
					hrefFor={hrefFor}
					onLinkClick={onLinkClick}
				/>
			) : (
				<>
					<header className={styles.header}>
						<h2 className={styles.title}>Other Countries</h2>
						<label className={styles.search}>
							<IoSearch size={16} />
							<input
								type="search"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								placeholder="Search countries"
								maxLength={COUNTRY_SEARCH_MAX_LENGTH}
								aria-label="Search countries"
								autoComplete="off"
							/>
							{input && (
								<button type="button" onClick={() => setInput("")} aria-label="Clear search">
									<IoCloseCircle size={18} />
								</button>
							)}
						</label>
					</header>
					<div className={`${styles.list} ${list.length === 0 ? styles.listEmpty : ""}`}>
						{list.length === 0 ? (
							// Search's Nothing Found: Zoro climbing out of the sheet's bottom edge
							<div className={styles.empty}>
								<p className={styles.emptyTitle}>NOTHING FOUND</p>
								<p className={styles.emptyHint}>
									Looked through every country for "{input.trim()}", but found none. Have you lost
									the way?
								</p>
								<img className={styles.emptyArt} src="/no-results.webp" alt="" aria-hidden />
							</div>
						) : (
							list.map((c) => (
								<button
									key={c.code}
									type="button"
									className={styles.row}
									onClick={() => pick(c)}
									aria-label={`${c.name}, show where to watch`}
								>
									<span className={styles.flag}>{c.flag}</span>
									<span className={styles.name}>{c.name}</span>
									<IoChevronForward size={16} className={styles.chevron} />
								</button>
							))
						)}
					</div>
				</>
			)}
		</BottomSheet>
	);
}

/** One country's services in the sheet: back arrow, its name, then skeleton / services / none */
function RegionDetail({
	region,
	tmdbId,
	mediaType,
	onBack,
	hrefFor,
	onLinkClick,
}: {
	region: string;
	tmdbId: number;
	mediaType: MediaType;
	onBack: () => void;
	hrefFor: (name: string, link: string | null) => string | undefined;
	onLinkClick: (e: MouseEvent) => void;
}) {
	const { data, isPending, isError } = useRegionProviders(tmdbId, mediaType, region);
	const shown = data ? displayProviders(data.providers) : [];

	return (
		<>
			<header className={styles.header}>
				<div className={styles.detailHead}>
					<button
						type="button"
						className={styles.back}
						onClick={onBack}
						aria-label="Back to countries"
					>
						<IoChevronBack size={22} />
					</button>
					<h2 className={styles.title}>
						{regionFlag(region)} {regionName(region)}
					</h2>
					{shown.length > 0 && <span className={styles.credit}>via JustWatch</span>}
				</div>
			</header>
			<div className={styles.list}>
				{isPending ? (
					<div aria-busy aria-label="Loading where to watch">
						{SKELETON_ROWS.map((i) => (
							<div key={i} className={styles.row}>
								<SkeletonBlock className={styles.skeletonLogo} />
								<SkeletonBlock className={styles.skeletonLine} />
							</div>
						))}
					</div>
				) : isError || !data ? (
					<div className={styles.note}>
						<p className={styles.noteTitle}>Couldn't Load Streaming Services</p>
						<p className={styles.noteHint}>Go back and pick the country again to retry.</p>
					</div>
				) : shown.length === 0 ? (
					<div className={styles.none}>
						<img className={styles.noneArt} src="/high-seas.webp" alt="" />
						<p className={styles.noteTitle}>Not Available to Stream</p>
					</div>
				) : (
					shown.map((p) => (
						<a
							key={p.id}
							className={styles.row}
							href={hrefFor(p.name, data.link)}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Watch on ${p.name}`}
							onClick={onLinkClick}
						>
							<img className={styles.logo} src={tmdbPosterUri(p.logo, 40)} alt="" />
							<span className={styles.name}>{shortProviderName(p.name)}</span>
						</a>
					))
				)}
			</div>
		</>
	);
}
