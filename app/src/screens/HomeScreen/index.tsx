import React from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { colors } from "../../theme";
import { HomeTopTabParamList, Route } from "../../types";
import { useUiStore } from "../../stores";
import WatchlistTab from "./WatchlistTab";
import UpcomingTab from "./UpcomingTab";

const TopTab = createMaterialTopTabNavigator<HomeTopTabParamList>();

export default function HomeScreen() {
	const watchlistLoading = useUiStore((s) => s.watchlistLoading);

	return (
		<TopTab.Navigator
			screenOptions={{
				lazy: true,
				tabBarStyle: { backgroundColor: colors.surface },
				tabBarActiveTintColor: colors.primary,
				tabBarInactiveTintColor: colors.textSecondary,
				tabBarIndicatorStyle: { backgroundColor: colors.primary },
				tabBarLabelStyle: { fontWeight: "600", fontSize: 14 },
				swipeEnabled: !watchlistLoading,
			}}
		>
			<TopTab.Screen name={Route.WATCHLIST} component={WatchlistTab} />
			<TopTab.Screen name={Route.UPCOMING} component={UpcomingTab} />
		</TopTab.Navigator>
	);
}
