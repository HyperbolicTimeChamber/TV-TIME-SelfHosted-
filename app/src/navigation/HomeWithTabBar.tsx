import React from "react";
import { View, StyleSheet } from "react-native";
import { useNavigationState } from "@react-navigation/native";
import { colors } from "../theme";
import { Route } from "../types";
import HomeStackScreen from "./HomeStackScreen";
import CustomTabBar from "./CustomTabBar";

export default function HomeWithTabBar() {
	// Get the focused route name inside the Home stack
	const childRoute = useNavigationState((state) => {
		const homeRoute = state.routes[state.index];
		const nestedState = homeRoute.state;
		if (!nestedState) return undefined;
		return nestedState.routes[nestedState.index ?? 0]?.name;
	});

	const hideTabBar =
		childRoute === Route.SHOW_DETAIL ||
		childRoute === Route.SEASON_DETAIL;

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
