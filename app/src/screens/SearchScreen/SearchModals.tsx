import { ConfirmModal, UnreleasedMovieModal } from "../../components";
import { ModalLogo } from "../../components/modals/ModalArt";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import { colors } from "../../theme";
import { MediaType, TMDBShow } from "../../types";

const pad = (n?: number) => String(n).padStart(2, "0");
/** Title logo when the catalog has the title cached (name otherwise) */
const logoOf = (item: TMDBShow | null | undefined, mediaType: MediaType) =>
	item ? (getCachedCatalogShow(item.id, mediaType)?.logoPath ?? null) : null;
const nameOf = (item: TMDBShow | null | undefined) => item?.name || item?.title || "";

const mediaTypeOf = (item: TMDBShow | null | undefined): MediaType =>
	item?.media_type ||
	(item?.first_air_date || (item?.name && !item?.title) ? MediaType.TV : MediaType.MOVIE);

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
	const removeMediaType = mediaTypeOf(removeModal);
	return (
		<>
			<ConfirmModal
				visible={!!movieModal}
				title="Add This Movie?"
				image={
					movieModal ? (
						<ModalLogo
							logoPath={logoOf(movieModal, MediaType.MOVIE)}
							tmdbId={movieModal.id}
							mediaType={MediaType.MOVIE}
							title={nameOf(movieModal)}
						/>
					) : undefined
				}
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
				title={removeMediaType === MediaType.MOVIE ? "Remove Movie?" : "Remove Show?"}
				image={
					removeModal ? (
						<ModalLogo
							logoPath={logoOf(removeModal, removeMediaType)}
							tmdbId={removeModal.id}
							mediaType={removeMediaType}
							title={nameOf(removeModal)}
						/>
					) : undefined
				}
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
				title="Resume Watching?"
				image={
					resumeModal ? (
						<ModalLogo
							logoPath={logoOf(resumeModal.item, MediaType.TV)}
							tmdbId={resumeModal.item.id}
							mediaType={MediaType.TV}
							title={nameOf(resumeModal.item)}
						/>
					) : undefined
				}
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
