import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { SwipeTabParamList, Route } from "../types";
import HomeStackScreen from "./HomeStackScreen";
import CalendarStackScreen from "./CalendarStackScreen";
import SearchStackScreen from "./SearchStackScreen";
import ProfileStackScreen from "./ProfileStackScreen";
import CustomTabBar from "./CustomTabBar";
import { useSwipingBack } from "../components/SwipeBackView";

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

/** iOS drawer curve — the bar moves like the sheets do */
const BAR_EASING = Easing.bezier(0.32, 0.72, 0, 1);
/** Back up from below when it returns; down and out a touch quicker when a detail screen opens */
const BAR_IN_MS = 240;
const BAR_OUT_MS = 200;

const isDetail = (route: Parameters<typeof getFocusedRouteNameFromRoute>[0]) => {
	const child = getFocusedRouteNameFromRoute(route);
	return child != null && DETAIL_ROUTES.has(child as Route);
};

/**
 * Overlaid on the tabs' bottom edge (they keep its height clear — sceneStyle) and slid down out
 * of view on detail routes, back up when one closes: the detail screen takes the space at once
 * and the bar glides over it, instead of popping out of layout. Shown again the moment a
 * swipe-back starts, so it's back in place while the detail screen slides off (useSwipingBack).
 */
function TabBar({
	state,
	onHeight,
}: {
	state: { routes: { name: string }[]; index: number };
	onHeight: (height: number) => void;
}) {
	const swipingBack = useSwipingBack();
	const activeRoute = state.routes[state.index];
	const hidden = !swipingBack && isDetail(activeRoute as never);
	// Shared, so the slide reads the measured height on the UI thread (a JS value captured by the
	// style stayed at its first 0 — "hidden" moved the bar by a pixel)
	const height = useSharedValue(0);
	const offset = useSharedValue(hidden ? 1 : 0);
	useEffect(() => {
		offset.value = withTiming(hidden ? 1 : 0, {
			duration: hidden ? BAR_OUT_MS : BAR_IN_MS,
			easing: BAR_EASING,
		});
	}, [hidden, offset]);
	const slide = useAnimatedStyle(() => ({
		// Its own height + a pixel: fully off-screen, shadow line included
		transform: [{ translateY: offset.value * (height.value + 1) }],
	}));
	return (
		<Animated.View
			style={[styles.bar, slide]}
			pointerEvents={hidden ? "none" : "auto"}
			onLayout={(e) => {
				const h = Math.round(e.nativeEvent.layout.height);
				height.value = h;
				onHeight(h);
			}}
			accessibilityElementsHidden={hidden}
			importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
		>
			<CustomTabBar activeTab={activeRoute.name} />
		</Animated.View>
	);
}

export default function SwipeTabsScreen() {
	// The overlaid bar's height: tab screens keep it clear, detail screens use it
	const [barHeight, setBarHeight] = useState(0);
	return (
		<SwipeTab.Navigator
			initialRouteName={Route.HOME}
			tabBarPosition="bottom"
			tabBar={({ state }) => <TabBar state={state} onHeight={setBarHeight} />}
			screenOptions={({ route }) => {
				const onDetail = isDetail(route);
				return {
					lazy: true,
					sceneStyle: { paddingBottom: onDetail ? 0 : barHeight },
					// Home's pager swipe is off: its Watch List / Upcoming tabs swipe themselves (RNGH,
					// after the cards' own swipes). HomeScreen turns it on while Upcoming shows, so
					// the left swipe on to Calendar follows the finger
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

const styles = StyleSheet.create({
	bar: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
