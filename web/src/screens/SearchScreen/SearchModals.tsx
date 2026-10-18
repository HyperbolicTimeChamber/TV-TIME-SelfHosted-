import type { TMDBShow } from "@app/types";
import ConfirmModal from "../../components/ConfirmModal";
import UnreleasedMovieModal from "../../components/UnreleasedMovieModal";
import { colors } from "../../theme/index";
import { ModalLogo } from "../../components/ModalArt";
import { getCachedCatalogShow } from "@app/hooks/useWatchlist";
import { MediaType } from "@app/enums";

/** Title logo when the catalog has the title cached (name otherwise) */
const logoOf = (item: TMDBShow, mediaType: MediaType) => getCachedCatalogShow(item.id, mediaType)?.logoPath ?? null;
const nameOf = (item: TMDBShow) => item.name || item.title || "";
const mediaTypeOf = (item: TMDBShow | null): MediaType =>
	item?.media_type || (item?.first_air_date || (item?.name && !item?.title) ? MediaType.TV : MediaType.MOVIE);

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
				image={p.movieModal ? <ModalLogo logoPath={logoOf(p.movieModal, MediaType.MOVIE)} tmdbId={p.movieModal.id} mediaType={MediaType.MOVIE} title={nameOf(p.movieModal)} /> : undefined}
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
				title={mediaTypeOf(p.removeModal) === MediaType.MOVIE ? "Remove Movie?" : "Remove Show?"}
				image={p.removeModal ? <ModalLogo logoPath={logoOf(p.removeModal, mediaTypeOf(p.removeModal))} tmdbId={p.removeModal.id} mediaType={mediaTypeOf(p.removeModal)} title={nameOf(p.removeModal)} /> : undefined}
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
				title="Resume Watching?"
				image={p.resumeModal ? <ModalLogo logoPath={logoOf(p.resumeModal.item, MediaType.TV)} tmdbId={p.resumeModal.item.id} mediaType={MediaType.TV} title={nameOf(p.resumeModal.item)} /> : undefined}
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
