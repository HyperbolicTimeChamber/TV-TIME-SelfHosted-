import ConfirmModal from "./ConfirmModal";
import { DEFEATED_ART, DEFEATED_RATIO, ModalArt } from "./ModalArt";
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
			title="That add got Yamcha'd"
			image={<ModalArt source={DEFEATED_ART} ratio={DEFEATED_RATIO} />}
			hint={failure ? `${failure.title} is still not on your watch list.` : undefined}
			error={failure?.message ?? null}
			confirmLabel="Retry"
			loading={retrying}
			onConfirm={onRetry}
			onClose={onClose}
		/>
	);
}
