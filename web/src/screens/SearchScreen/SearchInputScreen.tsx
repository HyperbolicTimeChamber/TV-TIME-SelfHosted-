import { useEffect, useRef } from "react";
import { IoChevronBack } from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearchInput } from "@app/screens/SearchScreen/useSearchInput";
import { Paths } from "../../routes/paths";
import styles from "./SearchInputScreen.module.css";

/** Full-screen search box with recent searches + TMDB suggestions (app SearchInputScreen) */
export default function SearchInputScreen() {
	const navigate = useNavigate();
	const [params] = useSearchParams();
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
		navigate(`${Paths.SEARCH}?q=${encodeURIComponent(trimmed)}`, { replace: true });
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
				<button type="button" className={styles.backButton} onClick={() => navigate(Paths.SEARCH)} aria-label="Back">
					<IoChevronBack size={26} />
				</button>
				<div className={styles.searchRow}>
					<input
						ref={inputRef}
						className={styles.searchInput}
						type="search"
						enterKeyHint="search"
						placeholder="Search Shows & Movies..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						autoCapitalize="none"
						autoCorrect="off"
					/>
					{query.length > 0 && (
						<button type="button" className={styles.clearButton} onClick={() => setQuery("")} aria-label="Clear">
							✕
						</button>
					)}
				</div>
			</form>

			{suggestionItems.length > 0 && (
				<section className={styles.section}>
					{suggestionItems.map((term, idx) => (
						<button key={`sug_${term}_${idx}`} className={styles.listItem} onClick={() => submitSearch(term)}>
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
						<button key={`hist_${term}_${idx}`} className={styles.listItem} onClick={() => submitSearch(term)}>
							<span className={styles.listIcon}>↻</span>
							<span className={styles.listText}>{term}</span>
						</button>
					))}
				</section>
			)}
		</div>
	);
}
