import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../../stores";
import { searchSuggestions } from "../../services";
import { colors, spacing, typography } from "../../theme";
import { SearchStackParamList, Route } from "../../types";

type NavProp = NativeStackNavigationProp<SearchStackParamList, Route.SEARCH_INPUT>;
type RoutePropType = RouteProp<SearchStackParamList, Route.SEARCH_INPUT>;

const HISTORY_KEY = "search_history";
const MAX_BYTES = 10240;

export default function SearchInputScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NavProp>();
	const route = useRoute<RoutePropType>();
	const inputRef = useRef<TextInput>(null);
	const [query, setQuery] = useState(route.params?.currentQuery || "");
	const [searchHistory, setSearchHistory] = useState<string[]>([]);
	const [tmdbSuggestions, setTmdbSuggestions] = useState<string[]>([]);
	const apiKey = useAuthStore((s) => s.appTmdbApiKey);

	useEffect(() => {
		AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
			if (raw) setSearchHistory(JSON.parse(raw));
		});
	}, []);

	useEffect(() => {
		setTimeout(() => inputRef.current?.focus(), 100);
	}, []);

	// Hide tab bar on search input screen
	useEffect(() => {
		const parent = navigation.getParent();
		parent?.setOptions({ tabBarStyle: { display: "none" as const } });
	}, [navigation]);

	// Debounced TMDB suggestions
	useEffect(() => {
		const trimmed = query.trim();
		if (trimmed.length < 2 || !apiKey) {
			setTmdbSuggestions([]);
			return;
		}
		const timer = setTimeout(() => {
			searchSuggestions(apiKey, trimmed)
				.then(setTmdbSuggestions)
				.catch(() => setTmdbSuggestions([]));
		}, 200);
		return () => clearTimeout(timer);
	}, [query, apiKey]);

	const addToHistory = useCallback((term: string) => {
		const trimmed = term.trim().toLowerCase();
		if (!trimmed || trimmed.length < 2) return;
		setSearchHistory((prev) => {
			const filtered = prev.filter((h) => h.toLowerCase() !== trimmed);
			const next = [trimmed, ...filtered];
			while (JSON.stringify(next).length > MAX_BYTES && next.length > 1) {
				next.pop();
			}
			AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
			return next;
		});
	}, []);

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

	const handleClearHistory = useCallback(() => {
		setSearchHistory([]);
		AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
	}, []);

	const filteredHistory =
		query.length > 0
			? searchHistory.filter((h) => h.toLowerCase().includes(query.toLowerCase()))
			: searchHistory;

	// Build suggestion items: typed query + TMDB suggestions (deduped against history)
	const hasSuggestions = query.trim().length > 0;
	const suggestionItems = hasSuggestions
		? [
				query.trim(),
				...tmdbSuggestions.filter(
					(s) =>
						s.toLowerCase() !== query.trim().toLowerCase() &&
						!filteredHistory.some((h) => h.toLowerCase() === s.toLowerCase()),
				),
			]
		: [];

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
					<Ionicons name="chevron-back" size={26} color={colors.text} />
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
								<TouchableOpacity onPress={handleClearHistory}>
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
	searchBarRow: {
		flexDirection: "row",
		alignItems: "stretch",
		marginHorizontal: spacing.md,
		marginVertical: spacing.md,
	},
	backButton: {
		width: 44,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.surfaceLight,
		borderTopLeftRadius: 8,
		borderBottomLeftRadius: 8,
	},
	searchRow: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surface,
		borderTopRightRadius: 8,
		borderBottomRightRadius: 8,
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
