import { useCallback } from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { getMessaging, requestPermission } from "@react-native-firebase/messaging";
import { useAuthStore } from "../../stores/authStore";
import LoadingSpinner from "../../components/LoadingSpinner";
import { spacing } from "../../theme";
import { importStyles as styles } from "./styles";
import PickPhase from "./PickPhase";
import { useImportData } from "./useImportData";
import ProgressPhase from "./ProgressPhase";
import DisambiguatePhase from "./DisambiguatePhase";
import ReviewPhase from "./ReviewPhase";

export default function ImportDataScreen({ navigation }: any) {
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
	} = useImportData(() => useAuthStore.setState({ hasCompletedImport: true }));

	// --- Phase 1: Pick file ---
	const handlePickFile = useCallback(async () => {
		const result = await DocumentPicker.getDocumentAsync({
			type: "application/zip",
			copyToCacheDirectory: true,
		});
		if (result.canceled || !result.assets?.[0]) return;

		// Request notification permission upfront (needed for import completion notification)
		try {
			await requestPermission(getMessaging());
		} catch {}

		await processFile(result.assets[0].uri);
	}, [processFile]);

	// --- Render ---
	const insetTop = insets.top;

	if (phase === "pick") {
		return (
			<PickPhase
				insetTop={insetTop}
				onPickFile={handlePickFile}
				onSkip={() => navigation.goBack?.() || navigation.navigate?.("Main")}
			/>
		);
	}

	if (phase === "matching") {
		return <ProgressPhase insetTop={insetTop} statusText={statusText} progress={progress} />;
	}

	if (phase === "importing") {
		return (
			<View style={[styles.centered, { paddingTop: insetTop }]}>
				<Text style={styles.title}>Importing from TV Time</Text>
				<View style={{ marginTop: spacing.md }}>
					<LoadingSpinner />
				</View>
				<Text style={[styles.desc, { marginTop: spacing.xl }]}>
					This may take several minutes depending on how many shows you have. You can leave the app
					now.
				</Text>
				<Text style={[styles.desc, { marginTop: spacing.sm }]}>
					You'll be notified once the import is complete.
				</Text>
			</View>
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
			<ReviewPhase
				insetTop={insetTop}
				matched={matched}
				selected={selected}
				existingIds={existingIdsRef.current}
				unmatchedNames={unmatchedNames}
				parsed={parsedRef.current}
				onToggle={toggleSelected}
				onImport={handleImport}
				onBack={() => {
					if (ambiguous.length > 0) {
						setDisambigIndex(ambiguous.length - 1);
						setPhase("disambiguate");
					} else {
						setPhase("pick");
					}
				}}
			/>
		);
	}

	return null;
}
