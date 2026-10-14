import React, { useEffect } from "react";
import { View, StyleSheet, Text, Animated } from "react-native";
import {
	getFocusedRouteNameFromRoute,
	useNavigation,
	useIsFocused,
} from "@react-navigation/native";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSharedShimmer } from "../components/SkeletonLine";
import { SwipeTabParamList, Route } from "../types";
import { colors, spacing } from "../theme";
import CalendarStackScreen from "./CalendarStackScreen";
import SearchStackScreen from "./SearchStackScreen";
import ProfileStackScreen from "./ProfileStackScreen";
import CustomTabBar from "./CustomTabBar";

const SwipeTab = createMaterialTopTabNavigator<SwipeTabParamList>();

const DETAIL_ROUTES = new Set([
	Route.SHOW_DETAIL,
	Route.SEASON_DETAIL,
	Route.SEARCH_INPUT,
	Route.SEARCH_RESULTS,
	Route.SETTINGS,
	Route.IMPORT_DATA,
]);

// Dummy screen — looks like Home, navigates back when focused
function HomeDummy() {
	const navigation = useNavigation<any>();
	const isFocused = useIsFocused();
	const { top } = useSafeAreaInsets();
	const shimmer = useSharedShimmer();

	useEffect(() => {
		if (!isFocused) return;
		try {
			if (navigation.canGoBack()) {
				navigation.goBack();
			} else {
				navigation.getParent()?.goBack();
			}
		} catch {}
	}, [isFocused, navigation]);

	return (
		<View style={dummyStyles.container}>
			{/* Fake top tabs */}
			<View style={[dummyStyles.tabBar, { paddingTop: top }]}>
				<View style={dummyStyles.tabActive}>
					<Text style={dummyStyles.tabTextActive}>WATCH LIST</Text>
					<View style={dummyStyles.indicator} />
				</View>
				<View style={dummyStyles.tab}>
					<Text style={dummyStyles.tabText}>UPCOMING</Text>
				</View>
			</View>
			{/* Half-visible card with pill overlapping its bottom half */}
			<Animated.View
				style={[dummyStyles.skeletonCard, dummyStyles.skeletonHalf, { opacity: shimmer }]}
			/>
			<View style={dummyStyles.overlapPillRow}>
				<View style={dummyStyles.pill}>
					<Text style={dummyStyles.pillText}>PREVIOUSLY WATCHED</Text>
				</View>
			</View>
			{/* What's Up Next pill */}
			<View style={dummyStyles.pillRow}>
				<View style={dummyStyles.pill}>
					<Text style={dummyStyles.pillText}>WHAT'S UP NEXT</Text>
				</View>
			</View>
			{/* Skeleton cards */}
			{Array.from({ length: 9 }, (_, i) => (
				<Animated.View key={i} style={[dummyStyles.skeletonCard, { opacity: shimmer }]} />
			))}
		</View>
	);
}

const dummyStyles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.surface,
	},
	tabBar: {
		flexDirection: "row",
		backgroundColor: colors.background,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 14,
	},
	tabActive: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 14,
	},
	tabTextActive: {
		fontWeight: "700",
		fontSize: 16,
		color: colors.primary,
		letterSpacing: 1,
	},
	tabText: {
		fontWeight: "700",
		fontSize: 16,
		color: colors.textSecondary,
		letterSpacing: 1,
	},
	indicator: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 2,
		backgroundColor: colors.primary,
	},
	pillRow: {
		alignItems: "center",
		paddingVertical: spacing.sm,
	},
	pill: {
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.xs,
		borderRadius: 16,
	},
	pillText: {
		fontWeight: "700",
		fontSize: 12,
		color: colors.text,
		letterSpacing: 1,
	},
	overlapPillRow: {
		alignItems: "center",
		marginTop: -14,
		zIndex: 1,
		paddingBottom: spacing.xs,
	},
	skeletonHalf: {
		height: 24,
		marginTop: 0,
	},
	skeletonCard: {
		backgroundColor: colors.background,
		borderRadius: 8,
		marginHorizontal: spacing.md,
		marginTop: spacing.sm,
		height: 100,
	},
});

export default function SwipeTabsScreen() {
	return (
		<SwipeTab.Navigator
			initialRouteName={Route.CALENDAR}
			tabBarPosition="bottom"
			tabBar={({ state }) => {
				const activeRoute = state.routes[state.index];
				const childRoute = getFocusedRouteNameFromRoute(activeRoute);
				if (childRoute && DETAIL_ROUTES.has(childRoute as Route)) return null;

				// Show Home as active when on dummy tab (during swipe transition)
				const tabName = activeRoute.name === Route.HOME ? Route.HOME : activeRoute.name;
				return <CustomTabBar activeTab={tabName} />;
			}}
			screenOptions={({ route }) => {
				const childRoute = getFocusedRouteNameFromRoute(route);
				const onDetail = childRoute != null && DETAIL_ROUTES.has(childRoute as Route);
				return {
					lazy: true,
					swipeEnabled: !onDetail,
				};
			}}
		>
			<SwipeTab.Screen name={Route.HOME} component={HomeDummy} options={{ lazy: false }} />
			<SwipeTab.Screen name={Route.CALENDAR} component={CalendarStackScreen} />
			<SwipeTab.Screen name={Route.SEARCH} component={SearchStackScreen} />
			<SwipeTab.Screen name={Route.PROFILE} component={ProfileStackScreen} />
		</SwipeTab.Navigator>
	);
}
