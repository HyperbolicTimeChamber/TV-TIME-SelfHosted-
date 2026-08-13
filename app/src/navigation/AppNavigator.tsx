import React, { useRef } from "react";
import {
	NavigationContainer,
	NavigationContainerRef,
	getFocusedRouteNameFromRoute,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions } from "@react-navigation/native";
import { colors } from "../theme";
import { MainTabParamList, Route } from "../types";
import HomeStackScreen from "./HomeStackScreen";
import SearchStackScreen from "./SearchStackScreen";
import CalendarStackScreen from "./CalendarStackScreen";
import ProfileStackScreen from "./ProfileStackScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();

function shouldHideTabBar(route: any): boolean {
	const routeName = getFocusedRouteNameFromRoute(route);
	if (
		routeName === Route.SHOW_DETAIL ||
		routeName === Route.SEASON_DETAIL ||
		routeName === Route.SEARCH_INPUT ||
		routeName === Route.SEARCH_RESULTS
	)
		return true;
	return false;
}

const navTheme = {
	dark: true,
	colors: {
		primary: colors.primary,
		background: colors.background,
		card: colors.background,
		text: colors.text,
		border: colors.border,
		notification: colors.primary,
	},
	fonts: {
		regular: { fontFamily: "System", fontWeight: "400" as const },
		medium: { fontFamily: "System", fontWeight: "500" as const },
		bold: { fontFamily: "System", fontWeight: "700" as const },
		heavy: { fontFamily: "System", fontWeight: "900" as const },
	},
};

export default function AppNavigator() {
	const navRef = useRef<NavigationContainerRef<MainTabParamList>>(null);

	return (
		<NavigationContainer ref={navRef} theme={navTheme}>
			<Tab.Navigator
				screenOptions={({ route }) => ({
					headerShown: false,
					sceneStyle: { backgroundColor: colors.background },
					tabBarStyle: shouldHideTabBar(route)
						? { display: "none" as const }
						: {
								backgroundColor: colors.background,
								borderTopColor: colors.border,
							},
					tabBarActiveTintColor: colors.primary,
					tabBarInactiveTintColor: colors.textMuted,
					tabBarIcon: ({ color, size }) => {
						const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
							[Route.HOME]: "home",
							[Route.SEARCH]: "search",
							[Route.CALENDAR]: "calendar",
							[Route.PROFILE]: "person",
						};
						return <Ionicons name={icons[route.name] || "ellipse"} size={size} color={color} />;
					},
				})}
			>
				<Tab.Screen
					name={Route.HOME}
					component={HomeStackScreen}
					listeners={{
						tabPress: (e) => {
							e.preventDefault();
							navRef.current?.dispatch(
								CommonActions.navigate({
									name: Route.HOME,
									params: {
										screen: Route.HOME_TABS,
										params: { screen: Route.WATCHLIST },
									},
								}),
							);
						},
					}}
				/>
				<Tab.Screen
					name={Route.CALENDAR}
					component={CalendarStackScreen}
					listeners={{
						tabPress: (e) => {
							e.preventDefault();
							navRef.current?.dispatch(
								CommonActions.navigate({
									name: Route.CALENDAR,
									params: { screen: Route.CALENDAR_MAIN },
								}),
							);
						},
					}}
				/>
				<Tab.Screen
					name={Route.SEARCH}
					component={SearchStackScreen}
					listeners={{
						tabPress: (e) => {
							e.preventDefault();
							navRef.current?.dispatch(
								CommonActions.navigate({
									name: Route.SEARCH,
									params: { screen: Route.SEARCH_MAIN },
								}),
							);
						},
					}}
				/>
				<Tab.Screen
					name={Route.PROFILE}
					component={ProfileStackScreen}
					options={{
						headerShown: false,
					}}
					listeners={{
						tabPress: (e) => {
							e.preventDefault();
							navRef.current?.dispatch(
								CommonActions.navigate({
									name: Route.PROFILE,
									params: { screen: Route.PROFILE_MAIN },
								}),
							);
						},
					}}
				/>
			</Tab.Navigator>
		</NavigationContainer>
	);
}
