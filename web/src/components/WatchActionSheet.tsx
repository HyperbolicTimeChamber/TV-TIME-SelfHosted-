import {
	IoCheckmarkCircleOutline,
	IoEyeOffOutline,
	IoRefresh,
	IoRemove,
	IoTrashOutline,
} from "react-icons/io5";
import type { MediaType } from "@app/enums";
import { WatchAction } from "@app/enums";
import BottomSheet, { SheetGroup, SheetHeader, SheetOption } from "./BottomSheet";
import { colors } from "../theme/index";

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

/** Long-press watch actions (app WatchActionSheet) */
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
	const select = (action: WatchAction) => {
		onClose();
		onSelect(action);
	};
	return (
		<BottomSheet visible={visible} label={title} onClose={onClose}>
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
					icon={IoRefresh}
					color={colors.accent}
					title="Rewatch"
					hint="Mark as watched again"
					onClick={() => select(WatchAction.REWATCH)}
				/>
				<SheetOption
					icon={watchCount > 1 ? IoRemove : IoEyeOffOutline}
					color={colors.warningAmber}
					title={watchCount > 1 ? "Watched Once Less" : "Mark Unwatched"}
					hint={watchCount > 1 ? `Reduce to ${watchCount - 1}x` : "Remove from watched"}
					onClick={() => select(WatchAction.WATCHED_ONCE_LESS)}
				/>
				{showWatchedOnce && watchCount > 1 && (
					<SheetOption
						icon={IoCheckmarkCircleOutline}
						color={colors.watchedGreen}
						title="Watched Once"
						hint="Reset to 1x"
						onClick={() => select(WatchAction.WATCHED_ONCE)}
					/>
				)}
				{watchCount > 1 && (
					<SheetOption
						icon={IoTrashOutline}
						color={colors.destructiveRed}
						title="Not Watched"
						hint="Remove all watch history"
						destructive
						onClick={() => select(WatchAction.NOT_WATCHED)}
					/>
				)}
			</SheetGroup>
		</BottomSheet>
	);
}
