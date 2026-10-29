import React from "react";
import BottomSheet, { SheetGroup, SheetHeader, SheetOption } from "./BottomSheet";
import { colors } from "../../theme";
import type { MediaType } from "../../types";

import { WatchAction } from "../../types/watchAction";

export { WatchAction };

interface Props {
	visible: boolean;
	/** Show / movie name — the logo's fallback */
	title: string;
	/** What the actions apply to (e.g. "S01E05 - Pilot", "Season 2") */
	subtitle?: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	watchCount: number;
	/** Also offer "Watched Once" (back to a single watch) — info page and watchlist sheets */
	showWatchedOnce?: boolean;
	onSelect: (action: WatchAction) => void;
	onClose: () => void;
}

/** Long-press watch actions (watchlist episode / movie, season and episode rows) */
export default function WatchActionSheet({
	visible,
	title,
	subtitle,
	tmdbId,
	mediaType,
	logoPath,
	watchCount,
	showWatchedOnce = false,
	onSelect,
	onClose,
}: Props) {
	return (
		<BottomSheet visible={visible} onClose={onClose}>
			{(close) => {
				const select = (action: WatchAction) => close(() => onSelect(action));
				return (
					<>
						<SheetHeader
							title={title}
							subtitle={subtitle}
							tmdbId={tmdbId}
							mediaType={mediaType}
							logoPath={logoPath}
							watchCount={watchCount}
						/>
						<SheetGroup>
							<SheetOption
								icon="refresh"
								color={colors.accent}
								title="Rewatch"
								hint="Mark as watched again"
								onPress={() => select(WatchAction.REWATCH)}
							/>
							<SheetOption
								icon={watchCount > 1 ? "remove" : "eye-off-outline"}
								color={colors.warningAmber}
								title={watchCount > 1 ? "Watched Once Less" : "Mark Unwatched"}
								hint={watchCount > 1 ? `Reduce to ${watchCount - 1}x` : "Remove from watched"}
								onPress={() => select(WatchAction.WATCHED_ONCE_LESS)}
							/>
							{/* At 2, "Watched Once Less" already lands on 1 */}
							{showWatchedOnce && watchCount > 2 && (
								<SheetOption
									icon="checkmark-circle-outline"
									color={colors.watchedGreen}
									title="Watched Once"
									hint="Reset to 1x"
									onPress={() => select(WatchAction.WATCHED_ONCE)}
								/>
							)}
							{watchCount > 1 && (
								<SheetOption
									icon="trash-outline"
									color={colors.destructiveRed}
									title="Not Watched"
									hint="Remove all watch history"
									destructive
									onPress={() => select(WatchAction.NOT_WATCHED)}
								/>
							)}
						</SheetGroup>
					</>
				);
			}}
		</BottomSheet>
	);
}
