import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { colors } from "../../theme";
import { HomeTopTabParamList, Route } from "../../types";
import { useUiStore } from "../../stores";
import WatchlistTab from "./WatchlistTab";
import UpcomingTab from "./UpcomingTab";

const TopTab = createMaterialTopTabNavigator<HomeTopTabParamList>();

export default function HomeScreen() {
	const watchlistLoading = useUiStore((s) => s.watchlistLoading);
	const { top } = useSafeAreaInsets();

	return (
		<TopTab.Navigator
			screenOptions={{
				lazy: true,
				tabBarStyle: { backgroundColor: colors.background, paddingTop: top },
				tabBarActiveTintColor: colors.primary,
				tabBarInactiveTintColor: colors.textSecondary,
				tabBarIndicatorStyle: { backgroundColor: colors.primary },
				tabBarLabelStyle: {
					fontWeight: "700",
					fontSize: 16,
					textTransform: "uppercase",
					letterSpacing: 1,
				},
				swipeEnabled: !watchlistLoading,
			}}
		>
			<TopTab.Screen
				name={Route.WATCHLIST}
				component={WatchlistTab}
				options={{ tabBarLabel: "Watch List" }}
			/>
			<TopTab.Screen name={Route.UPCOMING} component={UpcomingTab} />
		</TopTab.Navigator>
	);
}
