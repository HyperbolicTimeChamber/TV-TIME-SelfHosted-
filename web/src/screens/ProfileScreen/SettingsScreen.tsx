import { useState } from "react";
import { App as AntApp } from "antd";

import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { getFunctions } from "../../platform/functions";
import { resetPassword, signOut } from "../../services/auth";
import { useAppSelector } from "../../store";
import { Paths } from "../../routes/paths";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import ConfirmModal from "../../components/ConfirmModal";
import styles from "./styles/SettingsScreen.module.scss";

/** Settings (app SettingsScreen; push-notification debug tools are mobile-only) */
export default function SettingsScreen() {
	const navigate = useNavigate();
	const { message } = AntApp.useApp();
	const user = useAppSelector((s) => s.auth.user);
	const hasCompletedImport = useAppSelector((s) => s.auth.hasCompletedImport);
	const [deleting, setDeleting] = useState(false);
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

	const [logoutVisible, setLogoutVisible] = useState(false);
	const [deleteVisible, setDeleteVisible] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const deleteAccount = async () => {
		setDeleting(true);
		setDeleteError(null);
		try {
			await httpsCallable(getFunctions(), "deleteAccount")({});
			await signOut();
			navigate(Paths.SEARCH, { replace: true });
		} catch (err) {
			setDeleteError((err as Error).message || "Failed to delete account.");
			setDeleting(false);
		}
	};

	return (
		<div className={styles.container}>
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
				title="Log Out?"
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
				title="Delete Account?"
				hint="This will permanently delete your account and all data. This cannot be undone."
				error={deleteError}
				confirmLabel="Delete"
				loading={deleting}
				onConfirm={deleteAccount}
				onClose={() => setDeleteVisible(false)}
			/>
		</div>
	);
}
