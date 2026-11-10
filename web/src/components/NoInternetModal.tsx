import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../store";
import { setConnected, setNoInternetVisible } from "../store/uiSlice";
import { OFFLINE_DELAY_MS } from "@app/enums";
import { createConnectivityGate } from "@app/utils/connectivityGate";
import { onReconnect, reportConnectivity, retryFailedQueries } from "@app/utils/reconnectRetry";
import { queryClient } from "../queryClient";
import ConfirmModal from "./ConfirmModal";
import { ModalArt, NO_INTERNET_ART } from "./ModalArt";

/**
 * Connectivity + the "No Internet Connection" popup (app NoInternetModal). Offline, cached pages
 * stay browsable (Firestore / React Query keep serving what's saved); requireOnline opens this when
 * an action (mark, unwatch, add, lists, search…) is tried
 */
export default function NoInternetModal() {
	const dispatch = useAppDispatch();
	const visible = useAppSelector((s) => s.ui.noInternetVisible);
	// The art is fetched while online and kept as a blob: offline, the browser can't load the file
	// (a dev / revalidated cache entry needs the network) and the popup showed without Zoro
	const [art, setArt] = useState(NO_INTERNET_ART);
	useEffect(() => {
		let url: string | null = null;
		let live = true;
		fetch(NO_INTERNET_ART)
			.then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
			.then((blob) => {
				if (!live) return;
				url = URL.createObjectURL(blob);
				setArt(url);
			})
			.catch(() => {});
		return () => {
			live = false;
			if (url) URL.revokeObjectURL(url);
		};
	}, []);

	useEffect(() => {
		// Offline only after OFFLINE_DELAY_MS without a break (a network handover drops for a
		// moment), online at once — same as the app
		const gate = createConnectivityGate(
			(connected) => dispatch(setConnected(connected)),
			OFFLINE_DELAY_MS,
		);
		const update = () => {
			gate.update(navigator.onLine);
			reportConnectivity(navigator.onLine);
		};
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		// Back online: queries that failed with nothing to show load again (never ones with data)
		const unsubscribeReconnect = onReconnect(() => void retryFailedQueries(queryClient));
		return () => {
			unsubscribeReconnect();
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
			gate.dispose();
		};
	}, [dispatch]);

	const close = () => dispatch(setNoInternetVisible(false));
	return (
		<ConfirmModal
			visible={visible}
			title="No Internet Connection"
			image={<ModalArt src={art} />}
			hint="This needs a connection. You can still browse what's saved — try again once you're back online."
			confirmLabel="OK"
			hideCancel
			onConfirm={close}
			onClose={close}
		/>
	);
}
