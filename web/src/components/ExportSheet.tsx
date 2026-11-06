import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { IconType } from "react-icons";
import {
	IoAlbumsOutline,
	IoBookmarksOutline,
	IoCheckmark,
	IoCubeOutline,
	IoFilmOutline,
	IoListOutline,
	IoOptionsOutline,
	IoTvOutline,
} from "react-icons/io5";
import { ExportContent, ExportFilter, ExportPart, ExportScope } from "@app/enums";
import {
	EXPORT_FILTERS,
	EXPORT_TITLE_PARTS,
	accountExportOptions,
	type AccountExportOptions,
} from "@app/utils/accountExport";
import BottomSheet, { SheetCollapse, SheetGroup, SheetIcon, sheetStyles } from "./BottomSheet";
import styles from "./styles/ExportSheet.module.scss";

interface Props {
	visible: boolean;
	onClose: () => void;
	/** Export pressed: the sheet slides out; the export runs with these options */
	onExport: (options: AccountExportOptions) => void;
}

const COLOR_PRIMARY = "#e50914";
const COLOR_MOVIE = "#8b5cf6";
const COLOR_GREEN = "#00a800";
const COLOR_AMBER = "#f59e0b";

const SCOPES: Array<{
	scope: ExportScope;
	icon: IconType;
	color: string;
	title: string;
	hint: string;
}> = [
	{
		scope: ExportScope.ALL,
		icon: IoAlbumsOutline,
		color: COLOR_PRIMARY,
		title: "All",
		hint: "Every show and movie you track",
	},
	{
		scope: ExportScope.MOVIES,
		icon: IoFilmOutline,
		color: COLOR_MOVIE,
		title: "Movies",
		hint: "Only your movies",
	},
	{
		scope: ExportScope.TV,
		icon: IoTvOutline,
		color: COLOR_GREEN,
		title: "TV Shows",
		hint: "Only your shows",
	},
	{
		scope: ExportScope.LISTS,
		icon: IoBookmarksOutline,
		color: COLOR_AMBER,
		title: "Custom lists",
		hint: "Just your lists and the titles in them — no tracking data",
	},
];

/** Each sub-option's name and what sets it apart (app ExportSheet) */
const FILTER_LABELS: Record<ExportFilter, { movies: [string, string]; tv: [string, string] }> = {
	[ExportFilter.ALL]: {
		movies: ["All Movies", "Every movie you track, watched or not"],
		tv: ["All Shows", "Every show you track"],
	},
	[ExportFilter.MOVIES_TO_WATCH]: {
		movies: ["Movies to be watched", "Already out, but you haven't watched them yet"],
		tv: ["", ""],
	},
	[ExportFilter.MOVIES_UPCOMING]: {
		movies: ["Upcoming movies", "Not released yet"],
		tv: ["", ""],
	},
	[ExportFilter.TV_ENDED]: {
		movies: ["", ""],
		tv: ["Ended shows", "Finished or cancelled — no new episodes coming"],
	},
	[ExportFilter.TV_ONGOING]: {
		movies: ["", ""],
		tv: ["Ongoing shows", "Still airing or coming back"],
	},
};

const CONTENTS: Array<{
	content: ExportContent;
	icon: IconType;
	color: string;
	title: string;
	hint: string;
}> = [
	{
		content: ExportContent.EVERYTHING,
		icon: IoCubeOutline,
		color: COLOR_PRIMARY,
		title: "All the data",
		// Replaced for everything (a full backup takes the lists too) — see contentHint
		hint: "Progress and watch history of these titles",
	},
	{
		content: ExportContent.CHOSEN,
		icon: IoOptionsOutline,
		color: COLOR_AMBER,
		title: "Certain data",
		hint: "Pick which parts go in the file",
	},
	{
		content: ExportContent.TITLES,
		icon: IoListOutline,
		color: COLOR_MOVIE,
		title: "Titles only",
		hint: "Just the names of the shows and movies — no progress or history",
	},
];

const PARTS: Array<{ part: ExportPart; title: string; hint: string }> = [
	{
		part: ExportPart.PROGRESS,
		title: "Watch progress",
		hint: "Each title's status, next episode and rewatch count",
	},
	{
		part: ExportPart.HISTORY,
		title: "Watch history",
		hint: "Every episode and movie you watched, with dates and counts",
	},
];

/** A step sliding in: from the side it comes from, ease-out (a response to the tap), quick */
const STEP_IN = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;
const STEP_SHIFT = 24;

function StepIn({ from, children }: { from: 1 | -1; children: ReactNode }) {
	const reduced = useReducedMotion();
	return (
		<motion.div
			initial={{ opacity: 0, x: reduced ? 0 : from * STEP_SHIFT }}
			animate={{ opacity: 1, x: 0, transition: STEP_IN }}
		>
			{children}
		</motion.div>
	);
}

/** A radio / checkbox mark: ring when off, filled with a tick when on */
function Mark({ on, square = false }: { on: boolean; square?: boolean }) {
	return (
		<span
			className={`${styles.mark} ${square ? styles.markSquare : ""} ${on ? styles.markOn : ""}`}
		>
			{on && <IoCheckmark size={14} />}
		</span>
	);
}

