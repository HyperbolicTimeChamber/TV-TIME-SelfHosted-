import type { TMDBShow } from "@app/types";
import ConfirmModal from "../../components/ConfirmModal";
import UnreleasedMovieModal from "../../components/UnreleasedMovieModal";
import { colors } from "../../theme/index";

const pad = (n?: number) => String(n).padStart(2, "0");

interface Props {
	movieModal: TMDBShow | null;
	onMovieModalClose: () => void;
	onMovieAddOnly: () => void;
	onMovieAddAndWatch: () => void;
	removeModal: TMDBShow | null;
	removeError: string | null;
	removing: boolean;
	onConfirmRemove: () => void;
	onRemoveModalClose: () => void;
	unreleasedModal: { title: string } | null;
	onUnreleasedClose: () => void;
	resumeModal: {
		item: TMDBShow;
		highestEp: { season: number; episode: number };
		nextEp: { season: number; episode: number };
	} | null;
	onResumeFromWhere: () => void;
	onStartFresh: () => void;
	onResumeModalClose: () => void;
}

/** Same four modals as the app's SearchModals */
export default function SearchModals(p: Props) {
	return (
		<>
			<ConfirmModal
				visible={!!p.movieModal}
				title="Add This Movie?"
				hint={`Add "${p.movieModal?.title || p.movieModal?.name}" to your watchlist, or mark it as already watched.`}
				confirmLabel="Add to Watchlist"
				confirmColor={colors.primary}
				onConfirm={p.onMovieAddOnly}
				secondaryLabel="Add & Mark as Watched"
				secondaryColor={colors.watchedGreen}
				onSecondary={p.onMovieAddAndWatch}
				onClose={p.onMovieModalClose}
			/>

			<ConfirmModal
				visible={!!p.removeModal}
				title={`Remove "${p.removeModal?.name || p.removeModal?.title}"?`}
				hint="This will remove it from your watchlist. Your watch history will be kept."
				error={p.removeError}
				confirmLabel="Remove"
				loading={p.removing}
				onConfirm={p.onConfirmRemove}
				onClose={p.onRemoveModalClose}
			/>

			<UnreleasedMovieModal
				visible={!!p.unreleasedModal}
				onClose={p.onUnreleasedClose}
				movieTitle={p.unreleasedModal?.title ?? ""}
			/>

			<ConfirmModal
				visible={!!p.resumeModal}
				title={p.resumeModal?.item?.name || p.resumeModal?.item?.title || ""}
				hint={`You've previously watched up to S${pad(p.resumeModal?.highestEp?.season)}E${pad(p.resumeModal?.highestEp?.episode)}`}
				confirmLabel={`Resume from S${pad(p.resumeModal?.nextEp?.season)}E${pad(p.resumeModal?.nextEp?.episode)}`}
				confirmColor={colors.primary}
				onConfirm={p.onResumeFromWhere}
				secondaryLabel="Start from Beginning"
				onSecondary={p.onStartFresh}
				onClose={p.onResumeModalClose}
			/>
		</>
	);
}
