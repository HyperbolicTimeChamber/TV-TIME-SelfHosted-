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
import { useNavigation, CompositeNavigationProp } from "@react-navigation/native";
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
import { CARD_RADIUS, WatchlistRemountKind } from "../../../enums";
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
import {
	noteDragEnd,
	noteLaunchStep,
	noteRowsChange,
	noteScrollOffset,
	noteUserScroll,
	noteWatchlistMount,
} from "../../../utils/remountDiagnostics";

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
		borderRadius: CARD_RADIUS,
		backgroundColor: colors.border,
	},
});

/** On-screen movement → ease-in-out; quick enough to read as a response to the tap */
const CARD_MOVE_MS = 400;
const CARD_MOVE_EASING = Easing.bezier(0.77, 0, 0.175, 1);

type ListRow = WatchlistListItem & {
	/** A card coming back on screen zooms in (CardMotion); the run's token */
	grow?: number;
	hideHeader?: boolean;
	/** A Previously Watched row a mark just added: it zooms in (RowZoom) while the rows under it
	 *  (and the "What's Up Next" header) glide down */
	zoomIn?: { token: number };
	/** An unwatch just moved this card's episode back: it flips over (CardMotion); the run's token */
	flipping?: number;
};
/** Unwatch flip: from edge-on (rotateX 90°) to flat, strong ease-out */
const FLIP_FROM_DEG = 90;
const FLIP_EASING = Easing.bezier(0.23, 1, 0.32, 1);
/** The "What's Up Next" header's move (list coordinates) while a row grows in above it */
type HeaderMove = { from: number; to: number; token: number };
/**
 * Row moves: they glide (CARD_LAYOUT) only around a mark / unwatch and its animations; any other
 * reorder (the cold open replacing cached rows with live ones) applies at once
 * (CARD_LAYOUT_INSTANT), or the cards shuffled on every launch. The patched LegendList glides a
 * row by a translate from its old place (FLIP), reading only these transitions' duration and
 * easing — Reanimated layout transitions on its recycled containers left views at stale
 * positions (rows on top of each other, blank slots)
 */
const CARD_LAYOUT = LinearTransition.duration(CARD_MOVE_MS).easing(CARD_MOVE_EASING);
const CARD_LAYOUT_INSTANT = LinearTransition.duration(0);
/** How long a mark / unwatch keeps the glide on while its list change is on the way */
const GLIDE_ARM_MS = 6000;
/** When the pinned headers re-read the list's scroll after it may have moved (stickyScroll) */
const STICKY_SYNC_MS = [0, 150, 500];

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
/** The list's top padding (styles.listContent): LegendList positions start under it */
const LIST_PAD_TOP = spacing.sm;

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
	noAnchor?: boolean;
} {
	const grow = new Set<string>();
	const leaving: LeavingRow[] = [];
	const header: { from: number; to: number } | null = null;
	const state = list?.getState();
	if (!state || prev.length === 0 || listH === 0) {
		return { move: promoted, grow, leaving, header };
	}
	const nextKeys = new Set(next.map(keyOf));
	const prevKeys = new Set(prev.map(keyOf));
	// A mark lifted a card while scrolled past the top of "What's Up Next": it lands above the
	// view. The list doesn't hold the view on it (noAnchor) — the rows above the card's slot
	// glide down into it, the rows under it stay, and the scroll doesn't move. Compensating the
	// scroll instead landed a frame late and every row jumped
	if (promoted && !upNextTopOnScreen(list)) {
		return { move: true, grow, leaving, header, noAnchor: true };
	}
	const changed = (i: WatchlistListItem) => {
		const id = rowTmdbId(i);
		return id !== null && wasJustChanged(id);
	};
	const clipTop = upNextOnScreen(list) ? SECTION_HEADER_H : 0;

	for (const d of prev) {
		const key = keyOf(d);
		if (nextKeys.has(key) || !changed(d)) continue;
		const pos = state.positionByKey(key);
		if (pos === undefined) continue;
		const h = state.sizeAtIndex(prev.indexOf(d));
		// On screen: under the list's top padding (left out, the copy sat a gap too high and
		// touched the row above)
		const y = pos - state.scroll + LIST_PAD_TOP;
		if (y + h <= clipTop || y >= listH) continue;
		leaving.push({ key, row: d, y, h, clipTop });
	}

	for (const a of next) {
		const key = keyOf(a);
		if (prevKeys.has(key)) continue;
		// Only rows / cards of a title just marked or unwatched: rows and cards also arrive with
		// pages and the first load, and those must not animate
		if (!changed(a)) continue;
		const below = next[next.indexOf(a) + 1];
		const belowPos = below ? state.positionByKey(keyOf(below)) : undefined;
		const belowY = belowPos === undefined ? -1 : belowPos - state.scroll;
		if (!(belowY > 0 && belowY < listH)) continue;
		// A Previously Watched row zooms in in RowZoom instead
		if (isWatchedRow(a)) continue;
		grow.add(key);
	}
	return {
		move: promoted || leaving.length > 0 || grow.size > 0,
		grow,
		leaving,
		header,
	};
}

