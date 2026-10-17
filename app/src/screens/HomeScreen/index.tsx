import { useEffect, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { colors } from "../../theme";
import { HomeStackParamList, Route } from "../../types";
import WatchlistTab from "./WatchlistTab";
import UpcomingTab from "./UpcomingTab";

type HomeTab = Route.WATCHLIST | Route.UPCOMING;

const TABS: { key: HomeTab; label: string }[] = [
	{ key: Route.WATCHLIST, label: "Watch List" },
	{ key: Route.UPCOMING, label: "Upcoming" },
];
const SLIDE_MS = 250;
/** Drag starts after 25px sideways (cards claim theirs at 10px first); turns past 30% or a flick */
const START_PX = 25;
const TURN_SHARE = 0.3;
const FLICK_VELOCITY = 500;

/**
 * Home: Watch List / Upcoming. Not a material-top-tabs navigator — its native pager, nested
 * in the bottom pager, cancels every gesture on touch-down (pager-view's NestedScrollableHost
 * → requestDisallowInterceptTouchEvent → RNGH cancels). The tabs slide here instead, following
 * the finger. On Upcoming a left drag belongs to the bottom pager (on to Calendar, also live).
 */
export default function HomeScreen() {
	const { top } = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const navigation = useNavigation();
	const route = useRoute<RouteProp<HomeStackParamList, Route.HOME_TABS>>();
	const [tab, setTab] = useState<HomeTab>(route.params?.screen ?? Route.WATCHLIST);
	// Upcoming mounts the first time it's shown (it fetches)
	const [upcomingOpened, setUpcomingOpened] = useState(tab === Route.UPCOMING);

	// Bottom tab bar / links ask for a tab through params — consume them so a repeat works
	const requested = route.params?.screen;
	useEffect(() => {
		if (!requested) return;
		setTab(requested);
		navigation.setParams({ screen: undefined } as never);
	}, [requested, navigation]);

	useEffect(() => {
		if (tab === Route.UPCOMING) setUpcomingOpened(true);
	}, [tab]);

	const index = TABS.findIndex((t) => t.key === tab);
	// Row position in px (0 = Watch List, width = Upcoming); follows the finger while dragging
	const pos = useSharedValue(index * width);
	const dragging = useSharedValue(false);
	useEffect(() => {
		if (!dragging.value) pos.value = withTiming(index * width, { duration: SLIDE_MS });
	}, [index, width, pos, dragging]);

	// Bottom pager swipe only while Upcoming shows (its left drag → Calendar); this pan then
	// claims rightward drags only. On Watch List the pager stays off (card swipes).
	const focused = useIsFocused();
	useEffect(() => {
		navigation.getParent()?.setOptions({ swipeEnabled: focused && tab === Route.UPCOMING });
	}, [navigation, focused, tab]);

	const pan = Gesture.Pan()
		.activeOffsetX(index === 1 ? START_PX : -START_PX)
		.failOffsetY([-15, 15])
		.onStart(() => {
			dragging.value = true;
			if (index === 0) runOnJS(setUpcomingOpened)(true);
		})
		.onUpdate((e) => {
			pos.value = Math.min(width, Math.max(0, index * width - e.translationX));
		})
		.onEnd((e) => {
			dragging.value = false;
			let next = index;
			if (index === 0 && (e.translationX < -width * TURN_SHARE || e.velocityX < -FLICK_VELOCITY)) next = 1;
			if (index === 1 && (e.translationX > width * TURN_SHARE || e.velocityX > FLICK_VELOCITY)) next = 0;
			pos.value = withTiming(next * width, { duration: SLIDE_MS });
			if (next !== index) runOnJS(setTab)(TABS[next].key);
		});

	const pages = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.value }] }));
	const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value / TABS.length }] }));

	return (
		<View style={styles.container}>
			<View style={[styles.tabBar, { paddingTop: top }]}>
				{TABS.map((t) => (
					<TouchableOpacity key={t.key} style={styles.tab} onPress={() => setTab(t.key)} activeOpacity={0.7}>
						<Text style={[styles.tabLabel, t.key === tab && styles.tabLabelActive]}>{t.label}</Text>
					</TouchableOpacity>
				))}
				<Animated.View style={[styles.indicator, { width: width / TABS.length }, indicator]} />
			</View>
			<GestureDetector gesture={pan}>
				<View style={styles.clip}>
					<Animated.View style={[styles.pages, { width: width * TABS.length }, pages]}>
						<View style={{ width }}>
							<WatchlistTab />
						</View>
						<View style={{ width }}>{upcomingOpened && <UpcomingTab />}</View>
					</Animated.View>
				</View>
			</GestureDetector>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	tabBar: { flexDirection: "row", backgroundColor: colors.background },
	tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
	tabLabel: {
		fontWeight: "900",
		fontSize: 16,
		textTransform: "uppercase",
		letterSpacing: 1,
		color: colors.textSecondary,
	},
	tabLabelActive: { color: colors.primary },
	indicator: { position: "absolute", bottom: 0, left: 0, height: 2, backgroundColor: colors.primary },
	clip: { flex: 1, overflow: "hidden" },
	pages: { flex: 1, flexDirection: "row" },
});
