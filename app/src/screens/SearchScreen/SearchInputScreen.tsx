import React, { useCallback, useEffect, useRef } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	ScrollView,
	Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearchInput } from "./useSearchInput";
import { colors, spacing, typography } from "../../theme";
import { SearchStackParamList, Route } from "../../types";

type NavProp = NativeStackNavigationProp<SearchStackParamList, Route.SEARCH_INPUT>;
type RoutePropType = RouteProp<SearchStackParamList, Route.SEARCH_INPUT>;

export default function SearchInputScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NavProp>();
	const route = useRoute<RoutePropType>();
	const inputRef = useRef<TextInput>(null);
	const { query, setQuery, addToHistory, clearHistory, filteredHistory, suggestionItems } =
		useSearchInput(route.params?.currentQuery || "");

	useEffect(() => {
		setTimeout(() => inputRef.current?.focus(), 100);
	}, []);

	useEffect(() => {
		const parent = navigation.getParent();
		parent?.setOptions({ tabBarStyle: { display: "none" as const } });
	}, [navigation]);

	const submitSearch = useCallback(
		(term: string) => {
			const trimmed = term.trim();
			if (!trimmed) return;
			Keyboard.dismiss();
			addToHistory(trimmed);
			navigation.replace(Route.SEARCH_RESULTS, { query: trimmed });
		},
		[navigation, addToHistory],
	);

	return (
		<View style={[styles.container, { paddingTop: top }]}>
			<View style={styles.searchBarRow}>
				<TouchableOpacity
					style={styles.backButton}
					onPress={() => {
						Keyboard.dismiss();
						navigation.navigate(Route.SEARCH_MAIN);
					}}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="chevron-back-circle-outline" size={30} color={colors.text} />
				</TouchableOpacity>
				<View style={styles.searchRow}>
					<TextInput
						ref={inputRef}
						style={styles.searchInput}
						placeholder="Search Shows & Movies..."
						placeholderTextColor={colors.textMuted}
						value={query}
						onChangeText={setQuery}
						onSubmitEditing={() => submitSearch(query)}
						autoCapitalize="none"
						autoCorrect={false}
						returnKeyType="search"
					/>
					{query.length > 0 && (
						<TouchableOpacity
							style={styles.clearButton}
							onPress={() => setQuery("")}
							hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
						>
							<Text style={styles.clearButtonText}>✕</Text>
						</TouchableOpacity>
					)}
				</View>
			</View>

			<ScrollView keyboardShouldPersistTaps="handled" style={styles.scrollArea}>
				{suggestionItems.length > 0 && (
					<View style={styles.section}>
						{suggestionItems.map((term, idx) => (
							<TouchableOpacity
								key={`sug_${term}_${idx}`}
								style={styles.listItem}
								onPress={() => submitSearch(term)}
							>
								<Text style={styles.listIcon}>{idx === 0 ? "🔍" : "→"}</Text>
								<Text style={styles.listText} numberOfLines={1}>
									{term}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				)}

				{filteredHistory.length > 0 && (
					<View style={styles.section}>
						<View style={styles.sectionHeader}>
							<Text style={styles.sectionTitle}>Recent</Text>
							{query.length === 0 && (
								<TouchableOpacity onPress={clearHistory}>
									<Text style={styles.clearAllText}>Clear All</Text>
								</TouchableOpacity>
							)}
						</View>
						{filteredHistory.map((term, idx) => (
							<TouchableOpacity
								key={`hist_${term}_${idx}`}
								style={styles.listItem}
								onPress={() => submitSearch(term)}
							>
								<Text style={styles.listIcon}>↻</Text>
								<Text style={styles.listText} numberOfLines={1}>
									{term}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	// One surface, like the results bar: outlined back icon, no highlighted box
	searchBarRow: {
		flexDirection: "row",
		alignItems: "stretch",
		marginHorizontal: spacing.md,
		marginVertical: spacing.md,
		backgroundColor: colors.surface,
		borderRadius: 8,
	},
	// Left inset only — the input's own padding is the gap to the text
	backButton: {
		paddingLeft: spacing.md,
		justifyContent: "center",
	},
	searchRow: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	searchIcon: {
		marginLeft: spacing.md,
	},
	searchInput: {
		...typography.body,
		flex: 1,
		color: colors.text,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
	clearButton: {
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	clearButtonText: {
		color: colors.textMuted,
		fontSize: 16,
		fontWeight: "600",
	},
	scrollArea: {
		flex: 1,
	},
	section: {
		marginHorizontal: spacing.lg,
		marginBottom: spacing.md,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: spacing.sm,
	},
	sectionTitle: {
		...typography.subtitle,
	},
	clearAllText: {
		...typography.caption,
		color: colors.primary,
	},
	listItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	listIcon: {
		color: colors.textMuted,
		fontSize: 14,
		marginRight: spacing.sm,
	},
	listText: {
		...typography.body,
		color: colors.text,
		flex: 1,
	},
});
