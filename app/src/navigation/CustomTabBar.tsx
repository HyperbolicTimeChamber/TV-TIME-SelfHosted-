import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../theme";
import { Route } from "../types";

const TABS = [
	{ route: Route.HOME, icon: "home" as const },
	{ route: Route.CALENDAR, icon: "calendar" as const },
	{ route: Route.SEARCH, icon: "search" as const },
	{ route: Route.PROFILE, icon: "person" as const },
];

interface Props {
	activeTab: string;
}

export default function CustomTabBar({ activeTab }: Props) {
	const { bottom } = useSafeAreaInsets();
	const navigation = useNavigation<any>();

	return (
		<View style={[styles.container, { paddingBottom: bottom }]}>
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
							name={tab.icon}
							size={24}
							color={isActive ? colors.primary : colors.textMuted}
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
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 10,
	},
});
