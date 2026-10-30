import type { AddFailure } from "@app/types";
import ConfirmModal from "./ConfirmModal";
import { DEFEATED_ART, ModalArt } from "./ModalArt";

/** "Couldn't add" popup (app AddFailedModal) — Yamcha down, the title still off the list */
export default function AddFailedModal({
	failure,
	retrying = false,
	onRetry,
	onClose,
}: Readonly<{
	failure: AddFailure | null;
	/** Spinner in Retry while the second attempt runs */
	retrying?: boolean;
	onRetry: () => void;
	onClose: () => void;
}>) {
	return (
		<ConfirmModal
			visible={!!failure}
			title="That add got Yamcha'd"
			image={<ModalArt src={DEFEATED_ART} />}
			hint={failure ? `${failure.title} is still not on your watch list.` : undefined}
			error={failure?.message ?? null}
			confirmLabel="Retry"
			loading={retrying}
			onConfirm={onRetry}
			onClose={onClose}
		/>
	);
}
