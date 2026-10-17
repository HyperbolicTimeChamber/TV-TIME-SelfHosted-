import React from "react";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { SwipeTabParamList, Route } from "../types";
import HomeStackScreen from "./HomeStackScreen";
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
	Route.WATCH_HISTORY,
	Route.IMPORT_DATA,
]);

export default function SwipeTabsScreen() {
	return (
		<SwipeTab.Navigator
			initialRouteName={Route.HOME}
			tabBarPosition="bottom"
			tabBar={({ state }) => {
				const activeRoute = state.routes[state.index];
				const childRoute = getFocusedRouteNameFromRoute(activeRoute);
				if (childRoute && DETAIL_ROUTES.has(childRoute as Route)) return null;

				return <CustomTabBar activeTab={activeRoute.name} />;
			}}
			screenOptions={({ route }) => {
				const childRoute = getFocusedRouteNameFromRoute(route);
				const onDetail = childRoute != null && DETAIL_ROUTES.has(childRoute as Route);
				return {
					lazy: true,
					// Home's pager swipe stays off: its Watch List / Upcoming tabs swipe themselves
					// (RNGH, after the cards' own swipes) and Upcoming hands a left swipe on to Calendar
					swipeEnabled: !onDetail && route.name !== Route.HOME,
				};
			}}
		>
			<SwipeTab.Screen name={Route.HOME} component={HomeStackScreen} />
			<SwipeTab.Screen name={Route.CALENDAR} component={CalendarStackScreen} />
			<SwipeTab.Screen name={Route.SEARCH} component={SearchStackScreen} />
			<SwipeTab.Screen name={Route.PROFILE} component={ProfileStackScreen} />
		</SwipeTab.Navigator>
	);
}
