import React, { useEffect, useRef } from "react";
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

// A custom tabBar emits no `tabPress`, so screens that want to know a tab *button* was pressed
// (as opposed to the tab being reached by swiping) subscribe here instead
const tabPressListeners = new Set<(route: string) => void>();

/** Run `handler` whenever a bottom tab button is pressed */
export function useTabPress(handler: (route: string) => void) {
	const latest = useRef(handler);
	latest.current = handler;
	useEffect(() => {
		const fn = (route: string) => latest.current(route);
		tabPressListeners.add(fn);
		return () => {
			tabPressListeners.delete(fn);
		};
	}, []);
}

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
			<View style={[styles.bar, { left: activeIndex * TAB_WIDTH }]} />
			{TABS.map((tab) => {
				const isActive = tab.route === activeTab;
				return (
					<TouchableOpacity
						key={tab.route}
						style={styles.tab}
						onPress={() => {
							tabPressListeners.forEach((fn) => fn(tab.route));
							navigation.navigate(
								Route.SWIPE_TABS,
								tab.route === Route.HOME
									? {
											screen: Route.HOME,
											params: { screen: Route.HOME_TABS, params: { screen: Route.WATCHLIST } },
										}
									: { screen: tab.route },
							);
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