/** A leaving row (LeavingRow): zooms out to nothing at the centre of its closing slot — the
 *  zoom-in reversed. Its backing closes with it (height → 0, same time and curve as the rows
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
	// Zooms out evenly (its shape kept), scaled to the closing room and centred in it
	const shrink = useAnimatedStyle(() => ({
		opacity: 1 - t.value,
		transform: [{ translateY: (-card.h * t.value) / 2 }, { scale: 1 - t.value }],
	}));
	return (
		<View style={[styles.leavingClip, { top: card.clipTop }]} pointerEvents="none">
			<Reanimated.View style={[styles.leavingCard, { top: card.y - card.clipTop }, close]}>
				<Reanimated.View style={[styles.zoomCentre, shrink]}>{children}</Reanimated.View>
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
 *  than the pinned header's own spot. Scrolled past it, the card lands above the view: see
 *  listMotion's noAnchor */
function upNextTopOnScreen(list: LegendListRef | null): boolean {
	const state = list?.getState();
	const top = state?.positionByKey(UP_NEXT_KEY);
	// Up to a header's height past it: the list opens a few px past the header's own spot
	// (content padding), and the first card is still in view right under the pinned header
	return !!state && top !== undefined && state.scroll <= top + SECTION_HEADER_H;
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
 * A Previously Watched row a mark just added. It takes its full slot at once (the rows under it
 * move down with it) and its card zooms in from the slot's centre — evenly, its shape kept.
 * Animated styles that stay attached for the row's whole life, from a value set at mount: entering
 * (layout) animations inside the list froze part-way — a row left shrunk, rows on top of each other
 */
function RowZoom({
	zoomIn,
	children,
}: Readonly<{ zoomIn?: ListRow["zoomIn"]; children: ReactNode }>) {
	// Only a row mounted by its mark zooms
	const [zooming] = useState(zoomIn !== undefined);
	const v = useSharedValue(zooming ? 0 : 1);
	// The row's height: the rows under it glide down by it, opening the gap it zooms into
	const height = useSharedValue(0);
	useLayoutEffect(() => {
		if (zooming) v.value = withTiming(1, { duration: CARD_MOVE_MS, easing: CARD_MOVE_EASING });
	}, [zooming, v]);
	// Scaled to the gap opened so far (same timing as the glide) and centred in it — evenly, its
	// shape kept — so it never covers the rows under it
	const zoom = useAnimatedStyle(() => ({
		opacity: v.value,
		transform: [{ translateY: (-height.value * (1 - v.value)) / 2 }, { scale: v.value }],
	}));
	return (
		<View collapsable={false}>
			<Reanimated.View
				style={[styles.zoomCentre, zoom]}
				onLayout={(e) => {
					height.value = e.nativeEvent.layout.height;
				}}
			>
				{children}
			</Reanimated.View>
		</View>
	);
}
/** RowZoom's key: the row, plus its zoom run. The run's animated style starts at opacity 0 and
 *  React re-applies that start value whenever the row re-renders (the flag clearing re-renders
 *  it) — the zoomed-in row went invisible. When the run ends the row gets a fresh, plain RowZoom */
const rowZoomKey = (item: ListRow) => `${keyOf(item)}|${item.zoomIn?.token ?? ""}`;

/**
 * Card wrapper for a card coming back (grows in) or flipping over (an unwatch moved its episode
 * back, so nothing else showed it changed). Keyed by the run (cardMotionKey), with an animated
 * style attached for the view's whole life from a value set at mount — a style dropped mid-run
 * left its pose (a card stuck edge-on, a blank slot), and entering animations froze in the list
 */
function CardMotion({ item, children }: Readonly<{ item: ListRow; children: ReactNode }>) {
	const [mode] = useState(
		item.flipping !== undefined
			? CardMotionMode.FLIP
			: item.grow !== undefined
				? CardMotionMode.GROW
				: null,
	);
	const v = useSharedValue(mode ? 0 : 1);
	// The card's height: the cards under it glide down by it, opening the gap it grows into
	const height = useSharedValue(0);
	useLayoutEffect(() => {
		if (!mode) return;
		const easing = mode === CardMotionMode.FLIP ? FLIP_EASING : CARD_MOVE_EASING;
		v.value = withTiming(1, { duration: CARD_MOVE_MS, easing });
	}, [mode, v]);
	const style = useAnimatedStyle(() =>
		mode === CardMotionMode.FLIP
			? {
					transform: [{ perspective: 800 }, { rotateX: `${FLIP_FROM_DEG * (1 - v.value)}deg` }],
				}
			: // Scaled to the gap opened so far, centred in it (as RowZoom): never over the cards
				// gliding down under it
				{
					opacity: v.value,
					transform: [{ translateY: (-height.value * (1 - v.value)) / 2 }, { scale: v.value }],
				},
	);
	return (
		<Reanimated.View
			style={[styles.zoomCentre, style]}
			onLayout={(e) => {
				height.value = e.nativeEvent.layout.height;
			}}
		>
			{children}
		</Reanimated.View>
	);
}
enum CardMotionMode {
	GROW = "grow",
	FLIP = "flip",
}
const cardMotionKey = (item: ListRow) =>
	item.flipping !== undefined
		? `flip${item.flipping}`
		: item.grow !== undefined
			? `grow${item.grow}`
			: "card";

/** Remembered row heights (rowSizes) */
const fixedRowSize = (item: ListRow) => rememberedRowSize(item);

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
		rewatchFloor,
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
		listChangeArm,
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
		handleRemoveFromWatchlist,
		handleMarkWatchedThrough,
		handleUnmarkEpisode,
		handleCarouselMarkWatched,
		isSwipedOff,
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

	const drawnRows = useRef<readonly WatchlistListItem[]>([]);
	const listData = fullData;

	// The rows as last drawn: a reorder's glide starts from their layout
	useEffect(() => {
		drawnRows.current = listData;
	}, [listData]);
	// A mark lifting a card: each moved card glides from where it was drawn. Read during render —
	// the list still holds the old layout until this render commits
	const [listH, setListH] = useState(0);
	// The scroll the pinned headers follow. Fed by scroll events — but the list's opening scroll
	// to "What's Up Next" sent none, so "What's Up Next" sat at its unpinned spot (above the
	// view) until the first drag. Synced from the list's own scroll whenever it may have moved —
	// only while no scroll event has come in since: the list's own scroll trails the real one
	// while it moves, and written over a newer event's value it pinned the header too high (gone
	// or half under the tabs) until the next scroll
	const stickyScroll = useSharedValue(0);
	const sharedValues = useMemo(() => ({ scrollOffset: stickyScroll }), [stickyScroll]);
	/** stickyScroll as of the list change being synced (or our last write): a scroll event since
	 *  changed it */
	const stickySeen = useRef(0);
	const syncStickyScroll = useCallback(() => {
		if (stickyScroll.value !== stickySeen.current) return;
		const scroll = listRef.current?.getState().scroll;
		if (scroll !== undefined && Math.abs(scroll - stickyScroll.value) > 0.5) {
			stickyScroll.value = scroll;
			stickySeen.current = scroll;
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
		stickySeen.current = stickyScroll.value;
		const timers = STICKY_SYNC_MS.map((ms) => setTimeout(syncStickyScroll, ms));
		return () => timers.forEach(clearTimeout);
	}, [isLoading, listKeys, syncStickyScroll, stickyScroll]);
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
	// This reorder's rows keep their positions (no scroll compensation): see listMotion
	const [noAnchor, setNoAnchor] = useState(false);

	const [growing, setGrowing] = useState<{ keys: ReadonlySet<string>; token: number } | null>(null);
	const growToken = useRef(0);
	const [headerGlide, setHeaderGlide] = useState<HeaderMove | null>(null);
	const [opening, setOpening] = useState<{
		keys: ReadonlySet<string>;
		token: number;
	} | null>(null);
	const zoomToken = useRef(0);
	// While a row zooms in / out the list doesn't hold the view still: its correction trailed the
	// rows (they drifted, then were pulled back — a shake). The view drifts with them and stays
	const rowsMoving = opening !== null || leaving.length > 0;
	const mvcp = useMemo(
		() => ({ data: !noAnchor && !rowsMoving, size: !rowsMoving }),
		[noAnchor, rowsMoving],
	);
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
		// On only: the list change right behind it (the card's patch) mustn't switch it off before
		// the list has applied the reorder; it clears with the glide
		if (motion.noAnchor) setNoAnchor(true);
		// Same render as the new rows: the commit that moves them carries the glide
		if (motion.move) setLayoutMoving(true);
		if (motion.grow.size > 0 || motion.header) {
			growToken.current += 1;
			if (motion.grow.size > 0) setGrowing({ keys: motion.grow, token: growToken.current });
			if (motion.header) setHeaderGlide({ ...motion.header, token: growToken.current });
		}
		// Two renders can see the same departure before drawnRows catches up: one copy per row
		if (motion.leaving.length > 0) {
			setLeaving((prev) => [
				...prev,
				...motion.leaving.filter((l) => !prev.some((p) => p.key === l.key)),
			]);
		}
		// A Previously Watched row a mark just added zooms in (RowZoom); one an unwatch took off
		// leaves as a LeavingGhost (listMotion)
		const prevRows = drawnRows.current;
		const nextKeySet = new Set(listKeys.split("|"));
		const prevKeySet = new Set(prevRows.map(keyOf));
		const opened = listData.filter((r) => {
			const id = rowTmdbId(r);
			return (
				isWatchedRow(r) &&
				!prevKeySet.has(keyOf(r)) &&
				id !== null &&
				wasJustMarked(id) &&
				prevRows.length > 0
			);
		});
		if (opened.length > 0) {
			zoomToken.current += 1;
			setLayoutMoving(true);
			setOpening({ keys: new Set(opened.map(keyOf)), token: zoomToken.current });
		}
		// Rows the list dropped: a swipe banner one was held on clears (after this commit)
		for (const r of prevRows) {
			if (nextKeySet.has(keyOf(r))) continue;
			if (r.type === "watchedEpisode") droppedSwipes.current.push(r.episode.id);
			else if (r.type === "watchedMovie")
				droppedSwipes.current.push(`${MediaType.MOVIE}_${r.movie.tmdbId}`);
		}
	}
	// The glide (CARD_LAYOUT) is on from a mark / unwatch until its animations are over
	const [armed, setArmed] = useState(false);
	useEffect(() => {
		if (listChangeArm === 0) return;
		setArmed(true);
		const t = setTimeout(() => setArmed(false), GLIDE_ARM_MS);
		return () => clearTimeout(t);
	}, [listChangeArm]);
	const glideOn =
		armed ||
		layoutMoving ||
		opening !== null ||
		leaving.length > 0 ||
		growing !== null ||
		flipping !== null;
	// A reorder's no-anchor holds until its glide is over
	useEffect(() => {
		if (!layoutMoving) return;
		const t = setTimeout(() => {
			setLayoutMoving(false);
			setNoAnchor(false);
		}, CARD_MOVE_MS + 200);
		return () => clearTimeout(t);
	}, [layoutMoving, listKeys]);
	// Rows open / close only once card glides are over: a height changing under the glide's
	// layout transition left the rows trailing the list's scroll steps — the cards drifted, then
	// snapped. So a mark moves its card first, then its Previously Watched row opens
	// The zoom-in flags clear once the zoom is over (its header copy goes, the real one returns)
	useEffect(() => {
		if (!opening) return;
		const t = setTimeout(() => setOpening(null), CARD_MOVE_MS + 200);
		return () => clearTimeout(t);
	}, [opening]);
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
	// A card's grow / flip runs once: its flag clears after (the card gets a plain view again —
	// cardMotionKey), so scrolling back to it doesn't replay it
	useEffect(() => {
		if (!growing) return;
		const t = setTimeout(() => setGrowing(null), CARD_MOVE_MS + 200);
		return () => clearTimeout(t);
	}, [growing]);
	useEffect(() => {
		if (!flipping) return;
		const t = setTimeout(() => setFlipping(null), CARD_MOVE_MS + 200);
		return () => clearTimeout(t);
	}, [flipping]);
	const rows = useMemo<ListRow[]>(() => {
		if (!growing && !headerGlide && !flipping && !opening) return listData;
		return listData.map((i) => {
			const key = keyOf(i);
			if (flipping?.keys.has(key)) return { ...i, flipping: flipping.token };
			if (opening?.keys.has(key)) {
				return { ...i, zoomIn: { token: opening.token } };
			}
			if (growing?.keys.has(key)) {
				return { ...i, grow: growing.token };
			}
			// Hidden while its copy glides (HeaderGlide)
			if (headerGlide && key === UP_NEXT_KEY) return { ...i, hideHeader: true };
			return i;
		});
	}, [listData, growing, headerGlide, flipping, opening]);
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
	// A movie up next (first watch) has nothing to pause: its long press removes it instead
	const removingMovie = pauseTarget?.mediaType === MediaType.MOVIE;
	const [pausing, setPausing] = useState(false);
	const confirmPause = useCallback(async () => {
		if (!pauseTarget) return;
		setPausing(true);
		try {
			if (removingMovie) await handleRemoveFromWatchlist(pauseTarget);
			else await handleStopWatching(pauseTarget);
			setPauseTarget(null);
		} catch (err) {
			console.error("pause failed:", err);
		} finally {
			setPausing(false);
		}
	}, [pauseTarget, removingMovie, handleStopWatching, handleRemoveFromWatchlist]);

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
			noteLaunchStep(`scrollToUpNext:${upNextIndex}`);
			listRef.current?.scrollToIndex({ index: upNextIndex, animated: false, viewOffset: 0 });
		}
	}, [upNextIndex]);

	// Re-scroll when the user comes back to the Home tab. Only after a blur: the tab's first focus
	// lands seconds after launch (initialScrollIndex already placed the list) and yanked a list
	// the user was already scrolling back to "What's Up Next"
	const leftTab = useRef(false);
	useEffect(() => {
		const parent = navigation.getParent();
		if (!parent) return;
		const unsubBlur = parent.addListener("blur", () => {
			noteLaunchStep("nav:blur");
			leftTab.current = true;
		});
		const unsubFocus = parent.addListener("focus", () => {
			noteLaunchStep(`nav:focus${leftTab.current ? " (after blur)" : ""}`);
			if (!leftTab.current) return;
			leftTab.current = false;
			if (prevWatchedOffset > 0) {
				setTimeout(scrollToUpNext, 100);
			}
		});
		return () => {
			unsubBlur();
			unsubFocus();
		};
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
					<View style={item.hideHeader ? styles.growWaiting : undefined} pointerEvents="box-none">
						<SectionHeader title={item.title} />
					</View>
				);
			}

			if (item.type === "watchedMovie") {
				return (
					<RowZoom key={rowZoomKey(item)} zoomIn={item.zoomIn}>
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
					</RowZoom>
				);
			}

			if (item.type === "watchedEpisode") {
				return (
					<RowZoom key={rowZoomKey(item)} zoomIn={item.zoomIn}>
						<WatchedEpisodeRow
							episode={item.episode}
							show={item.show}
							onPress={handleWatchedRowPress}
							onCheckmarkPress={handleWatchedCheckmark}
							onSwipeLeft={handleWatchedSwipeLeft}
							// At its rewatch floor (the watch belongs to an earlier run) a row can't be
							// unwatched: no Unwatch swipe at all — it goes when the count reaches the floor
							onSwipeRight={
								(item.episode.watchCount || 0) > rewatchFloor(item.episode.tmdbShowId)
									? handleWatchedSwipeRight
									: undefined
							}
							onLongPress={canPause(item.show) ? setPauseTarget : undefined}
						/>
					</RowZoom>
				);
			}

			if (item.type === "caughtUp") {
				// Fills the list under the pinned "What's Up Next" header, so it can't scroll off
				return renderCaughtUp(Math.max(0, listH - SECTION_HEADER_H));
			}

			// All fields pre-computed in useWatchlistData — no catalog lookup needed
			return (
				// Grows in when an unwatch brings the card back, flips when it moved its episode back
				<CardMotion key={cardMotionKey(item)} item={item}>
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
				</CardMotion>
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
			rewatchFloor,
			handleMovieCheckmark,
			handleMovieSwipeLeft,
			handleMovieSwipeRight,
			renderCaughtUp,
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

	// TEMPORARY (utils/remountDiagnostics): this tab's mounts, and its view (loading / empty /
	// list) as it changes — the list mounting again means it was rebuilt
	useEffect(() => noteWatchlistMount(WatchlistRemountKind.TAB), []);
	const view = isLoading || !sizesReady ? "loading" : listData.length === 0 ? "empty" : "list";
	useEffect(() => {
		noteLaunchStep(`watchlist:${view}`);
		if (view === "list") noteWatchlistMount(WatchlistRemountKind.LIST);
	}, [view]);
	// TEMPORARY: the rows as they change (a jump right after one points at it)
	useEffect(() => {
		noteRowsChange(`${listData.length} first:${listData[0] ? keyOf(listData[0]) : "-"}`);
	}, [listKeys, listData]);

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
			    architecture. Its itemLayoutAnimation glides row moves around a mark (CARD_LAYOUT) */}
			<AnimatedLegendList
				ref={listRef}
				data={rows}
				initialScrollIndex={initialUpNext.current ?? 0}
				keyExtractor={keyOf}
				renderItem={renderItem}
				recycleItems
				sharedValues={sharedValues}
				getFixedItemSize={fixedRowSize}
				itemLayoutAnimation={glideOn ? CARD_LAYOUT : CARD_LAYOUT_INSTANT}
				drawDistance={SCREEN_HEIGHT * 2}
				estimatedItemSize={110}
				stickyHeaderIndices={stickyIndices}
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
				maintainVisibleContentPosition={mvcp}
				// TEMPORARY (utils/remountDiagnostics): scroll moves the finger didn't make
				onScroll={(e) => noteScrollOffset(e.nativeEvent.contentOffset.y)}
				onScrollBeginDrag={() => noteUserScroll(true)}
				onScrollEndDrag={noteDragEnd}
				onMomentumScrollBegin={() => noteUserScroll(true)}
				onMomentumScrollEnd={() => noteUserScroll(false)}
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
				title={
					removingMovie
						? "Remove Movie?"
						: pauseTarget?.status === WatchStatus.REWATCHING
							? "Pause Rewatch?"
							: "Pause Show?"
				}
				drawer
				question={
					removingMovie
						? "Do You Want to Remove This Movie?"
						: pauseTarget?.status === WatchStatus.REWATCHING
							? "Do You Want to Pause This Rewatch?"
							: "Do You Want to Pause This Show?"
				}
				slideLabel={removingMovie ? "Slide to Remove" : "Slide to Pause"}
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
							paused={!removingMovie}
							removed={removingMovie}
							nameDelay={2000}
						/>
					) : (
						<ModalLogo
							logoPath={pauseTarget.catalogShow?.logoPath}
							tmdbId={pauseTarget.tmdbId}
							mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused={!removingMovie}
							nameDelay={2000}
						/>
					)
				}
				hint={
					removingMovie
						? "This will remove it from your watchlist. Your watch history will be kept."
						: pauseTarget?.status === WatchStatus.REWATCHING
							? "Pausing this rewatch will take it off your watchlist. You can resume it any time from its page."
							: "Pausing this show will take it off your watchlist. You can resume it any time from its page."
				}
				confirmLabel={removingMovie ? "Remove" : "Pause"}
				confirmColor={removingMovie ? colors.primary : colors.stopBlue}
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
