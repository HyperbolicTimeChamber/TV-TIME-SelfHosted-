import React, { useState, useCallback, useRef } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	Alert,
	ActivityIndicator,
	Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { getCrashlytics, recordError } from "@react-native-firebase/crashlytics";
import { getAuth, sendPasswordResetEmail } from "@react-native-firebase/auth";
import { useAuthStore } from "../../stores";
import { foregroundCall } from "../../services/callQueue";
import { colors, spacing, typography, themedStyles } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ConfirmModal } from "../../components";
import { ExportingModal, ExportSheet } from "../../components/modals";
import PoweredByTmdb from "../../components/PoweredByTmdb";
import { APP_VERSION_LABEL } from "../../utils/appVersion";
import PacmanLoader from "../../components/PacmanLoader";
import ImportingScreen from "../../components/ImportingScreen";
import {
	FAREWELL_ART,
	FAREWELL_RATIO,
	IMPORT_CONFIRM_ART,
	IMPORT_CONFIRM_RATIO,
	IMPORT_DONE_ART,
	IMPORT_DONE_RATIO,
	IMPORT_NOTHING_ART,
	IMPORT_NOTHING_RATIO,
	IMPORT_CANCELLED_ART,
	IMPORT_CANCELLED_RATIO,
	LOGOUT_ART,
	LOGOUT_RATIO,
	ModalArt,
} from "../../components/modals/ModalArt";
import {
	cancelAccountJob,
	fetchAccountExport,
	importAccountTitles,
	shareAccountExport,
	type AccountImportResult,
} from "../../services/accountExport";
import { pickJsonFile } from "../../services/customListsFiles";
import { CloudFunction, ProfileStackParamList, Route } from "../../types";
import { ACCOUNT_IMPORT_MAX_BYTES, ReleaseChannel, UPDATE_CHANNEL } from "../../enums";
import { INSTALLED_BUILD, UPDATES_SUPPORTED } from "../../services/appUpdate";
import { showUpdateNotification } from "../../services/updateNotifications";
import { offeredRelease, useUpdateStore } from "../../stores/updateStore";
import {
	describeAccountExport,
	describeAccountImport,
	parseAccountExport,
	type AccountExportOptions,
	type RestoreMatch,
} from "../../utils/accountExport";
import type { ImportedList } from "../../utils/customListsIO";
import { describeImport } from "../../utils/customListsIO";
import { useCustomLists } from "../../hooks/useCustomLists";
import { trackedIdsQuery } from "../../hooks/useTrackedIds";
import { emitShowRemoved } from "../../utils";
import { useQueryClient } from "@tanstack/react-query";
import { requireOnline } from "../../utils/requireOnline";

