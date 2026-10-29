import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import BottomSheet, {
	SheetCollapse,
	EpisodeSquare,
	SheetGroup,
	SheetHeader,
	SheetIcon,
	SheetOption,
	sheetStyles,
} from "./BottomSheet";
import { colors, spacing, typography } from "../../theme";
import type { MediaType } from "../../types";

/** Taps settle this long before the count is written — quick +/+/+ is one write, not three */
const COMMIT_DELAY_MS = 700;
const STEP_SIZE = 28;

interface Props {
	visible: boolean;
	title: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	/** Under the logo (watchlist episode: "Chapter 1") */
	subtitle?: string;
	/** Watchlist episode: calendar-style SEASON / Exx square beside the logo */
	episode?: { season: number; episode: number };
	/** Info page: logo alone, centred (default). Watchlist: logo left */
	centered?: boolean;
	watchCount: number;
	/** Settled change from → to (0 = unwatched) */
	onCommit: (from: number, to: number) => void;
	onClose: () => void;
}

/** Watch count sheet (info page + watchlist): set how many times it's been watched with − / + */
export default function WatchCountSheet({
	visible,
	title,
	tmdbId,
	mediaType,
	logoPath,
	subtitle,
	episode,
	centered = true,
	watchCount,
	onCommit,
	onClose,
}: Props) {
	const [count, setCount] = useState(watchCount);
	// Last value written (or the stored one) — the next commit's starting point
	const committed = useRef(watchCount);
	const pending = useRef(watchCount);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Opening: this title's count in the same render (set in an effect, the last title's count
	// showed for a frame — a "Watched Once" from a 3+ title unfolded, then folded away). Rows
	// therefore mount straight into their state; only − / + animate them
	const [openFor, setOpenFor] = useState(visible);
	if (visible !== openFor) {
		setOpenFor(visible);
		if (visible) setCount(watchCount);
	}
	useEffect(() => {
		if (!visible) return;
		committed.current = watchCount;
		pending.current = watchCount;
		// Only on open: the stored count catching up mid-edit must not reset the stepper
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible]);

	// Latest onCommit without making flush (and the unmount flush below) change every render
	const onCommitRef = useRef(onCommit);
	onCommitRef.current = onCommit;
	const flush = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		if (pending.current === committed.current) return;
		onCommitRef.current(committed.current, pending.current);
		committed.current = pending.current;
	}, []);

	// Leaving the page mid-edit still saves it
	useEffect(() => flush, [flush]);

	/** Jump straight to `n` and write it now (no debounce) — "Watched Once" / "Not Watched" */
	const setNow = (n: number) => {
		pending.current = n;
		setCount(n);
		flush();
	};

	const step = (delta: number) => {
		const next = Math.max(0, pending.current + delta);
		if (next === pending.current) return;
		Haptics.selectionAsync().catch(() => {});
		pending.current = next;
		setCount(next);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(flush, COMMIT_DELAY_MS);
	};

	return (
		<BottomSheet
			visible={visible}
			onClose={() => {
				flush();
				onClose();
			}}
		>
			{(close) => (
				<>
					<SheetHeader
						title={title}
						subtitle={subtitle}
						tmdbId={tmdbId}
						mediaType={mediaType}
						logoPath={logoPath}
						centered={centered}
						aside={
							episode ? (
								<EpisodeSquare season={episode.season} episode={episode.episode} />
							) : undefined
						}
					/>
					<SheetGroup>
						<View style={sheetStyles.row}>
							<SheetIcon icon="repeat" color={colors.accent} />
							<View style={sheetStyles.rowContent}>
								<Text style={sheetStyles.rowText}>Watch Count</Text>
								<Text style={sheetStyles.rowHint}>
									{count === 0 ? "Not watched yet" : "Times you've watched it"}
								</Text>
							</View>
							<View style={styles.stepper}>
								<StepButton
									icon="circle-minus"
									label="Watched once less"
									disabled={count === 0}
									onPress={() => step(-1)}
								/>
								<Text style={styles.value}>{count}</Text>
								<StepButton icon="circle-plus" label="Watched once more" onPress={() => step(1)} />
							</View>
						</View>
						{/* At 2, − already lands on 1 */}
						<SheetCollapse open={count > 2}>
							<SheetOption
								icon="checkmark-circle-outline"
								color={colors.watchedGreen}
								title="Watched Once"
								hint="Reset to 1x"
								onPress={() => {
									setNow(1);
									close();
								}}
							/>
						</SheetCollapse>
						<SheetCollapse open={count > 0}>
							<SheetOption
								icon="trash-outline"
								color={colors.destructiveRed}
								title="Not Watched"
								hint="Remove all watch history"
								destructive
								onPress={() => {
									setNow(0);
									close();
								}}
							/>
						</SheetCollapse>
					</SheetGroup>
				</>
			)}
		</BottomSheet>
	);
}

function StepButton({
	icon,
	label,
	disabled = false,
	onPress,
}: {
	icon: "circle-plus" | "circle-minus";
	label: string;
	disabled?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			hitSlop={6}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => [
				styles.step,
				disabled && styles.stepDisabled,
				pressed && styles.stepPressed,
			]}
		>
			<FontAwesome6 name={icon} solid size={STEP_SIZE} color={colors.accent} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
	// Font Awesome's filled circle +/− glyphs are the whole button; only a real limit (0) dims it
	step: { alignItems: "center", justifyContent: "center" },
	stepDisabled: { opacity: 0.35 },
	stepPressed: { transform: [{ scale: 0.92 }] },
	value: {
		...typography.subtitle,
		fontSize: 18,
		fontWeight: "700",
		minWidth: 28,
		textAlign: "center",
		fontVariant: ["tabular-nums"],
	},
});
