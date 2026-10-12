import type { TMDBShow } from "@app/types";
import AnimatedModal from "../../components/AnimatedModal";
import ConfirmModal from "../../components/ConfirmModal";
import UnreleasedMovieModal from "../../components/UnreleasedMovieModal";
import ui from "../../styles/components/ui.module.scss";

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
			<AnimatedModal visible={!!p.movieModal} onClose={p.onMovieModalClose}>
				<p className={ui.modalTitle} style={{ marginBottom: 16 }}>
					{p.movieModal?.title || p.movieModal?.name}
				</p>
				<button className={ui.button} onClick={p.onMovieAddOnly}>
					Add to Watchlist
				</button>
				<button className={`${ui.button} ${ui.watched}`} onClick={p.onMovieAddAndWatch}>
					Add & Mark as Watched
				</button>
				<button className={ui.cancel} onClick={p.onMovieModalClose}>
					Cancel
				</button>
			</AnimatedModal>

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

			<AnimatedModal visible={!!p.resumeModal} onClose={p.onResumeModalClose}>
				<p className={ui.modalTitle}>{p.resumeModal?.item?.name || p.resumeModal?.item?.title}</p>
				<p className={ui.modalHint}>
					You've previously watched up to S{pad(p.resumeModal?.highestEp?.season)}E
					{pad(p.resumeModal?.highestEp?.episode)}
				</p>
				<button className={ui.button} onClick={p.onResumeFromWhere}>
					Resume from S{pad(p.resumeModal?.nextEp?.season)}E{pad(p.resumeModal?.nextEp?.episode)}
				</button>
				<button className={`${ui.button} ${ui.muted}`} onClick={p.onStartFresh}>
					Start from Beginning
				</button>
				<button className={ui.cancel} onClick={p.onResumeModalClose}>
					Cancel
				</button>
			</AnimatedModal>
		</>
	);
}
