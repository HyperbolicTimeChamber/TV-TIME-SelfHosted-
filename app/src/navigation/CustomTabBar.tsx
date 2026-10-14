import React from "react";
import { View, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme";
import { Route } from "../types";

const ACCENT = colors.primary;
const SCREEN_WIDTH = Dimensions.get("window").width;

const TABS: {
	route: string;
	icon: keyof typeof Ionicons.glyphMap;
	iconOutline: keyof typeof Ionicons.glyphMap;
}[] = [
	{ route: Route.HOME, icon: "home", iconOutline: "home-outline" },
	{ route: Route.CALENDAR, icon: "calendar", iconOutline: "calendar-outline" },
	{ route: Route.SEARCH, icon: "search", iconOutline: "search-outline" },
	{ route: Route.PROFILE, icon: "person", iconOutline: "person-outline" },
];

const TAB_WIDTH = SCREEN_WIDTH / TABS.length;
const BAR_WIDTH = TAB_WIDTH;
const BAR_HEIGHT = 3;

interface Props {
	activeTab: string;
}

export default function CustomTabBar({ activeTab }: Props) {
	const { bottom } = useSafeAreaInsets();
	const navigation = useNavigation<any>();
	const activeIndex = TABS.findIndex((t) => t.route === activeTab);

	return (
		<View style={[styles.container, { paddingBottom: bottom }]}>
			<View
				style={[
					styles.bar,
					{ left: activeIndex * TAB_WIDTH },
				]}
			/>
			{TABS.map((tab) => {
				const isActive = tab.route === activeTab;
				return (
					<TouchableOpacity
						key={tab.route}
						style={styles.tab}
						onPress={() => {
							if (tab.route === Route.HOME) {
								navigation.navigate(Route.HOME, {
									screen: Route.HOME_TABS,
									params: { screen: Route.WATCHLIST },
								});
							} else {
								navigation.navigate(Route.SWIPE_TABS, { screen: tab.route });
							}
						}}
						activeOpacity={0.7}
					>
						<Ionicons
							name={isActive ? tab.icon : tab.iconOutline}
							size={28}
							color={isActive ? ACCENT : colors.textMuted}
						/>
					</TouchableOpacity>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		backgroundColor: colors.background,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
	},
	bar: {
		position: "absolute",
		top: 0,
		width: BAR_WIDTH,
		height: BAR_HEIGHT,
		borderRadius: BAR_HEIGHT / 2,
		backgroundColor: ACCENT,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 14,
	},
});
