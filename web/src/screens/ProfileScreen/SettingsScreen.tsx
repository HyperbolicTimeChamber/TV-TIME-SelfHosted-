import { useRef, useState } from "react";
import { motion } from "motion/react";
import { App as AntApp } from "antd";

import { useNavigate } from "react-router-dom";
import { getFunctions, httpsCallable } from "../../platform/functions";
import { ACCOUNT_IMPORT_MAX_BYTES, CloudFunction } from "@app/enums";
import { foregroundCall } from "@app/services/callQueue";
import {
	describeAccountExport,
	describeAccountImport,
	parseAccountExport,
	type AccountExportOptions,
	type RestoreMatch,
} from "@app/utils/accountExport";
import { describeImport, type ImportedList } from "@app/utils/customListsIO";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { trackedIdsQuery } from "@app/hooks/useTrackedIds";
import { emitShowRemoved } from "@app/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
	cancelAccountJob,
	downloadAccountExport,
	fetchAccountExport,
	importAccountTitles,
	readJsonFile,
	type AccountImportResult,
} from "../../platform/accountExport";
import { resetPassword, signOut } from "../../services/auth";
import { useAppSelector } from "../../store";
import { Paths } from "../../routes/paths";
import { CircleBackButton, CircleButtonSpacer } from "../../components/CircleButton";
import ConfirmModal from "../../components/ConfirmModal";
import ExportingModal from "../../components/ExportingModal";
import ImportingScreen from "../../components/ImportingScreen";
import PacmanLoader from "../../components/PacmanLoader";
import ExportSheet from "../../components/ExportSheet";
import {
	FAREWELL_ART,
	IMPORT_CONFIRM_ART,
	IMPORT_DONE_ART,
	IMPORT_NOTHING_ART,
	IMPORT_CANCELLED_ART,
	LOGOUT_ART,
	ModalArt,
} from "../../components/ModalArt";
import PoweredByTmdb from "../../components/PoweredByTmdb";
import { APP_VERSION_LABEL } from "@app/utils/appVersion";
import { requireOnline } from "@app/utils/requireOnline";
import styles from "./styles/SettingsScreen.module.scss";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/** Why a picked import file can't be read */
const IMPORT_FILE_ERRORS = {
	invalid: "That isn't a Watchloom data export.",
	newer: "This file comes from a newer version of the app. Reload and try again.",
	empty: "There's nothing in this file to import.",
	too_large: "That file is too big to be a Watchloom data export.",
	unreadable: "Couldn't read that file.",
} as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The import result's titles line(s) */
function describeTitlesImport(r: AccountImportResult): string {
	if (r.titlesAdded === 0) {
		return `Nothing new to eat — ${r.titlesSkipped === 1 ? "that title's" : `all ${r.titlesSkipped} titles are`} already tracked!`;
	}
	const kept =
		r.titlesSkipped > 0
			? ` ${plural(r.titlesSkipped, "title was", "titles were")} already tracked and left as they were.`
			: "";
	const watched =
		r.episodesImported + r.moviesImported > 0
			? ` ${plural(r.episodesImported, "episode", "episodes")} and ${plural(r.moviesImported, "movie", "movies")} marked watched.`
			: "";
	return `${plural(r.titlesAdded, "title", "titles")} added.${kept}${watched}`;
}

