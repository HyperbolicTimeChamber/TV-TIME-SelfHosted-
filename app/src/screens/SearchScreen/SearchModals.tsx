import { ConfirmModal, UnreleasedMovieModal } from "../../components";
import { colors } from "../../theme";
import { TMDBShow } from "../../types";

const pad = (n?: number) => String(n).padStart(2, "0");
const epCode = (ep?: { season: number; episode: number }) =>
	`S${pad(ep?.season)}E${pad(ep?.episode)}`;

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

export default function SearchModals({
	movieModal,
	onMovieModalClose,
	onMovieAddOnly,
	onMovieAddAndWatch,
	removeModal,
	removeError,
	removing,
	onConfirmRemove,
	onRemoveModalClose,
	unreleasedModal,
	onUnreleasedClose,
	resumeModal,
	onResumeFromWhere,
	onStartFresh,
	onResumeModalClose,
}: Props) {
	return (
		<>
			<ConfirmModal
				visible={!!movieModal}
				title="Add This Movie?"
				hint={`Add "${movieModal?.title || movieModal?.name}" to your watchlist, or mark it as already watched.`}
				confirmLabel="Add to Watchlist"
				confirmColor={colors.primary}
				onConfirm={onMovieAddOnly}
				secondaryLabel="Add & Mark as Watched"
				secondaryColor={colors.watchedGreen}
				onSecondary={onMovieAddAndWatch}
				onClose={onMovieModalClose}
			/>

			<ConfirmModal
				visible={!!removeModal}
				title={`Remove "${removeModal?.name || removeModal?.title}"?`}
				hint="This will remove it from your watchlist. Your watch history will be kept."
				error={removeError}
				confirmLabel="Remove"
				loading={removing}
				onConfirm={onConfirmRemove}
				onClose={onRemoveModalClose}
			/>

			<UnreleasedMovieModal
				visible={!!unreleasedModal}
				onClose={onUnreleasedClose}
				movieTitle={unreleasedModal?.title ?? ""}
			/>

			<ConfirmModal
				visible={!!resumeModal}
				title={resumeModal?.item?.name || resumeModal?.item?.title || ""}
				hint={`You've previously watched up to ${epCode(resumeModal?.highestEp)}`}
				confirmLabel={`Resume from ${epCode(resumeModal?.nextEp)}`}
				confirmColor={colors.primary}
				onConfirm={onResumeFromWhere}
				secondaryLabel="Start from Beginning"
				onSecondary={onStartFresh}
				onClose={onResumeModalClose}
			/>
		</>
	);
}
