import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IoCloudOfflineOutline } from "react-icons/io5";
import { useAppDispatch, useAppSelector } from "../store";
import { setConnected } from "../store/uiSlice";

/** Offline notice (app OfflineOverlay) — Firestore keeps serving cached data meanwhile */
export default function OfflineBanner() {
	const dispatch = useAppDispatch();
	const isConnected = useAppSelector((s) => s.ui.isConnected);

	useEffect(() => {
		const update = () => dispatch(setConnected(navigator.onLine));
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
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
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						zIndex: 2000,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 8,
						padding: "calc(env(safe-area-inset-top) + 8px) 16px 8px",
						background: "#e74c3c",
						color: "#fff",
						fontSize: 13,
						fontWeight: 600,
					}}
				>
					<IoCloudOfflineOutline size={18} /> You're offline — showing saved data
				</motion.div>
			)}
		</AnimatePresence>
	);
}
