import { useState } from "react";
import { motion } from "motion/react";
import { App as AntApp } from "antd";

import { useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "../../platform/functions";
import { CloudFunction } from "@app/enums";
import { foregroundCall } from "@app/services/callQueue";
import { downloadAccountExport } from "../../platform/accountExport";
import { resetPassword, signOut } from "../../services/auth";
import { useAppSelector } from "../../store";
import { Paths } from "../../routes/paths";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import ConfirmModal from "../../components/ConfirmModal";
import ExportingModal from "../../components/ExportingModal";
import { FAREWELL_ART, LOGOUT_ART, ModalArt } from "../../components/ModalArt";
import styles from "./styles/SettingsScreen.module.scss";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/** Settings (app SettingsScreen; push-notification debug tools are mobile-only) */
export default function SettingsScreen() {
	const navigate = useNavigate();
	const { message } = AntApp.useApp();
	const user = useAppSelector((s) => s.auth.user);
	const hasCompletedImport = useAppSelector((s) => s.auth.hasCompletedImport);
	const [deleting, setDeleting] = useState(false);
	const [exporting, setExporting] = useState(false);
	const isEmailUser = user?.providerData.some((p) => p.providerId === "password") ?? false;

	const changePassword = async () => {
		if (!user?.email) return;
		try {
			await resetPassword(user.email);
			message.success("Reset email sent — check your inbox.");
		} catch {
			message.error("Failed to send reset email. Try again later.");
		}
	};

	const exportData = async () => {
		if (exporting) return;
		setExporting(true);
		try {
			await downloadAccountExport();
		} catch (err) {
			message.error((err as Error).message || "Couldn't export your data. Try again later.");
		} finally {
			setExporting(false);
		}
	};

	const [logoutVisible, setLogoutVisible] = useState(false);
	const [deleteVisible, setDeleteVisible] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const deleteAccount = async () => {
		setDeleting(true);
		setDeleteError(null);
		try {
			await foregroundCall(() => httpsCallable(getFunctions(), CloudFunction.DELETE_ACCOUNT)({}));
			await signOut();
			navigate(Paths.SEARCH, { replace: true });
		} catch (err) {
			setDeleteError((err as Error).message || "Failed to delete account.");
			setDeleting(false);
		}
	};

	return (
		// Swipe right goes back (vertical scroll stays native)
		<motion.div
			drag="x"
			dragDirectionLock
			dragConstraints={{ left: 0, right: 0 }}
			dragElastic={0.2}
			className={`${styles.container} touch-pan-y`}
			onDragEnd={(_, info) => {
				if (info.offset.x > SWIPE_BACK_PX) navigate(-1);
			}}
		>
			<div className={styles.headerRow}>
				<CircleBackButton onClick={() => navigate(-1)} />
				<h1 className={styles.headerTitle}>Settings</h1>
				<CircleButtonSpacer />
			</div>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Data</h2>
				<button className={styles.row} onClick={() => navigate(Paths.IMPORT)}>
					{hasCompletedImport ? "Re-sync TV Time Data" : "Import TV Time Data"}
				</button>
				<button className={styles.row} onClick={exportData} disabled={exporting}>
					{exporting ? "Exporting…" : "Export My Data"}
				</button>
			</section>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Account</h2>
				{isEmailUser && (
					<button className={styles.row} onClick={changePassword}>
						Change Password
					</button>
				)}
				<button
					className={`${styles.row} ${styles.deleteText}`}
					onClick={() => setLogoutVisible(true)}
				>
					Log Out
				</button>
				<button
					className={`${styles.row} ${styles.deleteText}`}
					onClick={() => {
						setDeleteError(null);
						setDeleteVisible(true);
					}}
				>
					Delete Account & Data
				</button>
			</section>

			<ConfirmModal
				visible={logoutVisible}
				title="Until Next Time"
				image={<ModalArt src={LOGOUT_ART} />}
				hint="You can sign back in any time — your watchlist and history stay saved."
				confirmLabel="Log Out"
				onConfirm={async () => {
					setLogoutVisible(false);
					await signOut();
					navigate(Paths.SEARCH, { replace: true });
				}}
				onClose={() => setLogoutVisible(false)}
			/>

			<ConfirmModal
				visible={deleteVisible}
				title="Is This Goodbye?"
				image={<ModalArt src={FAREWELL_ART} />}
				hint="This will permanently delete your account and all data. This cannot be undone. Want a copy first?"
				error={deleteError}
				confirmLabel="Delete"
				loading={deleting}
				onConfirm={deleteAccount}
				leadLabel={exporting ? "Exporting…" : "Export My Data First"}
				leadColor="#4a90d9"
				onLead={exportData}
				onClose={() => setDeleteVisible(false)}
			/>

			{/* Last, so it stacks over the delete dialog when exporting from there */}
			<ExportingModal visible={exporting} />
		</motion.div>
	);
}
