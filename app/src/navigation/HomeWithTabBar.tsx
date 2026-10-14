import React from "react";
import { View, StyleSheet } from "react-native";
import { getFocusedRouteNameFromRoute, useRoute } from "@react-navigation/native";
import { colors } from "../theme";
import { Route } from "../types";
import HomeStackScreen from "./HomeStackScreen";
import CustomTabBar from "./CustomTabBar";

export default function HomeWithTabBar() {
	// Focused screen inside the Home stack. Deep links hand over a partial state with
	// no index (the last route is focused) — reading index ?? 0 showed the tab bar
	// over linked show / not-found pages
	const childRoute = getFocusedRouteNameFromRoute(useRoute());

	const hideTabBar = childRoute === Route.SHOW_DETAIL || childRoute === Route.SEASON_DETAIL;

	return (
		<View style={styles.container}>
			<HomeStackScreen />
			{!hideTabBar && <CustomTabBar activeTab={Route.HOME} />}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
});