/** Why a picked import file can't be read */
const IMPORT_FILE_ERRORS = {
	invalid: "That isn't a Watchloom data export.",
	newer: "This file comes from a newer version of the app. Update the app and try again.",
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

/** The exporting popup's way out before the share sheet opens */
const MODAL_GONE_MS = 300;

/** A random id the running export is known by, so Cancel can stop it server-side */
const newJobId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function SettingsScreen() {
	const { top, bottom } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	const hasCompletedImport = useAuthStore((s) => s.hasCompletedImport);
	const user = useAuthStore((s) => s.user);
	const signOut = useAuthStore((s) => s.signOut);
	const [testingFCM, setTestingFCM] = useState(false);
	const [deletingAccount, setDeletingAccount] = useState(false);
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
	// The running import's job id (Cancel takes it back by it), and Cancel pressed
	const importJob = useRef<string | null>(null);
	const cancelledJob = useRef<string | null>(null);
	const [importCancelled, setImportCancelled] = useState(false);
	// The result popup: its line(s), and whether anything new came in (its title)
	const [importResult, setImportResult] = useState<{ text: string; fed: boolean } | null>(null);
	const { planImport, applyImport } = useCustomLists(user?.uid);
	const queryClient = useQueryClient();

	const isEmailUser = user?.providerData?.some((p) => p.providerId === "password") ?? false;

	const handleChangePassword = useCallback(async () => {
		const email = user?.email;
		if (!email || !requireOnline()) return;
		try {
			await sendPasswordResetEmail(getAuth(), email);
			Alert.alert("Reset Email Sent", "Check your inbox for a password reset link.");
		} catch {
			Alert.alert("Error", "Failed to send reset email. Try again later.");
		}
	}, [user?.email]);

	const handleTestFCM = useCallback(async () => {
		if (testingFCM || !requireOnline()) return;
		setTestingFCM(true);
		try {
			const functions = getFunctions();
			await httpsCallable(functions, "testFCM")({});
			Alert.alert("Success", "Test notification sent!");
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to send test notification.");
		} finally {
			setTestingFCM(false);
		}
	}, [testingFCM]);

	const runExport = useCallback(async (options: AccountExportOptions) => {
		if (exportJob.current || !requireOnline()) return;
		const jobId = newJobId();
		exportJob.current = jobId;
		setExporting(options);
		let data: unknown;
		try {
			data = await fetchAccountExport(options, jobId);
		} catch (err: any) {
			if (exportJob.current !== jobId) return;
			exportJob.current = null;
			setExporting(null);
			Alert.alert("Export failed", err.message || "Couldn't export your data. Try again later.");
			return;
		}
		// Cancelled meanwhile: the result is dropped
		if (exportJob.current !== jobId) return;
		exportJob.current = null;
		// The modal covers the fetch only — the share sheet is the user's turn. It opens once the
		// modal has gone (opened at once, the fading popup showed behind it)
		setExporting(null);
		await new Promise((resolve) => setTimeout(resolve, MODAL_GONE_MS));
		try {
			await shareAccountExport(data, options);
		} catch (err: any) {
			Alert.alert("Export failed", err.message || "Couldn't share your data. Try again later.");
		}
	}, []);

	const cancelExport = useCallback(() => {
		const jobId = exportJob.current;
		if (!jobId) return;
		exportJob.current = null;
		setExporting(null);
		cancelAccountJob(jobId);
	}, []);

	const pickImportFile = useCallback(async () => {
		if (!requireOnline()) return;
		const picked = await pickJsonFile(ACCOUNT_IMPORT_MAX_BYTES);
		if (!picked.ok) {
			if (picked.reason !== "canceled")
				Alert.alert("Import failed", IMPORT_FILE_ERRORS[picked.reason]);
			return;
		}
		const parsed = parseAccountExport(picked.text);
		if (!parsed.ok) {
			Alert.alert("Import failed", IMPORT_FILE_ERRORS[parsed.reason]);
			return;
		}
		setImportFile({
			matches: parsed.matches,
			lists: parsed.lists,
			summary: describeAccountImport(parsed.matches, parsed.lists),
		});
	}, []);

	const runImport = useCallback(async () => {
		const file = importFile;
		if (!file || !user || !requireOnline()) return;
		setImportFile(null);
		setImporting(true);
		const jobId = newJobId();
		importJob.current = jobId;
		// What was tracked before (cached for the session — no read when Search / Calendar loaded
		// it): a cancel drops the file's other titles from view at once
		const before = await queryClient
			.ensureQueryData(trackedIdsQuery(user.uid))
			.catch(() => new Set<number>());
		newTitles.current = file.matches.map((m) => m.tmdbId).filter((id) => !before.has(id));
		const lines: string[] = [];
		let fed = false;
		try {
			if (file.matches.length > 0) {
				const result: AccountImportResult = await importAccountTitles(
					user.uid,
					file.matches,
					jobId,
				);
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
		} catch (err: any) {
			// Cancelled: the server stopped it and took it back — not a failure
			if (cancelledJob.current === jobId) return;
			recordError(
				getCrashlytics(),
				err instanceof Error ? err : new Error(String(err?.message ?? err)),
				"AccountImportError",
			);
			Alert.alert("Import failed", err.message || "Couldn't import that file. Try again later.");
		} finally {
			if (importJob.current === jobId) importJob.current = null;
			// Cancel already closed the import screen
			if (cancelledJob.current !== jobId) setImporting(false);
		}
	}, [importFile, user, planImport, applyImport, queryClient]);

	// Import → Cancel: done at once for the user — the popup goes, the file's new titles leave the
	// lists (optimistic). The server stops the import and takes back what it added in its own
	// time; delta sync carries the deletes to every device
	const newTitles = useRef<number[]>([]);
	const cancelImport = useCallback(() => {
		const jobId = importJob.current;
		if (!jobId) return;
		importJob.current = null;
		cancelledJob.current = jobId;
		cancelAccountJob(jobId);
		for (const id of newTitles.current) emitShowRemoved(id);
		setImporting(false);
		setImportCancelled(true);
	}, []);

	const [logoutVisible, setLogoutVisible] = useState(false);
	const [deleteVisible, setDeleteVisible] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const handleDeleteAccount = useCallback(async () => {
		if (!requireOnline()) return;
		setDeletingAccount(true);
		setDeleteError(null);
		try {
			const functions = getFunctions();
			// Returns once the auth user is gone; the data purge carries on server-side
			await foregroundCall(() => httpsCallable(functions, CloudFunction.DELETE_ACCOUNT)({}));
			await signOut();
		} catch (err: any) {
			recordError(
				getCrashlytics(),
				err instanceof Error ? err : new Error(String(err?.message ?? err)),
				"DeleteAccountError",
			);
			setDeleteError(err.message || "Failed to delete account.");
			setDeletingAccount(false);
		}
	}, [signOut]);

	return (
		// Swipe right from anywhere slides the page off, back to the profile
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView
				style={{ paddingTop: top }}
				// Fills the screen so the TMDB credit sits at the bottom (below the rows when they
				// run longer); the scroll view's top padding isn't part of its content height
				contentContainerStyle={[styles.content, { paddingBottom: top + bottom + spacing.lg }]}
			>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Settings</Text>
					<View style={styles.headerSpacer} />
				</View>
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Preferences</Text>
					<TouchableOpacity style={styles.row} onPress={() => navigation.navigate(Route.APPEARANCE)}>
						<Text style={styles.rowText}>Appearance</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.row}
						onPress={() => navigation.navigate(Route.NOTIFICATIONS)}
					>
						<Text style={styles.rowText}>Notifications</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Data</Text>
					<TouchableOpacity
						style={styles.row}
						onPress={() => navigation.navigate(Route.IMPORT_DATA)}
					>
						<Text style={styles.rowText}>
							{hasCompletedImport ? "Re-sync TV Time Data" : "Import TV Time Data"}
						</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.row}
						onPress={() => requireOnline() && setExportSheetVisible(true)}
						disabled={!!exporting}
					>
						<Text style={styles.rowText}>Export My Data</Text>
					</TouchableOpacity>
					<TouchableOpacity style={styles.row} onPress={pickImportFile} disabled={importing}>
						<Text style={styles.rowText}>Import Data</Text>
					</TouchableOpacity>
				</View>

				{__DEV__ && (
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>Debug</Text>
						<TouchableOpacity style={styles.row} onPress={handleTestFCM} disabled={testingFCM}>
							{testingFCM ? (
								<ActivityIndicator size="small" color={colors.accent} />
							) : (
								<Text style={styles.rowText}>Send Test Notification</Text>
							)}
						</TouchableOpacity>
					</View>
				)}

				{/* Staging / dev builds: the in-app update test flow (docs/testing/in-app-update.md) */}
				{UPDATES_SUPPORTED && UPDATE_CHANNEL === ReleaseChannel.DEV && <UpdateTestSection />}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Account</Text>
					{isEmailUser && (
						<TouchableOpacity style={styles.row} onPress={handleChangePassword}>
							<Text style={styles.rowText}>Change Password</Text>
						</TouchableOpacity>
					)}
					<TouchableOpacity style={styles.row} onPress={() => setLogoutVisible(true)}>
						<Text style={styles.deleteText}>Log Out</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={styles.row}
						onPress={() => {
							if (!requireOnline()) return;
							setDeleteError(null);
							setDeleteVisible(true);
						}}
					>
						<Text style={styles.deleteText}>Delete Account & Data</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.credit}>
					<PoweredByTmdb />
					{/* The very bottom, dim: which build this is (support / bug reports) */}
					<Text style={styles.version}>{APP_VERSION_LABEL}</Text>
				</View>

				<ConfirmModal
					visible={logoutVisible}
					title="Until Next Time"
					image={<ModalArt source={LOGOUT_ART} ratio={LOGOUT_RATIO} />}
					hint="You can sign back in any time — your watchlist and history stay saved."
					confirmLabel="Log Out"
					onConfirm={() => {
						// Signing back in needs a connection: offline it would lock the user out of
						// the cached app until they're online again
						if (!requireOnline()) return;
						setLogoutVisible(false);
						signOut();

					}}
					onClose={() => setLogoutVisible(false)}
				/>

				<ConfirmModal
					visible={deleteVisible}
					title="Is This Goodbye?"
					image={<ModalArt source={FAREWELL_ART} ratio={FAREWELL_RATIO} />}
					hint="This will permanently delete your account and all data. This cannot be undone. Want a copy first?"
					error={deleteError}
					confirmLabel="Delete"
					loading={deletingAccount}
					onConfirm={handleDeleteAccount}
					leadLabel="Export My Data First"
					leadColor={colors.primary}
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
					image={<ModalArt source={IMPORT_CONFIRM_ART} ratio={IMPORT_CONFIRM_RATIO} />}
					hint={
						importFile
							? `${importFile.summary}! I'm gonna eat it all! Don't worry — the stuff you already track stays exactly how it is. I won't eat anything twice! Heads up: you can't use the app while I'm eating.`
							: undefined
					}
					confirmLabel="Import"
					confirmColor={colors.primary}
					onConfirm={runImport}
					onClose={() => setImportFile(null)}
				/>

				<ConfirmModal
					visible={!!importResult}
					title={importResult?.fed === false ? "Huh? That's It?" : "Shishishi! I'm Stuffed!"}
					image={
						importResult?.fed === false ? (
							<ModalArt source={IMPORT_NOTHING_ART} ratio={IMPORT_NOTHING_RATIO} />
						) : (
							<ModalArt source={IMPORT_DONE_ART} ratio={IMPORT_DONE_RATIO} />
						)
					}
					hint={importResult?.text}
					confirmLabel="Done"
					confirmColor={colors.primary}
					hideCancel
					onConfirm={() => setImportResult(null)}
					onClose={() => setImportResult(null)}
				/>

				<ExportingModal
					visible={!!exporting}
					detail={exporting ? describeAccountExport(exporting) : undefined}
					onCancel={cancelExport}
				/>
				{/* Settings → Import Data: the import screen (as TV Time's), Pac-Man instead of the
				    spinner. A full-screen Modal over Settings — the app is held while it runs */}
				<Modal visible={importing} animationType="fade" onRequestClose={() => {}}>
					<ImportingScreen
						title="Gobbling up data"
						hint="Om nom nom"
						loader={<PacmanLoader background={colors.background} />}
						lines={[
							"This may take several minutes depending on how much is in your file.",
							"You'll be notified once the import is complete.",
						]}
						onCancel={cancelImport}
					/>
				</Modal>

				<ConfirmModal
					visible={importCancelled}
					title="Okay! I Put It All Back!"
					image={<ModalArt source={IMPORT_CANCELLED_ART} ratio={IMPORT_CANCELLED_RATIO} />}
					hint="Import cancelled — nothing from that file was kept."
					confirmLabel="Done"
					confirmColor={colors.primary}
					hideCancel
					onConfirm={() => setImportCancelled(false)}
					onClose={() => setImportCancelled(false)}
				/>
			</ScrollView>
		</SwipeBackView>
	);
}

