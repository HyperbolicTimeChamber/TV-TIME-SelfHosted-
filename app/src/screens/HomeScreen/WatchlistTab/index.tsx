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
	/** A Previously Watched row opening (height 0 → full) or closing (→ 0, then dropped):
	 *  RowHeight. The token restarts it once */
	height?: { mode: RowHeightMode; token?: number };
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
		const y = pos - state.scroll;
		if (y + h <= clipTop || y >= listH) continue;
		// Previously Watched rows close in place (RowHeight), no copy
		if (!isWatchedRow(d)) leaving.push({ key, row: d, y, h, clipTop });
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
		// Shown: it also grows in (scale / fade) as it opens (RowHeight)
		grow.add(key);
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
 *  than the pinned header's own spot. Scrolled past it, the card lands above the view: see
 *  listMotion's noAnchor */
function upNextTopOnScreen(list: LegendListRef | null): boolean {
	const state = list?.getState();
	const top = state?.positionByKey(UP_NEXT_KEY);
	// Up to a header's height past it: the list opens a few px past the header's own spot
	// (content padding), and the first card is still in view right under the pinned header
	return !!state && top !== undefined && state.scroll <= top + SECTION_HEADER_H;
}

/** The list with closing Previously Watched rows put back after the row they followed */
function withClosing(
	data: WatchlistListItem[],
	closing: readonly { row: WatchlistListItem; afterKey: string | null }[],
): WatchlistListItem[] {
	if (closing.length === 0) return data;
	const out = [...data];
	for (const c of closing) {
		if (out.some((r) => keyOf(r) === keyOf(c.row))) continue;
		const at = c.afterKey === null ? -1 : out.findIndex((r) => keyOf(r) === c.afterKey);
		if (c.afterKey !== null && at === -1) continue;
		out.splice(at + 1, 0, c.row);
	}
	return out;
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

enum RowHeightMode {
	OPEN = "open",
	CLOSE = "close",
}

/**
 * Previously Watched row whose height animates — opening from 0 (joined by a mark) or closing to
 * 0 (unwatched; dropped once closed). Rows joining / leaving there sit above "What's Up Next",
 * often above the view: added or removed at once, the list moved its scroll to keep the view
 * still, a frame after the rows moved — a one-row jump. Grown over CARD_MOVE_MS instead, it's
 * many small steps the list follows smoothly, on screen or off. Keyed by row, so a recycled
 * container never carries one row's height into another
 */
/** Row open / close: slow on purpose — the list's scroll correction for a row growing above
 *  the view lands a few frames behind the rows, so the faster the row grows the further the
 *  view drifts (and comes back). Spread out, each step is a pixel or two */
const ROW_HEIGHT_MS = 900;
/** Ease-in-out (CARD_MOVE_EASING's shape) for the JS-driven row height */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function RowHeight({
	mode,
	token,
	children,
}: Readonly<{ mode?: RowHeightMode; token?: number; children: ReactNode }>) {
	// -1 = natural height (no clip)
	const h = useSharedValue(mode === RowHeightMode.OPEN ? 0 : -1);
	// While animating the content is laid out on its own (absolute) at its natural height —
	// in flow, inside a 0-high box, it measured 0 and the row never opened
	const [animating, setAnimating] = useState(mode === RowHeightMode.OPEN);
	const natural = useRef(0);
	const started = useRef<number | undefined>(undefined);
	const frame = useRef<number | null>(null);
	useEffect(
		() => () => {
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		},
		[],
	);
	const run = useCallback(() => {
		if (!mode || token === undefined || started.current === token || natural.current <= 0) return;
		started.current = token;
		setAnimating(true);
		const full = natural.current;
		const [from, to] = mode === RowHeightMode.OPEN ? [0, full] : [full, 0];
		const t0 = performance.now();
		const step = () => {
			const p = Math.min(1, (performance.now() - t0) / ROW_HEIGHT_MS);
			const cur = from + (to - from) * easeInOut(p);
			h.value = cur;
			if (p < 1) {
				frame.current = requestAnimationFrame(step);
				return;
			}
			frame.current = null;
			if (mode === RowHeightMode.OPEN) {
				h.value = -1;
				setAnimating(false);
			}
		};
		step();
	}, [mode, token, h]);
	useLayoutEffect(run, [run]);
	const style = useAnimatedStyle(() =>
		h.value < 0 ? {} : { height: h.value, overflow: "hidden" as const },
	);
	return (
		<Reanimated.View style={style}>
			<View
				style={animating ? styles.rowHeightContent : undefined}
				onLayout={(e) => {
					natural.current = e.nativeEvent.layout.height;
					run();
				}}
			>
				{children}
			</View>
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

/** RowHeight's key: the row, plus whether it's animating. A row whose open / close ended or was
 *  called off gets a fresh RowHeight — an animated height left behind (an open cancelled before
 *  it started kept the row at 0, drawn nowhere) can't outlive its animation */
const rowHeightKey = (item: ListRow) => `${keyOf(item)}|${item.height?.mode ?? ""}`;

/** Remembered row heights (rowSizes) — but not for a row opening / closing: its height is the
 *  animation, the list must follow its measured size */
const fixedRowSize = (item: ListRow) => {
	// Opening: starts at exactly 0 (its separator) — left to the estimate (a row's height) it was
	// placed a row tall for a frame and the list jumped. Its animated height is then measured
	// as it changes (patched LegendList: a measured size that differs from the fixed one counts)
	if (item.height?.mode === RowHeightMode.OPEN) return spacing.sm;
	return item.height ? undefined : rememberedRowSize(item);
};

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

	const drawnRows = useRef<readonly WatchlistListItem[]>([]);
	// Previously Watched rows closing (RowHeight): kept in the list, after the row they followed,
	// until they've closed to nothing
	const [closing, setClosing] = useState<
		{ row: WatchlistListItem; afterKey: string | null; token: number }[]
	>([]);
	const listData = useMemo(() => withClosing(fullData, closing), [fullData, closing]);

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
	// This reorder's rows keep their positions (no scroll compensation): see listMotion
	const [noAnchor, setNoAnchor] = useState(false);
	const mvcp = useMemo(() => ({ data: !noAnchor, size: true }), [noAnchor]);
	const [growing, setGrowing] = useState<{ keys: ReadonlySet<string>; token: number } | null>(null);
	const growToken = useRef(0);
	const [headerGlide, setHeaderGlide] = useState<HeaderMove | null>(null);
	const [opening, setOpening] = useState<{ keys: ReadonlySet<string>; token: number } | null>(null);
	const heightToken = useRef(0);
	// Rows that finished closing and were dropped (see `closed`)
	const closedDone = useRef(new Set<string>());
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
		// Previously Watched rows: one just marked opens, one just unwatched closes (RowHeight)
		const prevRows = drawnRows.current;
		const nextKeySet = new Set(listKeys.split("|"));
		const prevKeySet = new Set(prevRows.map(keyOf));
		const changedRow = (r: WatchlistListItem) => {
			const id = rowTmdbId(r);
			return id !== null && wasJustMarked(id);
		};
		const closingKeys = new Set(closing.map((c) => keyOf(c.row)));
		const opened = listData.filter(
			(r) =>
				isWatchedRow(r) &&
				!prevKeySet.has(keyOf(r)) &&
				!closingKeys.has(keyOf(r)) &&
				changedRow(r) &&
				prevRows.length > 0,
		);
		// Not a row that already closed and was dropped: seen leaving again then, it looped
		// (closed → dropped → "removed" → closed …) and the list kept re-anchoring
		const closed = prevRows.filter(
			(r) =>
				isWatchedRow(r) &&
				!nextKeySet.has(keyOf(r)) &&
				changedRow(r) &&
				!closedDone.current.has(keyOf(r)),
		);
		for (const r of listData) closedDone.current.delete(keyOf(r));
		if (opened.length > 0 || closed.length > 0) {
			heightToken.current += 1;
			const token = heightToken.current;
			if (opened.length > 0) setOpening({ keys: new Set(opened.map(keyOf)), token });
			if (closed.length > 0) {
				setClosing((prev) => [
					...prev,
					...closed
						.filter((r) => !prev.some((c) => keyOf(c.row) === keyOf(r)))
						.map((r) => {
							const at = prevRows.indexOf(r);
							return { row: r, afterKey: at > 0 ? keyOf(prevRows[at - 1]) : null, token };
						}),
				]);
			}
		}
		// Rows the list dropped: a swipe banner one was held on clears (after this commit)
		for (const r of prevRows) {
			if (nextKeySet.has(keyOf(r))) continue;
			// Closing in place: it keeps its banner while it closes
			if (isWatchedRow(r) && changedRow(r)) continue;
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
			setNoAnchor(false);
		}, CARD_MOVE_MS + 200);
		return () => clearTimeout(t);
	}, [layoutMoving, listKeys]);
	// Rows open / close only once card glides are over: a height changing under the glide's
	// layout transition left the rows trailing the list's scroll steps — the cards drifted, then
	// snapped. So a mark moves its card first, then its Previously Watched row opens
	const cardsGliding = layoutMoving || armed;
	// Closed rows leave the list (at height 0, so nothing moves); opening flags clear
	useEffect(() => {
		if (closing.length === 0 || cardsGliding) return;
		const t = setTimeout(() => {
			for (const c of closing) closedDone.current.add(keyOf(c.row));
			setClosing([]);
		}, ROW_HEIGHT_MS + 100);
		return () => clearTimeout(t);
	}, [closing, cardsGliding]);
	useEffect(() => {
		if (!opening || cardsGliding) return;
		const t = setTimeout(() => setOpening(null), ROW_HEIGHT_MS + 100);
		return () => clearTimeout(t);
	}, [opening, cardsGliding]);
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
		if (!growing && !headerGlide && !flipping && !opening && closing.length === 0) return listData;
		const closingTokens = new Map(closing.map((c) => [keyOf(c.row), c.token]));
		const growWaiting = growing !== null && growStarted !== growing.token;
		const flipWaiting = flipping !== null && flipStarted !== flipping.token;
		return listData.map((i) => {
			const key = keyOf(i);
			if (flipping?.keys.has(key)) return { ...i, flipping: true, flipWaiting };
			const closeToken = closingTokens.get(key);
			if (closeToken !== undefined) {
				return {
					...i,
					height: { mode: RowHeightMode.CLOSE, token: cardsGliding ? undefined : closeToken },
				};
			}
			if (opening?.keys.has(key)) {
				const height = {
					mode: RowHeightMode.OPEN,
					token: cardsGliding ? undefined : opening.token,
				};
				return growing?.keys.has(key)
					? { ...i, height, grow: growing.token, growShift: false, growWaiting }
					: { ...i, height };
			}
			if (growing?.keys.has(key)) {
				// Under a header gliding by: start where the header still is (growShiftStyle)
				const growShift = i.type === "show" && headerGlide?.token === growing.token;
				return { ...i, grow: growing.token, growShift, growWaiting };
			}
			if (headerGlide && key === UP_NEXT_KEY) return { ...i, hideHeader: true };
			return i;
		});
	}, [
		listData,
		growing,
		headerGlide,
		growStarted,
		flipping,
		flipStarted,
		opening,
		closing,
		cardsGliding,
	]);
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
					<RowHeight key={rowHeightKey(item)} mode={item.height?.mode} token={item.height?.token}>
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
					</RowHeight>
				);
			}

			if (item.type === "watchedEpisode") {
				return (
					<RowHeight key={rowHeightKey(item)} mode={item.height?.mode} token={item.height?.token}>
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
					</RowHeight>
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
				getFixedItemSize={fixedRowSize}
				itemLayoutAnimation={layoutMoving || armed ? CARD_LAYOUT : CARD_LAYOUT_INSTANT}
				drawDistance={SCREEN_HEIGHT * 2}
				estimatedItemSize={110}
				stickyHeaderIndices={stickyIndices}
				onScrollBeginDrag={() => {
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
				maintainVisibleContentPosition={mvcp}
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
				drawer
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
