import ConfirmModal from "./ConfirmModal";
import { ModalBackdrop } from "./ModalArt";
import type { AddFailure } from "../../types";

/**
 * "Couldn't add" popup — the same ConfirmModal every other choice uses, so a failed add is an
 * in-app dialog the user sees while they're still on the page, not a native Alert that queues
 * up and fires the next time the app is opened.
 */
export default function AddFailedModal({
	failure,
	retrying = false,
	onRetry,
	onClose,
}: {
	failure: AddFailure | null;
	/** Spinner in Retry while the second attempt runs */
	retrying?: boolean;
	onRetry: () => void;
	onClose: () => void;
}) {
	return (
		<ConfirmModal
			visible={!!failure}
			title="Couldn't add that one"
			image={
				failure?.backdropPath ? (
					<ModalBackdrop
						backdropPath={failure.backdropPath}
						logoPath={failure.logoPath}
						tmdbId={failure.tmdbId}
						mediaType={failure.mediaType}
						title={failure.title}
					/>
				) : undefined
			}
			hint={failure ? `${failure.title} is still not on your watch list.` : undefined}
			error={failure?.message ?? null}
			confirmLabel="Retry"
			loading={retrying}
			onConfirm={onRetry}
			onClose={onClose}
		/>
	);
}
