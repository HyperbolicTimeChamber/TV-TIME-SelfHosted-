import ConfirmModal from "./ConfirmModal";
import { NO_INTERNET_ART, NO_INTERNET_RATIO, ModalArt } from "./ModalArt";
import { useUiStore } from "../../stores";

/**
 * "No Internet Connection" — opened by requireOnline when an action (mark, unwatch, add, lists,
 * search…) is tried offline. Cached screens stay browsable; only actions stop here. Mounted once
 * at the root (App.tsx), so it opens over any screen, sheet or carousel
 */
export default function NoInternetModal() {
	const visible = useUiStore((s) => s.noInternetVisible);
	const close = () => useUiStore.getState().setNoInternetVisible(false);
	return (
		<ConfirmModal
			visible={visible}
			title="No Internet Connection"
			image={<ModalArt source={NO_INTERNET_ART} ratio={NO_INTERNET_RATIO} />}
			hint="This needs a connection. You can still browse what's saved — try again once you're back online."
			confirmLabel="OK"
			hideCancel
			onConfirm={close}
			onClose={close}
		/>
	);
}
