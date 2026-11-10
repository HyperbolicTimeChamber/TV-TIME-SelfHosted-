import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IoCloudOfflineOutline } from "react-icons/io5";
import { useAppDispatch, useAppSelector } from "../store";
import { setConnected } from "../store/uiSlice";
import { OFFLINE_OVERLAY_DELAY_MS } from "@app/enums";
import { createConnectivityGate } from "@app/utils/connectivityGate";

/** Offline notice (app OfflineOverlay) — Firestore keeps serving cached data meanwhile */
export default function OfflineBanner() {
	const dispatch = useAppDispatch();
	const isConnected = useAppSelector((s) => s.ui.isConnected);

	useEffect(() => {
		// Offline only after OFFLINE_OVERLAY_DELAY_MS without a break (a network handover drops
		// for a moment), online at once — same as the app
		const gate = createConnectivityGate(
			(connected) => dispatch(setConnected(connected)),
			OFFLINE_OVERLAY_DELAY_MS,
		);
		const update = () => gate.update(navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
			gate.dispose();
		};
	}, [dispatch]);

	return (
		<AnimatePresence>
			{!isConnected && (
				<motion.div
					role="status"
					initial={{ y: -60 }}
					animate={{ y: 0 }}
					exit={{ y: -60 }}
					className="fixed inset-x-0 top-0 z-[2000] flex items-center justify-center gap-2 bg-danger px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-2 text-[13px] font-semibold text-white"
				>
					<IoCloudOfflineOutline size={18} /> You're offline — showing saved data
				</motion.div>
			)}
		</AnimatePresence>
	);
}
