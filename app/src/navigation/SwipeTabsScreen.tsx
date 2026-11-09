import React, { createContext, useContext, useEffect, useState } from "react";
import { Freeze } from "react-freeze";
import { StyleSheet, type Animated as RNAnimated } from "react-native";
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
import { useTabDesyncCheck } from "./useTabDesyncCheck";

const SwipeTab = createMaterialTopTabNavigator<SwipeTabParamList>();

const DETAIL_ROUTES = new Set([
	Route.SHOW_DETAIL,
	Route.SEASON_DETAIL,
	Route.SEARCH_INPUT,
	Route.SEARCH_RESULTS,
	Route.SETTINGS,
	Route.WATCH_HISTORY,
	Route.LISTS,
	Route.LIST_DETAIL,
	Route.IMPORT_DATA,
]);

/** iOS drawer curve — the bar moves like the sheets do */
const BAR_EASING = Easing.bezier(0.32, 0.72, 0, 1);
/** Back up from below when it returns; down and out a touch quicker when a detail screen opens */
const BAR_IN_MS = 240;
const BAR_OUT_MS = 200;
/** Slide distance before the bar's height is known */
const BAR_FALLBACK_HEIGHT = 200;

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
	position,
	layout,
	onHeight,
}: {
	state: { routes: { name: string }[]; index: number };
	position: RNAnimated.AnimatedInterpolation<number>;
	layout: { width: number };
	onHeight: (height: number) => void;
}) {
	useTabDesyncCheck(position, layout.width, state.index);
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
		// Not measured yet (first frames, a fast refresh) → a distance that clears any bar
		transform: [{ translateY: offset.value * ((height.value || BAR_FALLBACK_HEIGHT) + 1) }],
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

/** The focused tab's index (TAB_ORDER) */
const FocusedTabContext = createContext(0);
const TAB_ORDER = [Route.HOME, Route.CALENDAR, Route.SEARCH, Route.PROFILE] as const;

/**
 * A tab that isn't the focused one or right next to it is frozen (react-freeze): it keeps its
 * state but skips React updates until it comes back into reach. Every tab stays mounted once
 * opened and re-rendered on every change to the data it reads — a mark re-rendered the off-screen
 * Profile tab for ~300ms each time, stalling the watchlist's animations. Neighbours stay live:
 * the pager shows them while a swipe is in progress (a frozen tab is hidden). Home is never
 * frozen: thawed, its watchlist's pinned header came back out of step with the list's scroll
 */
function reachableTab(name: (typeof TAB_ORDER)[number], Screen: React.ComponentType<any>) {
	const at = TAB_ORDER.indexOf(name);
	const freezable = name !== Route.HOME;
	function ReachableTab(props: object) {
		const focused = useContext(FocusedTabContext);
		return (
			<Freeze freeze={freezable && Math.abs(focused - at) > 1}>
				<Screen {...props} />
			</Freeze>
		);
	}
	return ReachableTab;
}
const HomeTab = reachableTab(Route.HOME, HomeStackScreen);
const CalendarTab = reachableTab(Route.CALENDAR, CalendarStackScreen);
const SearchTab = reachableTab(Route.SEARCH, SearchStackScreen);
const ProfileTab = reachableTab(Route.PROFILE, ProfileStackScreen);

export default function SwipeTabsScreen() {
	// The overlaid bar's height: tab screens keep it clear, detail screens use it
	const [barHeight, setBarHeight] = useState(0);
	const [focusedTab, setFocusedTab] = useState(0);
	return (
		<FocusedTabContext.Provider value={focusedTab}>
			<SwipeTab.Navigator
				screenListeners={{
					state: (e) => {
						const index = (e.data as { state?: { index?: number } }).state?.index;
						if (index !== undefined) setFocusedTab(index);
					},
				}}
				initialRouteName={Route.HOME}
				tabBarPosition="bottom"
				tabBar={({ state, position, layout }) => (
					<TabBar state={state} position={position} layout={layout} onHeight={setBarHeight} />
				)}
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
				<SwipeTab.Screen name={Route.HOME} component={HomeTab} />
				<SwipeTab.Screen name={Route.CALENDAR} component={CalendarTab} />
				<SwipeTab.Screen name={Route.SEARCH} component={SearchTab} />
				<SwipeTab.Screen name={Route.PROFILE} component={ProfileTab} />
			</SwipeTab.Navigator>
		</FocusedTabContext.Provider>
	);
}

const styles = StyleSheet.create({
	bar: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
