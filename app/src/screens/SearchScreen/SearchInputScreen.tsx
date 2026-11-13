import React, { useCallback, useEffect, useRef } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
	ScrollView,
	Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearchInput } from "./useSearchInput";
import { colors, spacing, typography, themedStyles } from "../../theme";
import { SearchStackParamList, Route } from "../../types";
import { SEARCH_MAX_QUERY_LENGTH } from "../../enums";
import { IoIosCloseCircle } from "../../components/HiIcons";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CLEAR_ICON_SIZE } from "./styles";
import { requireOnline } from "../../utils/requireOnline";

type NavProp = NativeStackNavigationProp<SearchStackParamList, Route.SEARCH_INPUT>;
type RoutePropType = RouteProp<SearchStackParamList, Route.SEARCH_INPUT>;

/** Longest the search waits for the keyboard to finish hiding before it opens the results */
const KEYBOARD_HIDE_WAIT_MS = 400;

export default function SearchInputScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NavProp>();
	const route = useRoute<RoutePropType>();
	const inputRef = useRef<TextInput>(null);
	const {
		query,
		setQuery,
		addToHistory,
		clearHistory,
		filteredHistory,
		suggestionItems,
		loadingSuggestions,
	} = useSearchInput(route.params?.currentQuery || "");

	useEffect(() => {
		const t = setTimeout(() => inputRef.current?.focus(), 100);
		return () => clearTimeout(t);
	}, []);

	useEffect(() => {
		const parent = navigation.getParent();
		parent?.setOptions({ tabBarStyle: { display: "none" as const } });
	}, [navigation]);

	const submitSearch = useCallback(
		(term: string) => {
			const trimmed = term.trim();
			// Offline: stay on the box (no empty results page), popup from requireOnline
			if (!trimmed || !requireOnline()) return;

			addToHistory(trimmed);
			let went = false;
			const go = () => {
				if (went) return;
				went = true;
				// Takes the place of this page and of any results page it was opened from: only ever
				// one results page above Trending, so back from a second search goes to Trending
				navigation.dispatch((state) => {
					const routes = [
						...state.routes.slice(0, -1).filter((r) => r.name !== Route.SEARCH_RESULTS),
						{ name: Route.SEARCH_RESULTS, params: { query: trimmed } },
					];
					return CommonActions.reset({ ...state, index: routes.length - 1, routes });
				});
			};
			// Replacing the screen while the keyboard is still closing left it up over the results
			// (dismiss() lost to the screen swap): close it first, go once it has hidden
			inputRef.current?.blur();
			if (Keyboard.isVisible()) {
				const sub = Keyboard.addListener("keyboardDidHide", () => {
					sub.remove();
					go();
				});
				// Never strand the search if the hide event doesn't come
				setTimeout(() => {
					sub.remove();
					go();
				}, KEYBOARD_HIDE_WAIT_MS);
			}
			Keyboard.dismiss();
			if (!Keyboard.isVisible()) go();
		},
		[navigation, addToHistory],
	);

	// Back to the page it opened over: Trending, or the results as they were before any typing here
	const goBack = useCallback(() => {
		Keyboard.dismiss();
		navigation.goBack();
	}, [navigation]);
	const swipeBack = useSwipeBackPop(navigation);

	return (
		<SwipeBackView
			onBack={goBack}
			{...swipeBack}
			style={[styles.container, { paddingTop: top }]}
		>
			<View style={styles.searchBarRow}>
				<TouchableOpacity
					style={styles.backButton}
					onPress={goBack}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="chevron-back-circle-outline" size={30} color={colors.text} />
				</TouchableOpacity>
				<View style={styles.searchRow}>
					<TextInput
						ref={inputRef}
						style={styles.searchInput}
						placeholder="Search Shows & Movies..."
						maxLength={SEARCH_MAX_QUERY_LENGTH}
						placeholderTextColor={colors.textMuted}
						value={query}
						onChangeText={setQuery}
						onSubmitEditing={() => submitSearch(query)}
						autoCapitalize="none"
						autoCorrect={false}
						returnKeyType="search"
					/>
					{loadingSuggestions && (
						<ActivityIndicator
							size="small"
							color={colors.textMuted}
							accessibilityLabel="Loading suggestions"
						/>
					)}
					{query.length > 0 && (
						<TouchableOpacity
							style={styles.clearButton}
							onPress={() => setQuery("")}
							hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
						>
							<IoIosCloseCircle size={CLEAR_ICON_SIZE} color={colors.textMuted} />
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
		</SwipeBackView>
	);
}

const styles = themedStyles(() => StyleSheet.create({
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
}));
