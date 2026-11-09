import { useCallback, useRef, useState } from "react";
import { View, Text, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { getMessaging, requestPermission } from "@react-native-firebase/messaging";
import { File } from "expo-file-system";
import { ACCOUNT_IMPORT_MAX_BYTES } from "../../enums";
import { useAuthStore } from "../../stores/authStore";
import LoadingSpinner from "../../components/LoadingSpinner";
import { colors } from "../../theme";
import { ConfirmModal } from "../../components/modals";
import {
	IMPORT_WARNING_ART,
	IMPORT_WARNING_RATIO,
	ModalArt,
} from "../../components/modals/ModalArt";
import { importStyles as styles } from "./styles";
import PickPhase from "./PickPhase";
import { useImportData } from "./useImportData";
import ProgressPhase from "./ProgressPhase";
import DisambiguatePhase from "./DisambiguatePhase";
import ImportingScreen from "../../components/ImportingScreen";
import ReviewPhase from "./ReviewPhase";

/** The heads-up before an import starts: the app is held until it's done */
const IMPORT_BLOCKS_TITLE = "Before You Import";
const IMPORT_BLOCKS_HINT =
	"You won't be able to use the app while the import runs — it can take a few minutes for big libraries. We'll let you know when it's done.";

/** `onboarding`: shown on first launch (App.tsx) — it offers Skip; from Settings it doesn't */
export default function ImportDataScreen({ navigation, onboarding = false }: any) {
	const insets = useSafeAreaInsets();
	const {
		phase,
		setPhase,
		progress,
		statusText,
		parsedRef,
		matched,
		ambiguous,
		unmatchedNames,
		disambigIndex,
		setDisambigIndex,
		selected,
		existingIdsRef,
		disambigCandidates,
		loadingMore,
		tmdbApiKey,
		processFile,
		loadMoreCandidates,
		handleDisambiguate,
		handleSkipDisambig,
		handleBackDisambig,
		toggleSelected,
		handleImport,
		restoreAccount,
	} = useImportData(() => {
		const uid = useAuthStore.getState().user?.uid;
		if (uid) useAuthStore.getState().markImportDone(uid);
	});

	// Any import (TV Time file, re-sync, a backup) holds the app until it's done: say so first
	const pendingImport = useRef<(() => void) | null>(null);
	const [warningVisible, setWarningVisible] = useState(false);
	const confirmImport = useCallback((start: () => void) => {
		pendingImport.current = start;
		setWarningVisible(true);
	}, []);
	const closeWarning = useCallback(() => {
		pendingImport.current = null;
		setWarningVisible(false);
	}, []);
	const startImport = useCallback(() => {
		const start = pendingImport.current;
		closeWarning();
		start?.();
	}, [closeWarning]);
	const warningModal = (
		<ConfirmModal
			visible={warningVisible}
			title={IMPORT_BLOCKS_TITLE}
			image={<ModalArt source={IMPORT_WARNING_ART} ratio={IMPORT_WARNING_RATIO} />}
			hint={IMPORT_BLOCKS_HINT}
			confirmLabel="Import"
			confirmColor={colors.primary}
			onConfirm={startImport}
			onClose={closeWarning}
		/>
	);

	// --- Phase 1: Pick file --- a TV Time GDPR export (.zip) goes through matching; a Watchloom
	// backup (.json) is restored directly, no matching step
	const handlePick = useCallback(async () => {
		const result = await DocumentPicker.getDocumentAsync({
			// Shared files arrive under many types depending on the app they came through
			type: [
				"application/zip",
				"application/json",
				"text/plain",
				"application/octet-stream",
				"*/*",
			],
			copyToCacheDirectory: true,
		});
		const asset = result.canceled ? undefined : result.assets?.[0];
		if (!asset) return;
		const isZip =
			asset.name?.toLowerCase().endsWith(".zip") || asset.mimeType?.includes("zip") === true;
		if (!isZip && asset.size && asset.size > ACCOUNT_IMPORT_MAX_BYTES) {
			Alert.alert("Import Error", "That file is too big to import.");
			return;
		}
		let backup: string | null = null;
		if (!isZip) {
			try {
				backup = await new File(asset.uri).text();
			} catch {
				Alert.alert("Import Error", "Couldn't read that file.");
				return;
			}
		}
		// Notification permission upfront (the import completion notification)
		try {
			await requestPermission(getMessaging());
		} catch {}
		if (isZip) await processFile(asset.uri);
		else confirmImport(() => restoreAccount(backup!));
	}, [processFile, restoreAccount, confirmImport]);

	// --- Render ---
	const insetTop = insets.top;

	if (phase === "pick") {
		return (
			<>
				<PickPhase
					insetTop={insetTop}
					onPick={handlePick}
					onSkip={
						onboarding ? () => navigation.goBack?.() || navigation.navigate?.("Main") : undefined
					}
				/>
				{warningModal}
			</>
		);
	}

	if (phase === "matching") {
		return <ProgressPhase insetTop={insetTop} statusText={statusText} progress={progress} />;
	}

	if (phase === "importing") {
		return (
			<ImportingScreen
				title="Importing from TV Time"
				loader={<LoadingSpinner />}
				lines={[
					"This may take several minutes depending on how many shows you have. You can leave the app now.",
					"You'll be notified once the import is complete.",
				]}
			/>
		);
	}

	if (phase === "disambiguate") {
		return (
			<DisambiguatePhase
				insetTop={insetTop}
				current={ambiguous[disambigIndex]}
				disambigIndex={disambigIndex}
				totalAmbiguous={ambiguous.length}
				candidates={disambigCandidates}
				loadingMore={loadingMore}
				apiKey={tmdbApiKey!}
				onSelect={handleDisambiguate}
				onSkip={handleSkipDisambig}
				onBack={handleBackDisambig}
				onLoadMore={loadMoreCandidates}
			/>
		);
	}

	if (phase === "review" && parsedRef.current) {
		return (
			<>
				<ReviewPhase
					insetTop={insetTop}
					matched={matched}
					selected={selected}
					existingIds={existingIdsRef.current}
					unmatchedNames={unmatchedNames}
					parsed={parsedRef.current}
					onToggle={toggleSelected}
					onImport={() => confirmImport(handleImport)}
					onBack={() => {
						if (ambiguous.length > 0) {
							setDisambigIndex(ambiguous.length - 1);
							setPhase("disambiguate");
						} else {
							setPhase("pick");
						}
					}}
				/>
				{warningModal}
			</>
		);
	}

	return null;
}
