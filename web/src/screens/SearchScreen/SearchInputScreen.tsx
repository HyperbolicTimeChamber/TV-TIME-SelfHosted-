import { IoIosCloseCircle } from "react-icons/io";
import { useEffect, useRef } from "react";
import { IoChevronBackCircleOutline } from "react-icons/io5";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSearchInput } from "@app/screens/SearchScreen/useSearchInput";
import { encodeText } from "@app/utils/subjectLink";
import { SEARCH_MAX_QUERY_LENGTH } from "@app/enums";
import { Paths } from "../../routes/paths";
import styles from "./styles/SearchInputScreen.module.scss";

/** Full-screen search box with recent searches + TMDB suggestions (app SearchInputScreen) */
export default function SearchInputScreen() {
	const navigate = useNavigate();
	const [params] = useSearchParams();
	// Opened from a results page, which sits under this one in history
	const overResults = !!(useLocation().state as { overResults?: boolean } | null)?.overResults;
	const inputRef = useRef<HTMLInputElement>(null);
	const { query, setQuery, addToHistory, clearHistory, filteredHistory, suggestionItems } =
		useSearchInput(params.get("q") ?? "");

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const submitSearch = (term: string) => {
		const trimmed = term.trim();
		if (!trimmed) return;
		addToHistory(trimmed);
		const results = `${Paths.SEARCH}?q=${encodeText(trimmed)}`;
		if (!overResults) {
			navigate(results, { replace: true });
			return;
		}
		// Over a results page: step back onto it, then replace it, so one results page stays above
		// Trending and back from a second search goes there
		window.addEventListener("popstate", () => navigate(results, { replace: true }), { once: true });
		window.history.back();
	};

	return (
		<div className={styles.container}>
			<form
				className={styles.searchBarRow}
				onSubmit={(e) => {
					e.preventDefault();
					submitSearch(query);
				}}
			>
				<button
					type="button"
					className={styles.backButton}
					onClick={() => (overResults ? navigate(-1) : navigate(Paths.SEARCH))}
					aria-label="Back"
				>
					<IoChevronBackCircleOutline size={30} />
				</button>
				<div className={styles.searchRow}>
					<input
						ref={inputRef}
						className={styles.searchInput}
						type="search"
						enterKeyHint="search"
						placeholder="Search Shows & Movies..."
						maxLength={SEARCH_MAX_QUERY_LENGTH}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						autoCapitalize="none"
						autoCorrect="off"
					/>
					{query.length > 0 && (
						<button
							type="button"
							className={styles.clearButton}
							onClick={() => setQuery("")}
							aria-label="Clear"
						>
							<IoIosCloseCircle size={20} />
						</button>
					)}
				</div>
			</form>

			{suggestionItems.length > 0 && (
				<section className={styles.section}>
					{suggestionItems.map((term, idx) => (
						<button
							key={`sug_${term}_${idx}`}
							className={styles.listItem}
							onClick={() => submitSearch(term)}
						>
							<span className={styles.listIcon}>{idx === 0 ? "🔍" : "→"}</span>
							<span className={styles.listText}>{term}</span>
						</button>
					))}
				</section>
			)}

			{filteredHistory.length > 0 && (
				<section className={styles.section}>
					<div className={styles.sectionHeader}>
						<span className={styles.sectionTitle}>Recent</span>
						{query.length === 0 && (
							<button className={styles.clearAll} onClick={clearHistory}>
								Clear All
							</button>
						)}
					</div>
					{filteredHistory.map((term, idx) => (
						<button
							key={`hist_${term}_${idx}`}
							className={styles.listItem}
							onClick={() => submitSearch(term)}
						>
							<span className={styles.listIcon}>↻</span>
							<span className={styles.listText}>{term}</span>
						</button>
					))}
				</section>
			)}
		</div>
	);
}
