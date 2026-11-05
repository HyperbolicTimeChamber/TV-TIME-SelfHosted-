import {
	useCallback,
	useLayoutEffect,
	useRef,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { View, Animated, StyleSheet, RefreshControl, Dimensions } from "react-native";
import type { LegendListRef } from "@legendapp/list/react-native";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import Reanimated, {
	Easing,
	LinearTransition,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useFocusEffect, useNavigation, CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
	ConfirmModal,
	LoadingSpinner,
	ShowCard,
	WatchCountSheet,
	EpisodeDetailModal,
	ShowDrawer,
} from "../../../components";
import { colors, spacing } from "../../../theme";
import {
	HomeStackParamList,
	MainStackParamList,
	MediaType,
	Route,
	WatchStatus,
} from "../../../types";
import { useSharedShimmer } from "../../../components/SkeletonLine";
import { SwipeActionBanner, releaseHeldSwipe } from "../../../components/SwipeableCard";
import { ModalBackdrop, ModalLogo } from "../../../components/modals/ModalArt";
import type { WatchlistListItem } from "../../../types/watchlist";
import { getCachedCatalogShow, type EnrichedTrackingItem } from "../../../hooks/useWatchlist";
import { styles } from "./styles";
import { useWatchlistScreen } from "./useWatchlistScreen";
import WatchedEpisodeRow from "./WatchedEpisodeRow";
import SectionHeader from "./SectionHeader";
import HomeEmpty, { CAUGHT_UP_ART, WELCOME_ART } from "../HomeEmpty";
import { withCaughtUp } from "../../../utils";
import { UP_NEXT_TITLE } from "../../../utils/watchlistList";
import { rememberedRowSize, rowSizesReady, saveRowSizes } from "./rowSizes";

const SCREEN_HEIGHT = Dimensions.get("window").height;
/** Height of a pinned section header pill row */
const SECTION_HEADER_H = 48;

type NavProp = CompositeNavigationProp<
	NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>,
	NativeStackNavigationProp<MainStackParamList>
>;

const SeparatorComponent = () => <View style={styles.separator} />;

/** Previously watched rows only offer pause while their title is still being (re)watched */
const canPause = (show: EnrichedTrackingItem) =>
	show.status === WatchStatus.WATCHING || show.status === WatchStatus.REWATCHING;

const POSTER_WIDTH = 100;

function SkeletonFooter() {
	const shimmer = useSharedShimmer();
	return (
		<View style={skeletonStyles.container}>
			{[0, 1, 2].map((i) => (
				<Animated.View key={i} style={[skeletonStyles.card, { opacity: shimmer }]} />
			))}
		</View>
	);
}

const skeletonStyles = StyleSheet.create({
	container: {
		gap: spacing.sm,
		paddingTop: spacing.sm,
		paddingHorizontal: spacing.sm,
	},
	card: {
		minHeight: POSTER_WIDTH,
		borderRadius: 8,
		backgroundColor: colors.border,
	},
});

/** On-screen movement → ease-in-out; quick enough to read as a response to the tap */
const CARD_MOVE_MS = 300;
const CARD_MOVE_EASING = Easing.bezier(0.77, 0, 0.175, 1);

/** `grow`: a row joining Previously Watched on screen — grows in (GrowIn). `growShift`: rides
 *  the header glide while it grows; `growWaiting`: hidden until its grow has started */
type ListRow = WatchlistListItem & {
	grow?: number;
	growShift?: boolean;
	growWaiting?: boolean;
	hideHeader?: boolean;
	/** An unwatch just moved this card's episode back: it flips over (FlipIn); hidden until
	 *  the flip has started */
	flipping?: boolean;
	flipWaiting?: boolean;
};
/** Unwatch flip: from edge-on (rotateX 90°) to flat, strong ease-out */
const FLIP_FROM_DEG = 90;
const FLIP_EASING = Easing.bezier(0.23, 1, 0.32, 1);
const FLIP_START = { transform: [{ perspective: 800 }, { rotateX: `${FLIP_FROM_DEG}deg` }] };
/** The "What's Up Next" header's move (list coordinates) while a row grows in above it */
type HeaderMove = { from: number; to: number; token: number };
/** Card moves right after a mark glide (the list's own layout transition: positions change
 *  natively in the same frame, so nothing is drawn in its new place first). Any other time
 *  positions change at once — an instant transition rather than none, which would remount
 *  every row (LegendList swaps its row container for one without transitions) */
const CARD_LAYOUT = LinearTransition.duration(CARD_MOVE_MS).easing(CARD_MOVE_EASING);
const CARD_LAYOUT_INSTANT = LinearTransition.duration(0);
/** When the pinned headers re-read the list's scroll after it may have moved (stickyScroll) */
const STICKY_SYNC_MS = [0, 150, 500];
/** Longest a mark / unwatch keeps the glide armed waiting for its list change */
const ARM_MS = 6000;
/** A row joining Previously Watched grows from this scale — never from nothing */
const ROW_GROW_FROM = 0.6;

/** A row a mark / unwatch took off the list while on screen: drawn over the list where it was
 *  (`y`, `h` in list coordinates) while it shrinks away — the grow-in reversed — clipped below
 *  `clipTop` (under the pinned "What's Up Next" header) */
type LeavingRow = {
	key: string;
	row: WatchlistListItem;
	y: number;
	h: number;
	clipTop: number;
};

/** A card counts as seen once half of it is on screen */
const CARD_VIEWABILITY = { itemVisiblePercentThreshold: 50 };

const keyOf = (item: WatchlistListItem) => {
	if (item.type === "sectionHeader") return `section_${item.title}`;
	if (item.type === "watchedMovie") return `movie_${item.movie.id}`;
	if (item.type === "watchedEpisode") return `watched_${item.episode.id}`;
	if (item.type === "caughtUp") return "caughtUp";
	return `show_${item.item.id}`;
};

const UP_NEXT_KEY = keyOf({ type: "sectionHeader", title: UP_NEXT_TITLE });

/** Height of one Previously Watched row + the gap under it, measured off two drawn rows */
function watchedSlot(
	state: ReturnType<LegendListRef["getState"]>,
	rows: readonly WatchlistListItem[],
): number | null {
	for (let i = 0; i < rows.length - 1; i++) {
		if (!isWatchedRow(rows[i])) continue;
		const a = state.positionByKey(keyOf(rows[i]));
		const b = state.positionByKey(keyOf(rows[i + 1]));
		if (a !== undefined && b !== undefined && b > a) return b - a;
	}
	return null;
}

/** The title a list row belongs to */
function rowTmdbId(item: WatchlistListItem): number | null {
	if (item.type === "show") return item.item.tmdbId;
	if (item.type === "watchedEpisode") return item.episode.tmdbShowId;
	if (item.type === "watchedMovie") return item.movie.tmdbId;
	return null;
}

/**
 * How the list moves from the rows as drawn (`prev`) to the new ones, read from the old layout
 * before it's replaced — only for titles just marked / unwatched (`wasJustChanged`), only on
 * screen (off screen the list holds the view still and nothing animates):
 * - a row left (a card with nothing left to watch, an unwatched Previously Watched row) → it
 *   shrinks away in place (`leaving`) while the rows under it glide up;
 * - a row joined (a Previously Watched row, a card back in "What's Up Next") → it grows in
 *   (`grow`) while the rows under it glide down;
 * - a mark lifted a card → the cards glide to their new places (`move`);
 * - a Previously Watched row joining / leaving moves the "What's Up Next" header by its slot
 *   (`header` — the header isn't part of the cards' layout transition).
 */
function listMotion(
	list: LegendListRef | null,
	prev: readonly WatchlistListItem[],
	next: readonly WatchlistListItem[],
	promoted: boolean,
	wasJustChanged: (tmdbId: number) => boolean,
	listH: number,
): {
	move: boolean;
	grow: Set<string>;
	leaving: LeavingRow[];
	header: { from: number; to: number } | null;
} {
	const grow = new Set<string>();
	const leaving: LeavingRow[] = [];
	let header: { from: number; to: number } | null = null;
	const state = list?.getState();
	if (!state || prev.length === 0 || listH === 0) {
		return { move: promoted, grow, leaving, header };
	}
	const nextKeys = new Set(next.map(keyOf));
	const prevKeys = new Set(prev.map(keyOf));
	const changed = (i: WatchlistListItem) => {
		const id = rowTmdbId(i);
		return id !== null && wasJustChanged(id);
	};
	const clipTop = upNextOnScreen(list) ? SECTION_HEADER_H : 0;
	const upNext = state.positionByKey(UP_NEXT_KEY);
	const upNextY = upNext === undefined ? undefined : upNext - state.scroll;
	// Header moves only while it sits on screen below Previously Watched (not pinned)
	const headerFree = upNextY !== undefined && upNextY > 0 && upNextY < listH;
	let headerDelta = 0;

	for (const d of prev) {
		const key = keyOf(d);
		if (nextKeys.has(key) || !changed(d)) continue;
		const pos = state.positionByKey(key);
		if (pos === undefined) continue;
		const h = state.sizeAtIndex(prev.indexOf(d));
		const y = pos - state.scroll;
		if (y + h <= clipTop || y >= listH) continue;
		leaving.push({ key, row: d, y, h, clipTop });
		if (isWatchedRow(d) && headerFree) {
			const below = prev[prev.indexOf(d) + 1];
			const belowPos = below ? state.positionByKey(keyOf(below)) : undefined;
			headerDelta -= belowPos !== undefined ? belowPos - pos : h;
		}
	}

	const slot = watchedSlot(state, prev);
	for (const a of next) {
		const key = keyOf(a);
		if (prevKeys.has(key)) continue;
		const watched = isWatchedRow(a);
		// Only rows / cards of a title just marked or unwatched: rows and cards also arrive with
		// pages and the first load, and those must not animate
		if (!changed(a)) continue;
		const below = next[next.indexOf(a) + 1];
		const belowPos = below ? state.positionByKey(keyOf(below)) : undefined;
		const belowY = belowPos === undefined ? -1 : belowPos - state.scroll;
		if (!(belowY > 0 && belowY < listH)) continue;
		grow.add(key);
		if (watched && headerFree && slot) headerDelta += slot;
	}

	if (headerDelta !== 0 && upNextY !== undefined) {
		header = { from: upNextY, to: upNextY + headerDelta };
	}
	return {
		move: promoted || leaving.length > 0 || grow.size > 0,
		grow,
		leaving,
		header,
	};
}

/** A leaving row (LeavingRow): shrinks to ROW_GROW_FROM toward its top edge as it fades — the
 *  grow-in reversed. Its backing closes with it (height → 0, same time and curve as the rows
 *  under it gliding up), so what the list left in the slot never shows and the rows coming up
 *  are never covered */
function LeavingGhost({
	card,
	onDone,
	children,
}: Readonly<{ card: LeavingRow; onDone: (key: string) => void; children: ReactNode }>) {
	const t = useSharedValue(0);
	useLayoutEffect(() => {
		t.value = withTiming(1, { duration: CARD_MOVE_MS, easing: CARD_MOVE_EASING }, (finished) => {
			if (finished) runOnJS(onDone)(card.key);
		});
	}, [t, card.key, onDone]);
	const close = useAnimatedStyle(() => ({ height: card.h * (1 - t.value) }));
	const shrink = useAnimatedStyle(() => ({
		opacity: 1 - t.value,
		transform: [{ scale: 1 - (1 - ROW_GROW_FROM) * t.value }],
	}));
	return (
		<View style={[styles.leavingClip, { top: card.clipTop }]} pointerEvents="none">
			<Reanimated.View style={[styles.leavingCard, { top: card.y - card.clipTop }, close]}>
				<Reanimated.View style={[styles.growIn, shrink]}>{children}</Reanimated.View>
			</Reanimated.View>
		</View>
	);
}
const noop = () => {};
const noopAsync = async () => {};

const isWatchedRow = (item: WatchlistListItem) =>
	item.type === "watchedEpisode" || item.type === "watchedMovie";

/** Scrolled to (or past) the "What's Up Next" header — Previously Watched is off screen above */
function upNextOnScreen(list: LegendListRef | null): boolean {
	const state = list?.getState();
	const top = state?.positionByKey(UP_NEXT_KEY);
	return !!state && top !== undefined && state.scroll >= top - 1;
}

/** The top of "What's Up Next" (where a marked card goes) is on screen — scrolled no further
 *  than the pinned header's own spot. Scrolled past it, the card would land above the view:
 *  see `pinned` */
function upNextTopOnScreen(list: LegendListRef | null): boolean {
	const state = list?.getState();
	const top = state?.positionByKey(UP_NEXT_KEY);
	// Up to a header's height past it: the list opens a few px past the header's own spot
	// (content padding), and the first card is still in view right under the pinned header
	return !!state && top !== undefined && state.scroll <= top + SECTION_HEADER_H;
}

/** The list with a pinned card put back before the row it was above (see `pinned`) */
function withPinned(
	data: WatchlistListItem[],
	pin: { key: string; beforeKey: string | null } | null,
): WatchlistListItem[] {
	if (!pin) return data;
	const i = data.findIndex((r) => keyOf(r) === pin.key);
	if (i === -1) return data;
	const rest = [...data.slice(0, i), ...data.slice(i + 1)];
	const j = pin.beforeKey ? rest.findIndex((r) => keyOf(r) === pin.beforeKey) : rest.length;
	if (j === -1) return data;
	rest.splice(j, 0, data[i]);
	return rest;
}

/** The list without the held rows; a section they leave empty goes too */
function withoutHeld(data: WatchlistListItem[], held: ReadonlySet<string>): WatchlistListItem[] {
	if (held.size === 0) return data;
	const kept = data.filter((i) => !held.has(keyOf(i)));
	return kept.filter(
		(i, n) => i.type !== "sectionHeader" || (kept[n + 1] && kept[n + 1].type !== "sectionHeader"),
	);
}

/**
 * The "What's Up Next" header gliding down with the cards when a row joins Previously Watched
 * above it. LegendList places headers itself, a render after ours and outside the cards' layout
 * transition, so the real one is hidden for the glide (a plain style, in the commit that adds the
 * row) and this copy over the list moves from its old place to its new one. The copy goes and the
 * real header comes back in one commit, at the same spot
 */
function HeaderGlide({
	glide,
	onDone,
}: Readonly<{ glide: HeaderMove; onDone: (token: number) => void }>) {
	const t = useSharedValue(0);
	useLayoutEffect(() => {
		t.value = withTiming(1, { duration: CARD_MOVE_MS, easing: CARD_MOVE_EASING }, (finished) => {
			if (finished) runOnJS(onDone)(glide.token);
		});
	}, [t, glide.token, onDone]);
	const style = useAnimatedStyle(() => ({
		transform: [{ translateY: (glide.to - glide.from) * t.value }],
	}));
	return (
		<Reanimated.View style={[styles.headerGlide, { top: glide.from }, style]} pointerEvents="none">
			<SectionHeader title={UP_NEXT_TITLE} />
		</Reanimated.View>
	);
}

/**
 * Row wrapper for the grow-in of a row joining Previously Watched (or a card coming back). No
 * hooks: every mounted row has one, so the animation (shared values + the animated styles) lives
 * once in WatchlistTab and only rows that are growing get its style. Always the same view type,
 * so a row starting / finishing a grow never remounts its card. `waiting` hides the row by a
 * plain style in the commit that places it — the animated values only reach the screen a frame
 * later, and the row showed full size for that frame — until its grow has started
 */
function GrowIn({
	style,
	waiting,
	children,
}: Readonly<{ style?: object; waiting?: boolean; children: ReactNode }>) {
	return (
		<Reanimated.View style={[styles.growIn, style, waiting && styles.growWaiting]}>
			{children}
		</Reanimated.View>
	);
}

/**
 * Card wrapper for the unwatch flip (a card whose episode an unwatch moved back stays where it
 * is, so nothing else showed it changed). Hook-free like GrowIn: the animation lives once in
 * WatchlistTab and only the flipping card gets its style
 */
function FlipIn({
	style,
	waiting,
	children,
}: Readonly<{ style?: object; waiting?: boolean; children: ReactNode }>) {
	// Waiting = the flip's first pose (edge-on), not hidden: the animation runs on the UI thread
	// and takes over at once, while unhiding waited on the JS thread — busy for a second or more
	// right after an unwatch, which left the card blank that long
	return <Reanimated.View style={[style, waiting && FLIP_START]}>{children}</Reanimated.View>;
}

export default function WatchlistTab() {
	const navigation = useNavigation<NavProp>();

	const handleNavigateToShow = useCallback(
		(tmdbId: number, mediaType: MediaType) => {
			navigation.navigate(Route.SHOW_DETAIL, { tmdbId, mediaType });
		},
		[navigation],
	);

	const {
		isLoading,
		onCardsVisible,
		sheetVisible,
		setSheetVisible,
		sheetEpisode,
		setSheetEpisode,
		movieSheetVisible,
		setMovieSheetVisible,
		sheetMovie,
		setSheetMovie,
		sheetMovieTitle,
		epModalVisible,
		setEpModalVisible,
		epModalData,
		setEpModalData,
		drawerVisible,
		setDrawerVisible,
		drawerShow,
		setDrawerShow,
		handleCardPress,
		handleModalSkip,
		handleLoadEpisodeDetails,
		handleEpModalShowPress,
		handleTitlePress,
		handleWatchedCheckmark,
		handleWatchedSwipeLeft,
		handleWatchedSwipeRight,
		handleEpisodeCountCommit,
		sheetInRewatch,
		sheetMinCount,
		handleMovieCheckmark,
		handleMovieSwipeLeft,
		handleMovieSwipeRight,
		handleMovieCountCommit,
		handleWatchedRowPress,
		listData: liveListData,
		promotions,
		wasJustMarked,
		listSettled,
		loadMoreTracking,
		loadMorePrevWatched,
		loadingMorePrevWatched,
		hasMorePrevWatched,
		prevWatchedOffset,
		watchedCountByShow,
		updatingShows,
		handleMarkWatched,
		handleStopWatching,
		handleMarkWatchedThrough,
		handleUnmarkEpisode,
		handleCarouselMarkWatched,
		isSwipedOff,
		listChangeArm,
	} = useWatchlistScreen(handleNavigateToShow);
	// Episode sheet's logo / name (catalog cache — 0 reads)
	const sheetShow = sheetEpisode
		? getCachedCatalogShow(sheetEpisode.tmdbShowId, MediaType.TV)
		: null;
	const fullData = useMemo(
		() => withCaughtUp(liveListData, listSettled),
		[liveListData, listSettled],
	);
	const listRef = useRef<LegendListRef | null>(null);

	// A row joining Previously Watched (a mark saving) lands just above Up Next. Inserted there
	// while Up Next is on screen, the list keeps the view in place a frame or two late on
	// Android — the cards nudge. So it waits, hidden, until the next drag or leaving the tab
	const seenWatched = useRef<Set<string> | null>(null);
	const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
	const watchedKeys = fullData.filter(isWatchedRow).map(keyOf);
	if (seenWatched.current === null) {
		if (fullData.length > 0) seenWatched.current = new Set(watchedKeys);
	} else {
		const seen = seenWatched.current;
		const fresh = watchedKeys.filter((k) => !seen.has(k));
		if (fresh.length > 0) {
			for (const k of fresh) seen.add(k);
			if (upNextOnScreen(listRef.current)) setHeld((prev) => new Set([...prev, ...fresh]));
		}
	}
	const releaseHeld = useCallback(() => {
		setHeld((prev) => (prev.size === 0 ? prev : new Set()));
	}, []);
	useFocusEffect(useCallback(() => releaseHeld, [releaseHeld]));
	// A mark scrolled past the top of "What's Up Next": the card stays where it was (its new
	// episode shows there) until the next drag, then takes its place at the top. Moved at once,
	// it landed above the view — the list shifted its scroll a frame after the rows moved, and
	// every row jumped and snapped back
	const drawnRows = useRef<readonly WatchlistListItem[]>([]);
	const [pinned, setPinned] = useState<{ key: string; beforeKey: string | null } | null>(null);
	const [pinSeen, setPinSeen] = useState(promotions);
	let pin = pinned;
	if (pinSeen !== promotions) {
		setPinSeen(promotions);
		pin = null;
		const lifted = fullData.find((r) => r.type === "show");
		const prev = drawnRows.current;
		const at = lifted ? prev.findIndex((r) => keyOf(r) === keyOf(lifted)) : -1;
		const wasFirst = prev.find((r) => r.type === "show");
		if (
			lifted &&
			at !== -1 &&
			wasFirst &&
			keyOf(wasFirst) !== keyOf(lifted) &&
			!upNextTopOnScreen(listRef.current)
		) {
			pin = { key: keyOf(lifted), beforeKey: prev[at + 1] ? keyOf(prev[at + 1]) : null };
		}
		setPinned(pin);
	}
	const releasePinned = useCallback(() => {
		setPinned((prev) => (prev ? null : prev));
	}, []);
	useFocusEffect(useCallback(() => releasePinned, [releasePinned]));
	const listData = useMemo(
		() => withPinned(withoutHeld(fullData, held), pin),
		[fullData, held, pin],
	);

	// The rows as last drawn: a reorder's glide starts from their layout
	useEffect(() => {
		drawnRows.current = listData;
	}, [listData]);
	// A mark lifting a card: each moved card glides from where it was drawn. Read during render —
	// the list still holds the old layout until this render commits
	const [listH, setListH] = useState(0);
	// The scroll the pinned headers follow. Fed by scroll events — but the list's opening scroll
	// to "What's Up Next" sent none, so "What's Up Next" sat at its unpinned spot (above the
	// view) until the first drag. Synced from the list's own scroll whenever it may have moved
	const stickyScroll = useSharedValue(0);
	const sharedValues = useMemo(() => ({ scrollOffset: stickyScroll }), [stickyScroll]);
	const syncStickyScroll = useCallback(() => {
		const scroll = listRef.current?.getState().scroll;
		if (scroll !== undefined && Math.abs(scroll - stickyScroll.value) > 0.5) {
			stickyScroll.value = scroll;
		}
	}, [stickyScroll]);
	// Remembered row heights (rowSizes) read before the first layout
	const [sizesReady, setSizesReady] = useState(false);
	useEffect(() => {
		let live = true;
		rowSizesReady().then(() => live && setSizesReady(true));
		return () => {
			live = false;
		};
	}, []);
	// Settled list → remember its row heights for the next launch
	useEffect(() => {
		const t = setTimeout(() => {
			const st = listRef.current?.getState();
			if (st) saveRowSizes(st.data as WatchlistListItem[], st.sizeAtIndex);
		}, 3000);
		return () => clearTimeout(t);
	}, [listData.length]);
	const [seenPromotions, setSeenPromotions] = useState(promotions);
	// Rows compared by their keys (order included): the list's array is rebuilt on every render
	const listKeys = useMemo(() => listData.map(keyOf).join("|"), [listData]);
	// After the opening scroll / a reorder the list may have moved its scroll without an event
	useEffect(() => {
		if (isLoading) return;
		const timers = STICKY_SYNC_MS.map((ms) => setTimeout(syncStickyScroll, ms));
		return () => timers.forEach(clearTimeout);
	}, [isLoading, listKeys, syncStickyScroll]);
	const [seenList, setSeenList] = useState(listKeys);
	const droppedSwipes = useRef<string[]>([]);
	useEffect(() => {
		const keys = droppedSwipes.current;
		if (keys.length === 0) return;
		droppedSwipes.current = [];
		for (const k of keys) releaseHeldSwipe(k);
	}, [listKeys]);
	// Each card's episode ("key:season-episode"), to spot one an unwatch moved back
	const cardEpisodes = useMemo(
		() =>
			listData
				.flatMap((i) =>
					i.type === "show"
						? [`${keyOf(i)}:${i.item.nextEpisode?.season ?? 0}-${i.item.nextEpisode?.episode ?? 0}`]
						: [],
				)
				.join("|"),
		[listData],
	);
	const [seenEpisodes, setSeenEpisodes] = useState(cardEpisodes);
	const [flipping, setFlipping] = useState<{ keys: ReadonlySet<string>; token: number } | null>(
		null,
	);
	const flipToken = useRef(0);
	if (seenEpisodes !== cardEpisodes) {
		const before = new Map(
			seenEpisodes
				.split("|")
				.filter(Boolean)
				.map((p) => {
					const at = p.lastIndexOf(":");
					return [p.slice(0, at), p.slice(at + 1)] as const;
				}),
		);
		setSeenEpisodes(cardEpisodes);
		const back = new Set<string>();
		for (const p of cardEpisodes.split("|").filter(Boolean)) {
			const at = p.lastIndexOf(":");
			const key = p.slice(0, at);
			const was = before.get(key);
			if (!was) continue;
			const [ps, pe] = was.split("-").map(Number);
			const [cs, ce] = p
				.slice(at + 1)
				.split("-")
				.map(Number);
			const item = listData.find((i) => keyOf(i) === key);
			if (item?.type !== "show" || !wasJustMarked(item.item.tmdbId)) continue;
			if (cs < ps || (cs === ps && ce < pe)) back.add(key);
		}
		if (back.size > 0) {
			flipToken.current += 1;
			setFlipping({ keys: back, token: flipToken.current });
		}
	}
	const [leaving, setLeaving] = useState<LeavingRow[]>([]);
	const [layoutMoving, setLayoutMoving] = useState(false);
	const [growing, setGrowing] = useState<{ keys: ReadonlySet<string>; token: number } | null>(null);
	const growToken = useRef(0);
	const [headerGlide, setHeaderGlide] = useState<HeaderMove | null>(null);
	if (seenPromotions !== promotions || seenList !== listKeys) {
		const promoted = seenPromotions !== promotions;
		setSeenPromotions(promotions);
		setSeenList(listKeys);
		const motion = listMotion(
			listRef.current,
			drawnRows.current,
			listData,
			promoted,
			wasJustMarked,
			listH,
		);
		// Same render as the new rows: the commit that moves them carries the glide
		if (motion.move) setLayoutMoving(true);
		if (motion.grow.size > 0 || motion.header) {
			growToken.current += 1;
			if (motion.grow.size > 0) setGrowing({ keys: motion.grow, token: growToken.current });
			if (motion.header) setHeaderGlide({ ...motion.header, token: growToken.current });
		}
		if (motion.leaving.length > 0) setLeaving((prev) => [...prev, ...motion.leaving]);
		// Rows the list dropped: a swipe banner one was held on clears (after this commit)
		const nextKeySet = new Set(listKeys.split("|"));
		for (const r of drawnRows.current) {
			if (nextKeySet.has(keyOf(r))) continue;
			if (r.type === "watchedEpisode") droppedSwipes.current.push(r.episode.id);
			else if (r.type === "watchedMovie")
				droppedSwipes.current.push(`${MediaType.MOVIE}_${r.movie.tmdbId}`);
		}
	}
	// A mark / unwatch just started: the glide is armed before its list change arrives (a few
	// frames for a mark, a network round trip for an unwatch), so the commit that moves the
	// cards already has it. Disarmed once the change has animated (layoutMoving) or after ARM_MS
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (listChangeArm === 0) return;
		setArmed(true);
		const t = setTimeout(() => setArmed(false), ARM_MS);
		return () => clearTimeout(t);
	}, [listChangeArm]);
	useEffect(() => {
		if (!layoutMoving) return;
		const t = setTimeout(() => {
			setLayoutMoving(false);
			setArmed(false);
		}, CARD_MOVE_MS + 200);
		return () => clearTimeout(t);
	}, [layoutMoving, listKeys]);
	const leftList = useCallback(
		(key: string) => setLeaving((prev) => prev.filter((c) => c.key !== key)),
		[],
	);
	// LegendList re-renders rows only when their data changes, so the glide rides in the rows
	const onViewableItemsChanged = useCallback(
		({ viewableItems }: { viewableItems: Array<{ item: ListRow }> }) =>
			onCardsVisible(
				viewableItems.flatMap(({ item }) => (item.type === "show" ? [item.item.tmdbId] : [])),
			),
		[onCardsVisible],
	);
	// The grow-in, shared by every growing row (they all start in the same commit): progress 0 → 1,
	// and the offset a card coming back under a header gliding up starts at (it rides along)
	const growP = useSharedValue(1);
	const growOffset = useSharedValue(0);
	const [growStarted, setGrowStarted] = useState<number | undefined>(undefined);
	const activeGrow = growing?.token;
	useLayoutEffect(() => {
		if (activeGrow === undefined) return;
		growP.value = 0;
		growP.value = withTiming(1, { duration: CARD_MOVE_MS, easing: CARD_MOVE_EASING });
		growOffset.value = headerGlide?.token === activeGrow ? headerGlide.from - headerGlide.to : 0;
		const frame = requestAnimationFrame(() => setGrowStarted(activeGrow));
		return () => cancelAnimationFrame(frame);
		// The header glide belongs to the token it came with
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeGrow, growP, growOffset]);
	const growStyle = useAnimatedStyle(() => ({
		opacity: growP.value,
		transform: [{ scale: ROW_GROW_FROM + (1 - ROW_GROW_FROM) * growP.value }],
	}));
	const growShiftStyle = useAnimatedStyle(() => ({
		opacity: growP.value,
		transform: [
			{ translateY: growOffset.value * (1 - growP.value) },
			{ scale: ROW_GROW_FROM + (1 - ROW_GROW_FROM) * growP.value },
		],
	}));
	// The unwatch flip, shared like the grow-in
	const flipDeg = useSharedValue(0);
	const [flipStarted, setFlipStarted] = useState<number | undefined>(undefined);
	const activeFlip = flipping?.token;
	useLayoutEffect(() => {
		if (activeFlip === undefined) return;
		flipDeg.value = FLIP_FROM_DEG;
		flipDeg.value = withTiming(0, { duration: CARD_MOVE_MS, easing: FLIP_EASING });
		const frame = requestAnimationFrame(() => setFlipStarted(activeFlip));
		return () => cancelAnimationFrame(frame);
	}, [activeFlip, flipDeg]);
	const flipStyle = useAnimatedStyle(() => ({
		transform: [{ perspective: 800 }, { rotateX: `${flipDeg.value}deg` }],
	}));
	// Only rows growing now carry an animated style; the rest are plain views
	const growStyleOf = useCallback(
		(item: ListRow) =>
			item.grow === undefined ? undefined : item.growShift ? growShiftStyle : growStyle,
		[growStyle, growShiftStyle],
	);
	const rows = useMemo<ListRow[]>(() => {
		if (!growing && !headerGlide && !flipping) return listData;
		const growWaiting = growing !== null && growStarted !== growing.token;
		const flipWaiting = flipping !== null && flipStarted !== flipping.token;
		return listData.map((i) => {
			const key = keyOf(i);
			if (flipping?.keys.has(key)) return { ...i, flipping: true, flipWaiting };
			if (growing?.keys.has(key)) {
				// Under a header gliding by: start where the header still is (growShiftStyle)
				const growShift = i.type === "show" && headerGlide?.token === growing.token;
				return { ...i, grow: growing.token, growShift, growWaiting };
			}
			if (headerGlide && key === UP_NEXT_KEY) return { ...i, hideHeader: true };
			return i;
		});
	}, [listData, growing, headerGlide, growStarted, flipping, flipStarted]);
	// Failsafe: the header copy / leaving rows never outlast their animation (a finish callback
	// that never comes — the view torn down mid-way — must not leave the real header hidden)
	useEffect(() => {
		if (!headerGlide) return;
		const t = setTimeout(() => setHeaderGlide(null), CARD_MOVE_MS + 300);
		return () => clearTimeout(t);
	}, [headerGlide]);
	useEffect(() => {
		if (leaving.length === 0) return;
		const t = setTimeout(() => setLeaving([]), CARD_MOVE_MS + 300);
		return () => clearTimeout(t);
	}, [leaving]);
	const headerGlideDone = useCallback(
		(token: number) => setHeaderGlide((g) => (g?.token === token ? null : g)),
		[],
	);

	const caughtUp = listData.some((i) => i.type === "caughtUp");
	// Up Next has shows and nothing more is coming: caught-up state as the list's footer
	const caughtUpFooter = listSettled && !caughtUp && listData.some((i) => i.type === "show");
	// Up-next / previously watched card long-pressed → confirm pausing it
	const [pauseTarget, setPauseTarget] = useState<EnrichedTrackingItem | null>(null);
	const [pausing, setPausing] = useState(false);
	const confirmPause = useCallback(async () => {
		if (!pauseTarget) return;
		setPausing(true);
		try {
			await handleStopWatching(pauseTarget);
			setPauseTarget(null);
		} catch (err) {
			console.error("pause failed:", err);
		} finally {
			setPausing(false);
		}
	}, [pauseTarget, handleStopWatching]);

	// Open at "What's Up Next" (previously watched sits above it, reached by scrolling up).
	// initialScrollIndex positions the list as it mounts (a timed scrollToIndex races the first layout).
	const upNextIndex = useMemo(
		() => listData.findIndex((i) => i.type === "sectionHeader" && i.title === "What's Up Next"),
		[listData],
	);
	const initialUpNext = useRef<number | null>(null);
	if (initialUpNext.current === null && !isLoading && listData.length > 0) {
		initialUpNext.current = Math.max(0, upNextIndex);
	}
	// A jump, not an animated scroll: on Android an animated scroll cut short (e.g. by a tab swipe)
	// can leave the ScrollView thinking it's still scrolling, and it then swallows every tap on the
	// list until it's scrolled again (cards stopped opening their info modal)
	const scrollToUpNext = useCallback(() => {
		if (upNextIndex > 0) {
			listRef.current?.scrollToIndex({ index: upNextIndex, animated: false, viewOffset: 0 });
		}
	}, [upNextIndex]);

	// Re-scroll on every tab focus
	useEffect(() => {
		const parent = navigation.getParent();
		if (!parent) return;
		const unsub = parent.addListener("focus", () => {
			if (prevWatchedOffset > 0) {
				setTimeout(scrollToUpNext, 100);
			}
		});
		return unsub;
	}, [navigation, prevWatchedOffset, scrollToUpNext]);

	const renderCaughtUp = useCallback(
		(minHeight?: number) => (
			<HomeEmpty
				art={CAUGHT_UP_ART}
				compact
				plainTitle
				minHeight={minHeight}
				title="Yay!"
				subtitle="You're all caught up."
				tagline="Now don't go getting productive on us. Add some more things to watch."
				onAddShows={() => navigation.navigate(Route.SWIPE_TABS, { screen: Route.SEARCH })}
			/>
		),
		[navigation],
	);

	const renderItem = useCallback(
		({ item }: { item: ListRow }) => {
			if (item.type === "sectionHeader") {
				// Hidden while its copy glides (HeaderGlide)
				return (
					<View style={item.hideHeader ? styles.growWaiting : undefined}>
						<SectionHeader title={item.title} />
					</View>
				);
			}

			if (item.type === "watchedMovie") {
				return (
					<GrowIn style={growStyleOf(item)} waiting={item.growWaiting}>
						<ShowCard
							item={
								{
									...item.show,
									nextEpisode: null,
									mediaType: MediaType.MOVIE,
									rewatchCount: item.show.rewatchCount ?? 0,
									director: item.show.catalogShow?.credits?.directors?.[0] ?? null,
								} as any
							}
							isWatched
							watchCount={item.movie.watchCount ?? 0}
							onSwipeLeft={() => handleMovieSwipeLeft(item.movie)}
							onSwipeRight={() => handleMovieSwipeRight(item.movie)}
							onLongPress={canPause(item.show) ? () => setPauseTarget(item.show) : undefined}
							onPress={(id) => handleNavigateToShow(id, MediaType.MOVIE)}
							onCheckmark={async () => handleMovieCheckmark(item.movie, item.show.title)}
						/>
					</GrowIn>
				);
			}

			if (item.type === "watchedEpisode") {
				return (
					<GrowIn style={growStyleOf(item)} waiting={item.growWaiting}>
						<WatchedEpisodeRow
							episode={item.episode}
							show={item.show}
							onPress={handleWatchedRowPress}
							onCheckmarkPress={handleWatchedCheckmark}
							onSwipeLeft={handleWatchedSwipeLeft}
							onSwipeRight={handleWatchedSwipeRight}
							onLongPress={canPause(item.show) ? setPauseTarget : undefined}
						/>
					</GrowIn>
				);
			}

			if (item.type === "caughtUp") {
				// Fills the list under the pinned "What's Up Next" header, so it can't scroll off
				return renderCaughtUp(Math.max(0, listH - SECTION_HEADER_H));
			}

			// All fields pre-computed in useWatchlistData — no catalog lookup needed
			return (
				// Grows in when an unwatch brings the card back (listMotion)
				<FlipIn style={item.flipping ? flipStyle : undefined} waiting={item.flipWaiting}>
					<GrowIn style={growStyleOf(item)} waiting={item.growWaiting}>
						<ShowCard
							item={item.item}
							isUpdating={updatingShows.has(item.item.tmdbId)}
							remainingEpisodes={(item.item as any).remaining ?? null}
							onSwipeLeft={handleMarkWatched}
							// Pausing is a long press + confirm (no swipe — too easy to trigger by accident)
							onLongPress={setPauseTarget}
							onPress={handleCardPress}
							onTitlePress={handleTitlePress}
							onCheckmark={handleMarkWatched}
						/>
					</GrowIn>
				</FlipIn>
			);
		},
		[
			handleMarkWatched,
			handleCardPress,
			handleTitlePress,
			handleWatchedRowPress,
			watchedCountByShow,
			updatingShows,
			handleWatchedCheckmark,
			handleWatchedSwipeLeft,
			handleWatchedSwipeRight,
			handleMovieCheckmark,
			handleMovieSwipeLeft,
			handleMovieSwipeRight,
			renderCaughtUp,
			growStyleOf,
			flipStyle,
			listH,
		],
	);

	// Room to scroll "What's Up Next" to the top. Caught up: exactly the list's own height, so the
	// pinned header + empty state stop there instead of scrolling on into blank space
	const contentStyle = useMemo(
		() => [
			styles.listContent,
			{ minHeight: (caughtUp && listH > 0 ? listH : SCREEN_HEIGHT) + prevWatchedOffset },
		],
		[prevWatchedOffset, caughtUp, listH],
	);

	const stickyIndices = useMemo(
		() =>
			listData.reduce<number[]>((acc, item, i) => {
				if (item.type === "sectionHeader") acc.push(i);
				return acc;
			}, []),
		[listData],
	);

	if (isLoading || !sizesReady) {
		return (
			<View style={styles.center}>
				<LoadingSpinner />
			</View>
		);
	}

	if (listData.length === 0) {
		return (
			<HomeEmpty
				art={WELCOME_ART}
				title="Welcome"
				subtitle="Not tracking a thing yet? Now that's bad television."
				tagline="Your couch is ready, and that free time won't waste itself. You're welcome."
				onAddShows={() => navigation.navigate(Route.SWIPE_TABS, { screen: Route.SEARCH })}
			/>
		);
	}

	return (
		<>
			{/* Reanimated variant for its sticky headers: the plain list's don't pin on the new
			    architecture. Its itemLayoutAnimation glides card moves after a mark (CARD_LAYOUT) */}
			<AnimatedLegendList
				ref={listRef}
				data={rows}
				initialScrollIndex={initialUpNext.current ?? 0}
				keyExtractor={keyOf}
				renderItem={renderItem}
				recycleItems
				sharedValues={sharedValues}
				getFixedItemSize={rememberedRowSize}
				itemLayoutAnimation={layoutMoving || armed ? CARD_LAYOUT : CARD_LAYOUT_INSTANT}
				drawDistance={SCREEN_HEIGHT * 2}
				estimatedItemSize={110}
				stickyHeaderIndices={stickyIndices}
				onScrollBeginDrag={() => {
					releaseHeld();
					releasePinned();
					setArmed(false);
				}}
				// Heals (missing poster / episode name…) run only for cards kept on screen
				onViewableItemsChanged={onViewableItemsChanged}
				viewabilityConfig={CARD_VIEWABILITY}
				refreshControl={
					hasMorePrevWatched ? (
						<RefreshControl
							refreshing={loadingMorePrevWatched}
							onRefresh={loadMorePrevWatched}
							tintColor={colors.primary}
							colors={[colors.primary]}
							progressBackgroundColor={colors.surface}
						/>
					) : undefined
				}
				// Caught up: nothing more to page in (scrolling the empty state kept refetching)
				onEndReached={caughtUp ? undefined : () => loadMoreTracking()}
				onEndReachedThreshold={1.5}
				ListFooterComponent={
					// Skeletons until it's confirmed nothing more is coming, then the image + message
					!listSettled ? (
						<SkeletonFooter />
					) : caughtUpFooter ? (
						<View style={styles.caughtUpFooter}>{renderCaughtUp()}</View>
					) : null
				}
				ItemSeparatorComponent={SeparatorComponent}
				maintainVisibleContentPosition={{ data: true, size: true }}
				style={styles.list}
				onLayout={(e) => setListH(e.nativeEvent.layout.height)}
				contentContainerStyle={contentStyle}
			/>
			{leaving.map((card) => (
				<LeavingGhost key={card.key} card={card} onDone={leftList}>
					{card.row.type === "show" ? (
						// A card leaving for Previously Watched: already in its watched look
						<ShowCard
							item={card.row.item}
							isWatched
							watchCount={1}
							onSwipeLeft={noopAsync}
							onPress={noop}
							onCheckmark={noopAsync}
						/>
					) : isSwipedOff(card.key) ? (
						// Swiped off (unwatched): the blue banner it waited on is what shrinks away
						<SwipeActionBanner
							color={colors.stopBlue}
							label="Unwatch"
							minHeight={Math.max(0, card.h - spacing.sm)}
						/>
					) : (
						renderItem({ item: card.row })
					)}
				</LeavingGhost>
			))}
			{/* Over the leaving rows: the header glides over a card shrinking under it */}
			{headerGlide && <HeaderGlide glide={headerGlide} onDone={headerGlideDone} />}
			<WatchCountSheet
				visible={sheetVisible}
				title={sheetShow?.title || ""}
				// SEASON / Exx sit in the square beside the logo; the name stays under it
				subtitle={sheetEpisode?.episodeTitle}
				episode={
					sheetEpisode ? { season: sheetEpisode.season, episode: sheetEpisode.episode } : undefined
				}
				centered={false}
				tmdbId={sheetEpisode?.tmdbShowId}
				mediaType={MediaType.TV}
				logoPath={sheetShow?.logoPath}
				watchCount={sheetEpisode?.watchCount || 0}
				allowWatchedOnce={!sheetInRewatch}
				minCount={sheetMinCount}
				onCommit={handleEpisodeCountCommit}
				onClose={() => {
					setSheetVisible(false);
					setSheetEpisode(null);
				}}
			/>
			<ConfirmModal
				visible={!!pauseTarget}
				title={pauseTarget?.status === WatchStatus.REWATCHING ? "Pause Rewatch?" : "Pause Show?"}
				imageAtTop={!!pauseTarget?.catalogShow?.backdropPath}
				hideTitle
				image={
					!pauseTarget ? undefined : pauseTarget.catalogShow?.backdropPath ? (
						<ModalBackdrop
							backdropPath={pauseTarget.catalogShow.backdropPath}
							logoPath={pauseTarget.catalogShow.logoPath}
							tmdbId={pauseTarget.tmdbId}
							mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused
							nameDelay={2000}
						/>
					) : (
						<ModalLogo
							logoPath={pauseTarget.catalogShow?.logoPath}
							tmdbId={pauseTarget.tmdbId}
							mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused
							nameDelay={2000}
						/>
					)
				}
				hint={
					pauseTarget?.status === WatchStatus.REWATCHING
						? "Pausing this rewatch will take it off your watchlist. You can resume it any time from its page."
						: "Pausing this show will take it off your watchlist. You can resume it any time from its page."
				}
				confirmLabel="Pause"
				confirmColor={colors.stopBlue}
				loading={pausing}
				onConfirm={confirmPause}
				onClose={() => setPauseTarget(null)}
			/>
			<WatchCountSheet
				visible={movieSheetVisible}
				title={sheetMovieTitle || "Movie"}
				// No episode square → logo alone, centred (as on the info page)
				tmdbId={sheetMovie?.tmdbId}
				mediaType={MediaType.MOVIE}
				watchCount={sheetMovie?.watchCount || 0}
				onCommit={handleMovieCountCommit}
				onClose={() => {
					setMovieSheetVisible(false);
					setSheetMovie(null);
				}}
			/>
			{epModalData && (
				<EpisodeDetailModal
					visible={epModalVisible}
					tmdbId={epModalData.tmdbId}
					showTitle={epModalData.showTitle}
					showPosterPath={epModalData.showPosterPath}
					showBackdropPath={epModalData.showBackdropPath}
					episodes={epModalData.episodes}
					initialIndex={epModalData.initialIndex}
					watchedKeys={epModalData.watchedKeys}
					currentNextEpisode={epModalData.currentNextEpisode}
					rewatchCount={epModalData.rewatchCount}
					onMarkWatched={handleCarouselMarkWatched}
					onMarkWatchedThrough={handleMarkWatchedThrough}
					onUnmarkWatched={handleUnmarkEpisode}
					onSkipEpisode={epModalData.isRewatching ? handleModalSkip : undefined}
					onShowPress={handleEpModalShowPress}
					onClose={() => {
						setEpModalVisible(false);
						setEpModalData(null);
					}}
					onLoadEpisodeDetails={handleLoadEpisodeDetails}
				/>
			)}
			<ShowDrawer
				visible={drawerVisible}
				show={drawerShow}
				onGoToShow={
					drawerShow?.tmdbId
						? () => {
								const id = drawerShow.tmdbId!;
								const mt = drawerShow.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV;
								setDrawerVisible(false);
								setDrawerShow(null);
								handleNavigateToShow(id, mt);
							}
						: undefined
				}
				onClose={() => {
					setDrawerVisible(false);
					setDrawerShow(null);
				}}
			/>
		</>
	);
}