/**
 * Update test flow: pretend the channel's latest build is newer than this one (optionally forced),
 * reset "Not now", or show the new-version notification — all against the real latest staging APK
 */
function UpdateTestSection() {
	const { release, simulation, simulate, clearSkip } = useUpdateStore();
	const offered = offeredRelease({ release, simulation });
	const row = (label: string, onPress: () => void, disabled = false) => (
		<TouchableOpacity style={styles.row} onPress={onPress} disabled={disabled}>
			<Text style={[styles.rowText, disabled && { opacity: 0.4 }]}>{label}</Text>
		</TouchableOpacity>
	);
	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>Updates (test)</Text>
			<Text style={styles.updateStatus}>
				{`Installed build ${INSTALLED_BUILD} · channel ${UPDATE_CHANNEL}: ${
					release ? `v${release.version} (${release.build})` : "no release yet"
				}${simulation ? ` · simulating${simulation.force ? " force" : ""}` : ""}`}
			</Text>
			{row("Simulate Update", () => simulate({ force: false }), !release)}
			{row("Simulate Force Update", () => simulate({ force: true }), !release)}
			{row("Stop Simulation", () => simulate(null), !simulation)}
			{row("Reset \"Not Now\"", clearSkip)}
			{row("Show Update Notification", () => offered && showUpdateNotification(offered), !offered)}
		</View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	content: { flexGrow: 1 },
	// Pushed to the bottom of the page by its auto top margin
	credit: { marginTop: "auto", paddingTop: spacing.xl },
	updateStatus: { ...typography.caption, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
	version: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.md },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	headerSpacer: { width: CIRCLE_BUTTON_SIZE },
	headerTitle: {
		...typography.title,
		flex: 1,
		textAlign: "center",
		fontSize: 18,
	},
	section: {
		marginTop: spacing.lg,
		marginHorizontal: spacing.lg,
		backgroundColor: colors.surface,
		borderRadius: 8,
		overflow: "hidden",
	},
	sectionTitle: {
		...typography.caption,
		color: colors.textMuted,
		paddingHorizontal: spacing.md,
		paddingTop: spacing.md,
		paddingBottom: spacing.xs,
	},
	row: {
		paddingVertical: spacing.lg,
		paddingHorizontal: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	rowText: {
		...typography.subtitle,
		fontSize: 15,
		color: colors.accent,
	},
	deleteText: {
		...typography.subtitle,
		fontSize: 15,
		color: colors.destructiveRed,
	},
}));