function ChoiceRow({
	icon,
	color,
	title,
	hint,
	on,
	onClick,
	square = false,
	sub = false,
}: {
	icon?: IconType;
	color?: string;
	title: string;
	hint?: string;
	on: boolean;
	onClick: () => void;
	square?: boolean;
	/** A sub-option under its parent row: indented, no icon tile */
	sub?: boolean;
}) {
	return (
		<button
			type="button"
			role={square ? "checkbox" : "radio"}
			aria-checked={on}
			className={`${sheetStyles.row} ${sheetStyles.option} ${sub ? styles.subRow : ""}`}
			onClick={onClick}
		>
			{icon && color && <SheetIcon icon={icon} color={color} />}
			<span className={sheetStyles.rowContent}>
				<span className={`${sheetStyles.rowText} ${sub ? styles.subText : ""}`}>{title}</span>
				{hint && <span className={sheetStyles.rowHint}>{hint}</span>}
			</span>
			{/* Sub-options are square ticks (step 1's filters pick one, step 2's parts any) */}
			<Mark on={on} square={square || sub} />
		</button>
	);
}

function SheetButton({
	label,
	onClick,
	primary = false,
	disabled = false,
}: {
	label: string;
	onClick: () => void;
	primary?: boolean;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			className={`${styles.button} ${primary ? styles.buttonPrimary : styles.buttonSecondary}`}
			disabled={disabled}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

/**
 * Settings → Export My Data (app ExportSheet), in two steps: which titles (All / Movies — all, to
 * be watched, upcoming / TV Shows — all, ended, ongoing), then how much of them (all the data,
 * certain parts, or just the list of titles). The sub-options fold open under their row.
 */
export default function ExportSheet({ visible, onClose, onExport }: Props) {
	const [step, setStep] = useState<1 | 2>(1);
	const [scope, setScope] = useState(ExportScope.ALL);
	const [filter, setFilter] = useState(ExportFilter.ALL);
	const [content, setContent] = useState(ExportContent.EVERYTHING);
	const [parts, setParts] = useState<ReadonlySet<ExportPart>>(new Set(EXPORT_TITLE_PARTS));
	// Opens on its first step every time
	useEffect(() => {
		if (visible) setStep(1);
	}, [visible]);

	const pickScope = (next: ExportScope) => {
		if (next !== scope) setFilter(ExportFilter.ALL);
		setScope(next);
	};
	const togglePart = (part: ExportPart) =>
		setParts((prev) => {
			const next = new Set(prev);
			if (next.has(part)) next.delete(part);
			else next.add(part);
			return next;
		});
	const nothingChosen = content === ExportContent.CHOSEN && parts.size === 0;
	const listsOnly = scope === ExportScope.LISTS;
	// Everything's "all the data" is a full backup: the lists go in too
	const contentHint = (c: ExportContent, hint: string) =>
		c === ExportContent.EVERYTHING && scope === ExportScope.ALL
			? "A full backup: progress, watch history and your custom lists"
			: hint;
	const runExport = () => {
		onClose();
		onExport(accountExportOptions(scope, filter, content, parts));
	};

	return (
		<BottomSheet visible={visible} label="Export my data" onClose={onClose}>
			{step === 1 ? (
				<StepIn key="scope" from={-1}>
					<p className={styles.stepLabel}>{listsOnly ? "EXPORT" : "STEP 1 OF 2"}</p>
					<h2 className={styles.title}>What do you want to export?</h2>
					<SheetGroup>
						{SCOPES.flatMap(({ scope: s, icon, color, title, hint }) => {
							const row = (
								<ChoiceRow
									key={s}
									icon={icon}
									color={color}
									title={title}
									hint={hint}
									on={scope === s}
									onClick={() => pickScope(s)}
								/>
							);
							const filters = EXPORT_FILTERS[s];
							if (filters.length === 0) return [row];
							return [
								row,
								<SheetCollapse key={`${s}-filters`} open={scope === s}>
									{filters.map((f) => (
										<ChoiceRow
											key={f}
											sub
											title={FILTER_LABELS[f][s === ExportScope.MOVIES ? "movies" : "tv"][0]}
											hint={FILTER_LABELS[f][s === ExportScope.MOVIES ? "movies" : "tv"][1]}
											on={filter === f}
											onClick={() => setFilter(f)}
										/>
									))}
								</SheetCollapse>,
							];
						})}
					</SheetGroup>
					<div className={styles.footer}>
						{listsOnly ? (
							// Just lists — nothing to choose about tracking data
							<SheetButton primary label="Export" onClick={runExport} />
						) : (
							<SheetButton primary label="Next" onClick={() => setStep(2)} />
						)}
					</div>
				</StepIn>
			) : (
				<StepIn key="content" from={1}>
					<p className={styles.stepLabel}>STEP 2 OF 2</p>
					<h2 className={styles.title}>What should it include?</h2>
					<SheetGroup>
						{CONTENTS.flatMap(({ content: c, icon, color, title, hint }) => {
							const row = (
								<ChoiceRow
									key={c}
									icon={icon}
									color={color}
									title={title}
									hint={contentHint(c, hint)}
									on={content === c}
									onClick={() => setContent(c)}
								/>
							);
							if (c !== ExportContent.CHOSEN) return [row];
							return [
								row,
								<SheetCollapse key="parts" open={content === ExportContent.CHOSEN}>
									{PARTS.map(({ part, title: partTitle, hint: partHint }) => (
										<ChoiceRow
											key={part}
											sub
											square
											title={partTitle}
											hint={partHint}
											on={parts.has(part)}
											onClick={() => togglePart(part)}
										/>
									))}
								</SheetCollapse>,
							];
						})}
					</SheetGroup>
					<div className={styles.footer}>
						<SheetButton label="Back" onClick={() => setStep(1)} />
						<SheetButton primary label="Export" disabled={nothingChosen} onClick={runExport} />
					</div>
				</StepIn>
			)}
		</BottomSheet>
	);
}
