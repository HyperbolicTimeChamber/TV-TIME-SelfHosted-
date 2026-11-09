import { useCallback, useEffect, useState } from "react";
import { Spin } from "antd";
import { IoCloseCircle, IoPerson, IoSearch } from "react-icons/io5";
import { useCastPages } from "@app/hooks/useTitleExtras";
import { useResolveSubjectLink } from "@app/hooks/useSubjectLink";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { personSubject } from "@app/utils/subjectLink";
import { CAST_SEARCH_DEBOUNCE_MS, CAST_SEARCH_MAX_LENGTH, MediaType } from "@app/enums";
import type { CastMember } from "@app/types";
import BottomSheet from "./BottomSheet";
import SkeletonBlock from "./SkeletonBlock";
import { useInfiniteScroll } from "../hooks/useInfiniteScroll";
import styles from "./styles/CastSheet.module.scss";

const AVATAR_PX = 52;
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6];

/** A show cast member's episode count (movies show none) */
function castStat(m: CastMember, mediaType: MediaType): string | null {
	if (mediaType !== MediaType.TV) return null;
	const n = m.episodes ?? 0;
	return `${n} ${n === 1 ? "episode" : "episodes"}`;
}

/**
 * The info page's View All cast: everyone, in list view (photo, name, part, a show's episode
 * count), a page at a time from the titleCastPage CF as the list nears its end. A search (name or
 * character) runs on the whole cast server-side, a quarter second after typing stops.
 * App: modals/CastSheet
 */
export default function CastSheet({
	visible,
	onClose,
	tmdbId,
	mediaType,
	title,
	castTotal,
}: {
	visible: boolean;
	onClose: () => void;
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	/** Everyone in the cast (the header's count, whatever the search shows) */
	castTotal: number;
}) {
	const resolveLink = useResolveSubjectLink();
	const [input, setInput] = useState("");
	const [query, setQuery] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setQuery(input.trim()), CAST_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [input]);
	const { data, isPending, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useCastPages(tmdbId, mediaType, visible, query);
	const members = data?.pages.flatMap((p) => p.members) ?? [];
	// Opening again starts from the whole cast
	const close = () => {
		setInput("");
		setQuery("");
		onClose();
	};
	const loadMore = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
	const sentinel = useInfiniteScroll(loadMore, visible && !!hasNextPage);

	return (
		<BottomSheet visible={visible} label="Cast" onClose={close}>
			<header className={styles.header}>
				<h2 className={styles.title}>Cast</h2>
				<p className={styles.subtitle}>
					{title} · {castTotal} {castTotal === 1 ? "person" : "people"}
				</p>
				<label className={styles.search}>
					<IoSearch size={16} />
					<input
						type="search"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Search by name or character"
						maxLength={CAST_SEARCH_MAX_LENGTH}
						aria-label="Search the cast"
						autoComplete="off"
					/>
					{input && (
						<button type="button" onClick={() => setInput("")} aria-label="Clear search">
							<IoCloseCircle size={18} />
						</button>
					)}
				</label>
			</header>
			<div
				className={`${styles.list} ${isPlaceholderData ? styles.stale : ""} ${!isPending && members.length === 0 ? styles.listEmpty : ""}`}
				key={query}
			>
				{!isPending && members.length === 0 && (
					// Search's Nothing Found: Zoro climbing out of the sheet's bottom edge
					<div className={styles.empty}>
						<p className={styles.emptyTitle}>NOTHING FOUND</p>
						<p className={styles.emptyHint}>
							Searched the whole cast for "{query}", but nothing happened. Have you lost the way?
						</p>
						<img className={styles.emptyArt} src="/no-results.webp" alt="" aria-hidden />
					</div>
				)}
				{isPending
					? SKELETON_ROWS.map((i) => (
							<div key={i} className={styles.row}>
								<SkeletonBlock className={styles.avatar} />
								<div className={styles.rowText}>
									<SkeletonBlock className={styles.skeletonLine} />
									<SkeletonBlock className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
								</div>
							</div>
						))
					: members.map((m) => (
							<div key={m.id} className={styles.row}>
								<span className={styles.avatar}>
									{m.profile ? (
										<img src={tmdbPosterUri(m.profile, AVATAR_PX)} alt="" loading="lazy" />
									) : (
										<IoPerson size={24} />
									)}
								</span>
								<span className={styles.rowText}>
									<span className={styles.name}>{m.name}</span>
									{m.character && <span className={styles.character}>{m.character}</span>}
								</span>
								<span className={styles.rowEnd}>
									{castStat(m, mediaType) && (
										<span className={styles.stat}>{castStat(m, mediaType)}</span>
									)}
									<button
										type="button"
										className={styles.imdbLink}
										aria-label={`${m.name}, view on IMDb`}
										onClick={() => {
											// Opened before the wait: a tab opened after it counts as a popup and is blocked
											const tab = window.open("", "_blank");
											if (!tab) return;
											tab.opener = null;
											void resolveLink(personSubject(m, { tmdbId, mediaType })).then((url) => {
												tab.location.href = url;
											});
										}}
									>
										IMDb
									</button>
								</span>
							</div>
						))}
				{isFetchingNextPage && (
					<div className={styles.more}>
						<Spin size="small" />
					</div>
				)}
				<div ref={sentinel} />
			</div>
		</BottomSheet>
	);
}