/** A random id the running export is known by, so Cancel can stop it server-side */
const newJobId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Settings (app SettingsScreen; push-notification debug tools are mobile-only) */
export default function SettingsScreen() {
	const navigate = useNavigate();
	const { message } = AntApp.useApp();
	const user = useAppSelector((s) => s.auth.user);
	const hasCompletedImport = useAppSelector((s) => s.auth.hasCompletedImport);
	const [deleting, setDeleting] = useState(false);
	// The export running (its options, for the popup's line), and its job id — cleared by Cancel,
	// so a result that still arrives is dropped
	const [exporting, setExporting] = useState<AccountExportOptions | null>(null);
	const exportJob = useRef<string | null>(null);
	const [exportSheetVisible, setExportSheetVisible] = useState(false);
	// Import: the picked file (confirm popup), the import running, its result
	const [importFile, setImportFile] = useState<{
		matches: RestoreMatch[];
		lists: ImportedList[];
		summary: string;
	} | null>(null);
	const [importing, setImporting] = useState(false);
	// The running import's job id (Cancel takes it back by it), and Cancel pressed (app parity)
	const importJob = useRef<string | null>(null);
	const cancelledJob = useRef<string | null>(null);
	// Titles in the file that weren't tracked before the import (a cancel drops them from view)
	const newTitles = useRef<number[]>([]);
	const queryClient = useQueryClient();
	const [importCancelled, setImportCancelled] = useState(false);
	// The result popup: its line(s), and whether anything new came in (its title)
	const [importResult, setImportResult] = useState<{ text: string; fed: boolean } | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const { planImport, applyImport } = useCustomLists(user?.uid);
	const isEmailUser = user?.providerData.some((p) => p.providerId === "password") ?? false;

	const changePassword = async () => {
		if (!user?.email || !requireOnline()) return;
		try {
			await resetPassword(user.email);
			message.success("Reset email sent — check your inbox.");
		} catch {
			message.error("Failed to send reset email. Try again later.");
		}
	};

	const runExport = async (options: AccountExportOptions) => {
		if (exportJob.current || !requireOnline()) return;
		const jobId = newJobId();
		exportJob.current = jobId;
		setExporting(options);
		let data: unknown;
		try {
			data = await fetchAccountExport(options, jobId);
		} catch (err) {
			if (exportJob.current !== jobId) return;
			exportJob.current = null;
			setExporting(null);
			message.error((err as Error).message || "Couldn't export your data. Try again later.");
			return;
		}
		// Cancelled meanwhile: the result is dropped
		if (exportJob.current !== jobId) return;
		exportJob.current = null;
		setExporting(null);
		try {
			downloadAccountExport(data, options);
		} catch (err) {
			message.error((err as Error).message || "Couldn't save your data. Try again later.");
		}
	};

	const cancelExport = () => {
		const jobId = exportJob.current;
		if (!jobId) return;
		exportJob.current = null;
		setExporting(null);
		cancelAccountJob(jobId);
	};

	const onImportFileChosen = async (file: File | undefined) => {
		const picked = await readJsonFile(file, ACCOUNT_IMPORT_MAX_BYTES);
		if (!picked.ok) {
			if (picked.reason !== "canceled") message.error(IMPORT_FILE_ERRORS[picked.reason]);
			return;
		}
		const parsed = parseAccountExport(picked.text);
		if (!parsed.ok) {
			message.error(IMPORT_FILE_ERRORS[parsed.reason]);
			return;
		}
		setImportFile({
			matches: parsed.matches,
			lists: parsed.lists,
			summary: describeAccountImport(parsed.matches, parsed.lists),
		});
	};

	const runImport = async () => {
		const file = importFile;
		if (!file || !user || !requireOnline()) return;
		setImportFile(null);
		setImporting(true);
		const jobId = newJobId();
		importJob.current = jobId;
		// What was tracked before (cached for the session): a cancel drops the file's other titles
		// from view at once
		const before = await queryClient
			.ensureQueryData(trackedIdsQuery(user.uid))
			.catch(() => new Set<number>());
		newTitles.current = file.matches.map((m) => m.tmdbId).filter((id) => !before.has(id));
		const lines: string[] = [];
		let fed = false;
		try {
			if (file.matches.length > 0) {
				const result = await importAccountTitles(user.uid, file.matches, jobId);
				// Cancelled while it ran: the server takes it back on its own (cancelImport)
				if (cancelledJob.current === jobId) return;
				lines.push(describeTitlesImport(result));
				if (result.titlesAdded > 0) fed = true;
			}
			if (cancelledJob.current === jobId) return;
			// The lists last, and no Cancel from here: they're saved in a moment, from this device
			importJob.current = null;
			// Lists merge by name, titles already in a list are skipped
			if (file.lists.length > 0) {
				const plan = await planImport(file.lists);
				if (await applyImport(plan).catch(() => false)) {
					if (plan.listsCreated + plan.listsMerged > 0) fed = true;
					lines.push(
						plan.listsCreated + plan.listsMerged > 0
							? describeImport(plan)
							: "Your lists were already up to date.",
					);
				}
			}
			setImportResult({ text: lines.join("\n"), fed });
		} catch (err) {
			// Cancelled: the server stopped it and took it back — not a failure
			if (cancelledJob.current === jobId) return;
			message.error((err as Error).message || "Couldn't import that file. Try again later.");
		} finally {
			if (importJob.current === jobId) importJob.current = null;
			// Cancel already closed the import screen
			if (cancelledJob.current !== jobId) setImporting(false);
		}
	};

	// Import → Cancel: done at once for the user — the screen goes, the file's new titles leave
	// the lists (optimistic). The server stops the import and takes back what it added in its own
	// time; delta sync carries the deletes to every device
	const cancelImport = () => {
		const jobId = importJob.current;
		if (!jobId) return;
		importJob.current = null;
		cancelledJob.current = jobId;
		void cancelAccountJob(jobId);
		for (const id of newTitles.current) emitShowRemoved(id);
		setImporting(false);
		setImportCancelled(true);
	};

	const [logoutVisible, setLogoutVisible] = useState(false);
	const [deleteVisible, setDeleteVisible] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const deleteAccount = async () => {
		if (!requireOnline()) return;
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
				<h2 className={styles.sectionTitle}>Preferences</h2>
				<button className={styles.row} onClick={() => navigate(Paths.APPEARANCE)}>
					Appearance
				</button>
				<button className={styles.row} onClick={() => navigate(Paths.NOTIFICATIONS)}>
					Notifications
				</button>
			</section>

			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>Data</h2>
				<button className={styles.row} onClick={() => navigate(Paths.IMPORT)}>
					{hasCompletedImport ? "Re-sync TV Time Data" : "Import TV Time Data"}
				</button>
				<button
					className={styles.row}
					onClick={() => requireOnline() && setExportSheetVisible(true)}
					disabled={!!exporting}
				>
					Export My Data
				</button>
				<button
					className={styles.row}
					onClick={() => requireOnline() && fileInput.current?.click()}
					disabled={importing}
				>
					Import Data
				</button>
				<input
					ref={fileInput}
					type="file"
					accept="application/json,.json"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						// Same file twice in a row must still fire change
						e.target.value = "";
						void onImportFileChosen(file);
					}}
				/>
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
						if (!requireOnline()) return;
						setDeleteError(null);
						setDeleteVisible(true);
					}}
				>
					Delete Account & Data
				</button>
			</section>

			<div className={styles.credit}>
				<PoweredByTmdb />
				{/* The very bottom, dim: which build this is (support / bug reports) */}
				<p className={styles.version}>{APP_VERSION_LABEL}</p>
			</div>

			<ConfirmModal
				visible={logoutVisible}
				title="Until Next Time"
				image={<ModalArt src={LOGOUT_ART} />}
				hint="You can sign back in any time — your watchlist and history stay saved."
				confirmLabel="Log Out"
				onConfirm={async () => {
					// Signing back in needs a connection (app parity)
					if (!requireOnline()) return;
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
				leadLabel="Export My Data First"
				leadColor="var(--primary)"
				onLead={() => {
					setDeleteVisible(false);
					setExportSheetVisible(true);
				}}
				onClose={() => setDeleteVisible(false)}
			/>

			<ExportSheet
				visible={exportSheetVisible}
				onClose={() => setExportSheetVisible(false)}
				onExport={runExport}
			/>

			<ConfirmModal
				visible={!!importFile}
				title="Is That Data?!"
				image={<ModalArt src={IMPORT_CONFIRM_ART} />}
				hint={
					importFile
						? `${importFile.summary}! I'm gonna eat it all! Don't worry — the stuff you already track stays exactly how it is. I won't eat anything twice! Heads up: you can't use the app while I'm eating.`
						: undefined
				}
				confirmLabel="Import"
				confirmColor="var(--primary)"
				onConfirm={runImport}
				onClose={() => setImportFile(null)}
			/>

			<ConfirmModal
				visible={!!importResult}
				title={importResult?.fed === false ? "Huh? That's It?" : "Shishishi! I'm Stuffed!"}
				image={
					<ModalArt src={importResult?.fed === false ? IMPORT_NOTHING_ART : IMPORT_DONE_ART} />
				}
				hint={importResult?.text}
				confirmLabel="Done"
				confirmColor="var(--primary)"
				hideCancel
				onConfirm={() => setImportResult(null)}
				onClose={() => setImportResult(null)}
			/>

			<ExportingModal
				visible={!!exporting}
				detail={exporting ? describeAccountExport(exporting) : undefined}
				onCancel={cancelExport}
			/>
			{importing && (
				<ImportingScreen
					title="Gobbling up data"
					hint="Om nom nom"
					loader={<PacmanLoader label="Gobbling up data" />}
					lines={[
						"This may take several minutes depending on how much is in your file.",
						"You'll be notified once the import is complete.",
					]}
					onCancel={cancelImport}
				/>
			)}

			<ConfirmModal
				visible={importCancelled}
				title="Okay! I Put It All Back!"
				image={<ModalArt src={IMPORT_CANCELLED_ART} />}
				hint="Import cancelled — nothing from that file was kept."
				confirmLabel="Done"
				confirmColor="var(--primary)"
				hideCancel
				onConfirm={() => setImportCancelled(false)}
				onClose={() => setImportCancelled(false)}
			/>
		</motion.div>
	);
}
