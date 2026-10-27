import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
	AppState,
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	CommonActions,
	useIsFocused,
	useNavigation,
	useRoute,
	type RouteProp,
} from "@react-navigation/native";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
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
const START_PX = 25;
/** On Upcoming a rightward drag is claimed this early, inside the bottom pager's ~8dp touch slop —
 *  any later and the pager (swipeable there, for Calendar) intercepts it first */
const UPCOMING_BACK_PX = 6;
const TURN_SHARE = 0.3;
const FLICK_VELOCITY = 500;
const PRELOAD_TABS = [Route.CALENDAR, Route.SEARCH, Route.PROFILE];
const PRELOAD_START_MS = 4000;
const PRELOAD_GAP_MS = 1500;
/** Upcoming pre-mounts this long after Home, once JS is idle — mounting it mid-drag janked the slide */
const UPCOMING_MOUNT_MS = 1500;

export default function HomeScreen() {
	const { top } = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const navigation = useNavigation();
	const route = useRoute<RouteProp<HomeStackParamList, Route.HOME_TABS>>();
	const [tab, setTab] = useState<HomeTab>(route.params?.screen ?? Route.WATCHLIST);
	// Upcoming mounts once Home has settled (it fetches), or the first time it's shown if sooner
	const [upcomingOpened, setUpcomingOpened] = useState(tab === Route.UPCOMING);

	// Bottom tab bar / links ask for a tab through params — consume them so a repeat works
	const requested = route.params?.screen;
	useEffect(() => {
		if (!requested) return;
		setTab((cur) => (cur === requested ? cur : requested));
		navigation.setParams({ screen: undefined } as never);
	}, [requested, navigation]);

	useEffect(() => {
		if (tab === Route.UPCOMING) setUpcomingOpened(true);
	}, [tab]);

	// Mirror for the pan worklet — a gesture rebuilt mid-drag would cut the drag off
	const upcomingMounted = useSharedValue(upcomingOpened);
	// Pre-mount Upcoming while nothing's happening, so the first swipe slides over a built page
	useEffect(() => {
		upcomingMounted.value = upcomingOpened;
		if (upcomingOpened) return;
		let idle: number | undefined;
		const timer = setTimeout(() => {
			idle = requestIdleCallback(() => setUpcomingOpened(true));
		}, UPCOMING_MOUNT_MS);
		return () => {
			clearTimeout(timer);
			if (idle !== undefined) cancelIdleCallback(idle);
		};
	}, [upcomingOpened, upcomingMounted]);

	const index = TABS.findIndex((t) => t.key === tab);
	// `index` on the UI thread. Written the moment a tab change *starts* (this pan's onEnd, a
	// tab tap) rather than when React re-renders: a second swipe begun during the 250ms slide
	// otherwise read the old tab, and a swipe back to Watch List did nothing at all.
	const indexSV = useSharedValue(index);
	useEffect(() => {
		indexSV.value = index;
	}, [index, indexSV]);
	// Row position in px (0 = Watch List, width = Upcoming); follows the finger while dragging
	const pos = useSharedValue(index * width);
	const dragging = useSharedValue(false);
	// Where the finger went down, for the manual activation below
	const downX = useSharedValue(0);
	const downY = useSharedValue(0);
	// Where the row is sliding to — a swipe / tap sets it with its slide, so the `tab` re-render
	// that follows doesn't restart the slide mid-flight (the hitch at the end of a swipe)
	const settle = useSharedValue(index * width);
	// translationX at activation — the pan only starts after START_PX, without this the row jumps
	const grab = useSharedValue(0);
	useEffect(() => {
		const to = index * width;
		if (dragging.value || settle.value === to) return;
		settle.value = to;
		pos.value = withTiming(to, { duration: SLIDE_MS });
	}, [index, width, pos, dragging, settle]);

	// Back from background the row can come back at Watch List while `tab` still says Upcoming
	// (view restored / gesture cut off mid-drag) — snap it back to the tab state
	const target = useRef(index * width);
	target.current = index * width;
	useEffect(() => {
		const sub = AppState.addEventListener("change", (state) => {
			if (state !== "active") return;
			dragging.value = false;
			indexSV.value = target.current / Math.max(1, width);
			settle.value = target.current;
			pos.value = target.current;
		});
		return () => sub.remove();
	}, [pos, dragging, settle, indexSV, width]);

	useEffect(() => {
		const parent = navigation.getParent();
		if (!parent) return;
		const timers = PRELOAD_TABS.map((name, i) =>
			setTimeout(
				() => parent.dispatch(CommonActions.preload(name)),
				PRELOAD_START_MS + i * PRELOAD_GAP_MS,
			),
		);
		return () => timers.forEach(clearTimeout);
	}, [navigation]);

	// Upcoming → Calendar belongs to the bottom pager, the one thing that can slide Calendar in
	// under the finger (this pan, clamped at Upcoming, moved nothing and jumped on release). So
	// the pager's swipe is on for Home while Upcoming shows. It intercepts at its own ~8dp slop,
	// which used to swallow slow swipes back to Watch List (1 in 3) — the pan below now claims
	// rightward drags on Upcoming at UPCOMING_BACK_PX, before the pager can.
	const focused = useIsFocused();
	useEffect(() => {
		const parent = navigation.getParent();
		if (!parent) return;
		parent.setOptions({ swipeEnabled: focused && tab === Route.UPCOMING });
	}, [navigation, focused, tab]);

	// Tab tap: start the slide on the UI thread now — the state change (labels, swipe options)
	// follows without holding up the animation
	const goTo = useCallback(
		(key: HomeTab) => {
			const i = TABS.findIndex((t) => t.key === key);
			indexSV.value = i;
			settle.value = i * width;
			pos.value = withTiming(i * width, { duration: SLIDE_MS });
			if (key === Route.UPCOMING) setUpcomingOpened(true);
			setTab(key);
		},
		[pos, settle, width, indexSV],
	);

	// Built once. Rebuilding a gesture the moment a drag ends (which `index` in the deps did)
	// re-configures the detector mid-finalise and drops the handler's callbacks — the same
	// trap the Calendar's pagers call out. Which direction this pan claims therefore can't be
	// baked into activeOffsetX any more; it's decided per touch against `indexSV` instead.
	const pan = useMemo(
		() =>
			Gesture.Pan()
				.manualActivation(true)
				.onTouchesDown((e) => {
					"worklet";
					downX.value = e.allTouches[0].absoluteX;
					downY.value = e.allTouches[0].absoluteY;
				})
				.onTouchesMove((e, state) => {
					"worklet";
					const touch = e.allTouches[0];
					const dx = touch.absoluteX - downX.value;
					const dy = touch.absoluteY - downY.value;
					// Up / down belongs to the list (the old failOffsetY([-15, 15]))
					if (Math.abs(dy) > 15) {
						state.fail();
						return;
					}
					// Upcoming: rightward → Watch List, claimed early (see UPCOMING_BACK_PX); leftward
					// is the bottom pager's, on to Calendar. Watch List claims leftward only; a
					// rightward drag there is the system back gesture's.
					if (indexSV.value === 1) {
						if (dx < -UPCOMING_BACK_PX) state.fail();
						else if (dx > UPCOMING_BACK_PX && dx > Math.abs(dy) * 2) state.activate();
						return;
					}
					if (Math.abs(dx) > START_PX) {
						if (dx < 0) state.activate();
						else state.fail();
					}
				})
				.onStart((e) => {
					"worklet";
					dragging.value = true;
					grab.value = e.translationX;
					// Not pre-mounted yet (swiped right away) — mount now
					if (indexSV.value === 0 && !upcomingMounted.value) {
						upcomingMounted.value = true;
						runOnJS(setUpcomingOpened)(true);
					}
				})
				.onUpdate((e) => {
					"worklet";
					const from = indexSV.value * width;
					pos.value = Math.min(width, Math.max(0, from - (e.translationX - grab.value)));
				})
				.onEnd((e) => {
					"worklet";
					const current = indexSV.value;
					let next = current;
					if (
						current === 0 &&
						(e.translationX < -width * TURN_SHARE || e.velocityX < -FLICK_VELOCITY)
					)
						next = 1;
					if (
						current === 1 &&
						(e.translationX > width * TURN_SHARE || e.velocityX > FLICK_VELOCITY)
					)
						next = 0;
					indexSV.value = next;
					settle.value = next * width;
					pos.value = withTiming(next * width, { duration: SLIDE_MS });
					if (next !== current) runOnJS(setTab)(TABS[next].key);
				})
				// Cancelled drags (the system back gesture, a parent claiming the touch) never
				// reach onEnd — without this the row stays stuck wherever the finger left it
				.onFinalize(() => {
					"worklet";
					if (!dragging.value) return;
					dragging.value = false;
					const to = indexSV.value * width;
					if (settle.value !== to) {
						settle.value = to;
						pos.value = withTiming(to, { duration: SLIDE_MS });
					}
				}),
		[width, pos, dragging, settle, grab, upcomingMounted, indexSV, downX, downY],
	);

	// Tab trees don't depend on HomeScreen state — keep them out of its re-renders
	const watchlist = useMemo(() => <WatchlistTab />, []);
	const upcoming = useMemo(() => (upcomingOpened ? <UpcomingTab /> : null), [upcomingOpened]);

	const pages = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.value }] }));
	const indicator = useAnimatedStyle(() => ({
		transform: [{ translateX: pos.value / TABS.length }],
	}));

	return (
		<View style={styles.container}>
			<View style={[styles.tabBar, { paddingTop: top }]}>
				{TABS.map((t) => (
					<TouchableOpacity
						key={t.key}
						style={styles.tab}
						onPress={() => goTo(t.key)}
						activeOpacity={0.7}
					>
						<Text style={[styles.tabLabel, t.key === tab && styles.tabLabelActive]}>{t.label}</Text>
					</TouchableOpacity>
				))}
				<Animated.View style={[styles.indicator, { width: width / TABS.length }, indicator]} />
			</View>
			<GestureDetector gesture={pan}>
				<View style={styles.clip}>
					<Animated.View style={[styles.pages, { width: width * TABS.length }, pages]}>
						<View style={{ width }}>{watchlist}</View>
						<View style={{ width }}>{upcoming}</View>
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
	indicator: {
		position: "absolute",
		bottom: 0,
		left: 0,
		height: 2,
		backgroundColor: colors.primary,
	},
	clip: { flex: 1, overflow: "hidden" },
	pages: { flex: 1, flexDirection: "row" },
});
