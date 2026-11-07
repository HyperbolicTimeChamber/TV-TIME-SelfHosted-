import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	forwardRef,
	useImperativeHandle,
} from "react";
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	runOnJS,
	interpolate,
	Extrapolation,
	Easing,
	withDelay,
	withSequence,
} from "react-native-reanimated";
import { colors, spacing, typography } from "../theme";
import { CARD_RADIUS } from "../enums";
import { RxCross2 } from "./RxIcons";
import { HiCheck } from "./HiIcons";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
/** A swiped-away row that is still in the list after this long comes back */
/** A row whose action should have taken it off the list, still there after this → shown again */
const HOLD_MS = 15000;

/** The reveal's label / icon gliding from the side to the centre once the swipe lands (and the
 *  icon handing over to the spinner): strong ease-out — it answers the swipe */
const LABEL_MS = 320;
const LABEL_EASING = Easing.bezier(0.23, 1, 0.32, 1);
/** flipBack: banner → row flip (each half: turning edge-on, then flat) */
const FLIP_HALF_MS = 260;
/** The reveal's side padding: where the label sits while swiping */
const REVEAL_PAD = spacing.xl;

type SwipeState = "idle" | "swiped_left" | "swiped_right" | "loading" | "done";

export interface SwipeableCardRef {
	triggerSwipeLeft: () => void;
}

interface Props {
	children: React.ReactNode;
	/** Resolving `false` = nothing changed: the card snaps back at once (no held banner) */
	onSwipeLeft: () => Promise<boolean | void>;
	/** Omit to turn the right action (drag toward the left edge) off */
	onSwipeRight?: () => Promise<boolean | void>;
	persistAfterSwipe?: boolean | { left: boolean; right: boolean };
	leftLabel?: string;
	rightLabel?: string;
	/** Text in the right reveal's circle instead of the ✕ icon — e.g. "−1" when unwatching drops a count */
	rightIcon?: string;
	leftColor?: string;
	rightColor?: string;
	/** Identity of what the card shows — a recycled list row resets its swipe state when it
	 *  changes (a remounting `key` would throw away the recycled views) */
	resetKey?: string;
	/** What the row shows of its item (e.g. its watch count): a change while the card is held on
	 *  its banner (the action moved the row, or changed it in place) lets the banner go */
	contentKey?: string;
	/** The action done and the row staying: its banner flips over into the row (edge-on halfway,
	 *  where the banner goes) instead of the row coming back at once — that blinked */
	flipBack?: boolean;
}

/** Rows held on their banner (see HOLD_MS), by resetKey → called once the list has dropped
 *  the row. A list doesn't tear a dropped row down — its container keeps drawing the last thing
 *  it showed until it's reused — so the banner has to clear itself */
const heldRows = new Map<string, () => void>();
/** The list dropped this row (its resetKey): a banner it was held on goes */
export function releaseHeldSwipe(resetKey: string) {
	heldRows.get(resetKey)?.();
}

/** The swipe's in-progress banner (action colour, spinner, label) — also drawn by the watchlist
 *  as a leaving row's copy, so the banner a row ended on is what shrinks away */
export function SwipeActionBanner({
	color,
	label,
	minHeight,
}: Readonly<{ color: string; label: string; minHeight: number }>) {
	return (
		<View style={[styles.wrapper, styles.loadingReveal, { backgroundColor: color, minHeight }]}>
			<ActivityIndicator color={colors.text} />
			<Text style={styles.revealText}>{label}</Text>
		</View>
	);
}

export default forwardRef<SwipeableCardRef, Props>(function SwipeableCard(
	{
		children,
		onSwipeLeft,
		onSwipeRight,
		persistAfterSwipe = false,
		leftLabel = "Watched",
		rightLabel = "Stop",
		rightIcon,
		leftColor = colors.watchedGreen,
		rightColor = colors.stopBlue,
		resetKey,
		contentKey,
		flipBack = false,
	},
	ref,
) {
	const translateX = useSharedValue(0);
	// flipBack's turn: 0 → ½ the banner turns edge-on, ½ → 1 the row turns flat (0 / 1 = flat)
	const flip = useSharedValue(0);
	// The reveal's label: 0 = at its side (while swiping), 1 = centred (the action saving). A
	// transform on the UI thread — layout animations inside list rows clashed with the list's
	// own row transitions
	const centred = useSharedValue(0);
	// Which side's action is running (its icon fades out)
	const actionLeft = useSharedValue(true);
	const rowW = useSharedValue(0);
	const leftGroupW = useSharedValue(0);
	const rightGroupW = useSharedValue(0);
	// Height for the loading placeholder — a ref, not state (no extra render per row mount)
	const cardHeight = useRef(0);
	const [swipeState, setSwipeState] = React.useState<SwipeState>("idle");
	// Mirror for the gesture worklets (so the gesture can be built once)
	const idle = useSharedValue(true);
	useEffect(() => {
		idle.value = swipeState === "idle";
	}, [swipeState, idle]);
	const [showReveal, setShowReveal] = React.useState(false);
	const [actionColor, setActionColor] = React.useState<string>(colors.watchedGreen);
	const isProcessing = useRef(false);
	// One action per swipe: each swipe / checkmark gets an id and only its first finished
	// animation callback acts. A swipe's withTiming callback can fire a second time (finished:
	// false) after the mark's await — once isProcessing was reset, that second call ran the
	// action again on the card's new episode (one swipe marked E39 and E40)
	const swipeSeq = useSharedValue(0);
	const handledSeq = useRef(0);
	const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (restoreTimer.current) clearTimeout(restoreTimer.current);
		},
		[],
	);
	// flipBack's halfway point (the row back to idle under its turn)
	const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (flipTimer.current) clearTimeout(flipTimer.current);
		},
		[],
	);
	// Recycled into another item → start clean
	const firstKey = useRef(resetKey);
	const resetKeyRef = useRef(resetKey);
	resetKeyRef.current = resetKey;
	useLayoutEffect(() => {
		if (resetKey === firstKey.current) return;
		if (firstKey.current) heldRows.delete(firstKey.current);
		firstKey.current = resetKey;
		if (restoreTimer.current) clearTimeout(restoreTimer.current);
		translateX.value = 0;
		centred.value = 0;
		flip.value = 0;
		if (flipTimer.current) clearTimeout(flipTimer.current);
		isProcessing.current = false;
		setShowReveal(false);
		setSwipeState("idle");
	}, [resetKey, translateX, centred, flip]);
	// The row took the action's result in place (same item, new content — e.g. its count): a
	// banner held for it goes, back to the row (a row the list drops ends on releaseHeldSwipe)
	const shownContent = useRef(contentKey);
	const contentChanged = useRef(false);
	const backToRow = useRef<() => void>(() => {});
	useEffect(() => {
		if (contentKey === shownContent.current) return;
		shownContent.current = contentKey;
		if (!isProcessing.current) return;
		contentChanged.current = true;
		if (resetKey && heldRows.has(resetKey)) backToRow.current();
	}, [contentKey, resetKey]);
	const onSwipeLeftRef = useRef(onSwipeLeft);
	onSwipeLeftRef.current = onSwipeLeft;
	const onSwipeRightRef = useRef(onSwipeRight);
	onSwipeRightRef.current = onSwipeRight;
	const persistRef = useRef(persistAfterSwipe);
	persistRef.current = persistAfterSwipe;
	const leftColorRef = useRef(leftColor);
	leftColorRef.current = leftColor;
	const rightColorRef = useRef(rightColor);
	rightColorRef.current = rightColor;
	const flipBackRef = useRef(flipBack);
	flipBackRef.current = flipBack;

	/** The flip is over: flat, set from JS too (what a later re-render applies) */
	const flipDone = useCallback(() => {
		flip.value = 0;
	}, [flip]);
	const toIdleState = useCallback(() => {
		setShowReveal(false);
		setSwipeState("idle");
		isProcessing.current = false;
	}, []);
	/** The action is done and the row stays: back to the row — flipped over from its banner
	 *  (flipBack: edge-on halfway, where the row takes the banner's place) or at once. Every
	 *  value is set from JS in one go: a row re-render re-applies the values JS last set, and one
	 *  set only on the UI thread came back stale on the row's next render (its new count) —
	 *  swiped off (a blank banner) or edge-on (a blank slot); a handoff to JS at the halfway
	 *  point left the slot blank while JS was busy */
	const backToCard = useCallback(() => {
		if (!flipBackRef.current) {
			translateX.value = 0;
			centred.value = 0;
			toIdleState();
			return;
		}
		flip.value = 0;
		flip.value = withSequence(
			withTiming(0.5, { duration: FLIP_HALF_MS, easing: Easing.in(Easing.cubic) }),
			withTiming(1, { duration: FLIP_HALF_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
				if (finished) runOnJS(flipDone)();
			}),
		);
		translateX.value = withDelay(FLIP_HALF_MS, withTiming(0, { duration: 0 }));
		centred.value = withDelay(FLIP_HALF_MS, withTiming(0, { duration: 0 }));
		if (flipTimer.current) clearTimeout(flipTimer.current);
		flipTimer.current = setTimeout(() => {
			translateX.value = 0;
			centred.value = 0;
			toIdleState();
		}, FLIP_HALF_MS);
	}, [translateX, centred, flip, toIdleState, flipDone]);

	const handleSwipeComplete = useCallback(
		async (direction: "left" | "right", seq: number) => {
			if (seq <= handledSeq.current || isProcessing.current) return;
			handledSeq.current = seq;
			isProcessing.current = true;
			contentChanged.current = false;

			const persist = persistRef.current;
			const shouldPersist = typeof persist === "object" ? persist[direction] : !!persist;

			if (shouldPersist) {
				// Keep card off-screen, show colored reveal underneath while loading
				const color = direction === "left" ? leftColorRef.current : rightColorRef.current;
				actionLeft.value = direction === "left";
				setActionColor(color);
				setSwipeState("loading");
				centred.value = withTiming(1, { duration: LABEL_MS, easing: LABEL_EASING });
				try {
					if (direction === "left") {
						await onSwipeLeftRef.current();
					} else {
						await onSwipeRightRef.current?.();
					}
				} catch (err) {
					console.error("SwipeableCard action failed:", err);
				}
				// The list re-render shows the update
				backToCard();
				return;
			}

			const color = direction === "left" ? leftColorRef.current : rightColorRef.current;
			actionLeft.value = direction === "left";
			setActionColor(color);
			setSwipeState("loading");
			centred.value = withTiming(1, { duration: LABEL_MS, easing: LABEL_EASING });

			try {
				const result =
					direction === "left" ? await onSwipeLeftRef.current() : await onSwipeRightRef.current?.();
				// Nothing changed: back to the card now, not a banner held for HOLD_MS
				if (result === false) {
					translateX.value = withTiming(0, { duration: 300 });
					centred.value = 0;
					setSwipeState("idle");
					setShowReveal(false);
					isProcessing.current = false;
					return;
				}
				// The action takes the row off the list (an unwatch to 0) or changes it (contentKey):
				// stay on its banner until the list drops it — the list then shrinks that banner away
				// (WatchlistTab) — or the row shows the change. Coming back to the row in between read
				// as the unwatch undoing itself. Still here after HOLD_MS (the list kept it, unchanged)
				// → show it again rather than a stuck banner
				const key = resetKeyRef.current;
				const release = () => {
					if (key) heldRows.delete(key);
					if (restoreTimer.current) clearTimeout(restoreTimer.current);
					backToCard();
				};
				backToRow.current = release;
				// Already changed in place while it saved: back to the row now
				if (contentChanged.current) {
					release();
					return;
				}
				if (key) {
					heldRows.set(key, () => {
						heldRows.delete(key);
						if (restoreTimer.current) clearTimeout(restoreTimer.current);
						setSwipeState("done");
					});
				}
				restoreTimer.current = setTimeout(release, HOLD_MS);
			} catch (err) {
				console.error("SwipeableCard action failed:", err);
				translateX.value = withTiming(0, { duration: 300 });
				centred.value = 0;
				setSwipeState("idle");
				setShowReveal(false);
				isProcessing.current = false;
			}
		},
		[translateX, centred, actionLeft, backToCard],
	);

	useImperativeHandle(
		ref,
		() => ({
			triggerSwipeLeft: () => {
				if (swipeState !== "idle" || isProcessing.current) return;
				setShowReveal(true);
				// Next number worked out here: a shared value written from JS lands on the UI thread
				// later, so reading it back right after `+= 1` gave the old number — the completion
				// then looked already handled and the checkmark's mark never ran
				const seq = swipeSeq.value + 1;
				swipeSeq.value = seq;
				translateX.value = withTiming(SCREEN_WIDTH, { duration: 300 }, (finished) => {
					if (finished) runOnJS(handleSwipeComplete)("left", seq);
				});
			},
		}),
		[swipeState, handleSwipeComplete, translateX, swipeSeq],
	);

	const rightEnabled = !!onSwipeRight;
	// Without a right action the card only claims rightward drags — a leftward one fails here
	// so the Watch List ↔ Upcoming tab pager can take it. Built once per direction setup.
	const panGesture = React.useMemo(
		() =>
			(rightEnabled
				? Gesture.Pan().activeOffsetX([-10, 10])
				: Gesture.Pan().activeOffsetX(10).failOffsetX(-10)
			)
				.onStart(() => {
					"worklet";
					runOnJS(setShowReveal)(true);
				})
				.onUpdate((event) => {
					"worklet";
					if (!idle.value) return;
					translateX.value = rightEnabled ? event.translationX : Math.max(0, event.translationX);
				})
				.onEnd((event) => {
					"worklet";
					if (!idle.value) return;

					if (event.translationX > SWIPE_THRESHOLD) {
						swipeSeq.value += 1;
						const seq = swipeSeq.value;
						translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, (finished) => {
							if (finished) runOnJS(handleSwipeComplete)("left", seq);
						});
					} else if (rightEnabled && event.translationX < -SWIPE_THRESHOLD) {
						swipeSeq.value += 1;
						const seq = swipeSeq.value;
						translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, (finished) => {
							if (finished) runOnJS(handleSwipeComplete)("right", seq);
						});
					} else {
						translateX.value = withTiming(0, { duration: 200 });
						runOnJS(setShowReveal)(false);
					}
				}),
		[rightEnabled, idle, translateX, handleSwipeComplete, swipeSeq],
	);

	const cardStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	// Always mounted, coloured on the UI thread: the card slides with the finger at once, but the
	// detailed reveal below waits on the JS thread (setShowReveal) — under load (marks saving) the
	// slot was blank for a second behind a swiped card. This shows the action colour at once
	const backdropStyle = useAnimatedStyle(() => ({
		backgroundColor: translateX.value < 0 ? rightColor : leftColor,
		opacity: interpolate(
			Math.abs(translateX.value),
			[0, SWIPE_THRESHOLD / 2],
			[0, 1],
			Extrapolation.CLAMP,
		),
	}));

	const leftRevealOpacity = useAnimatedStyle(() => ({
		opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
	}));

	const rightRevealOpacity = useAnimatedStyle(() => ({
		opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
	}));

	// Label group: centred in its reveal, slid out to its side while swiping (left / right of the
	// row, inside its padding) and gliding to the centre once the swipe lands (centred → 1)
	const leftGroupSlide = useAnimatedStyle(() => {
		const side = -(rowW.value / 2 - leftGroupW.value / 2 - REVEAL_PAD);
		return { transform: [{ translateX: side * (1 - centred.value) }] };
	});
	const rightGroupSlide = useAnimatedStyle(() => {
		const side = rowW.value / 2 - rightGroupW.value / 2 - REVEAL_PAD;
		return { transform: [{ translateX: side * (1 - centred.value) }] };
	});
	// The icon hands over to the spinner as the label centres
	const leftIconFade = useAnimatedStyle(() => ({
		opacity: actionLeft.value ? 1 - centred.value : 1,
	}));
	const rightIconFade = useAnimatedStyle(() => ({
		opacity: actionLeft.value ? 1 : 1 - centred.value,
	}));
	const spinnerFade = useAnimatedStyle(() => ({ opacity: centred.value }));

	// A recycled list row shows its new item from the first render: the reset below runs after
	// it, and a row drawn one frame in the old item's swipe state (blank / banner) was measured
	// at that size — the list placed every row under it by that and corrected it a moment later
	// (the watchlist jumped after an unwatch)
	const recycled = resetKey !== firstKey.current;
	const state: SwipeState = recycled ? "idle" : swipeState;
	const reveal = recycled ? false : showReveal;

	if (state === "done") {
		return null;
	}

	// While the action saves, the card stays swiped off (still in layout, so the row keeps its
	// height) over its reveal, whose label glides to the centre (revealSide). A separate banner
	// element here swapped in at once — the label jumped from the side to the middle
	const revealSide = (side: "left" | "right") => {
		const color = side === "left" ? leftColor : rightColor;
		const label = side === "left" ? leftLabel : rightLabel;
		const loadingHere = state === "loading" && actionColor === color;
		const marker = (
			<View style={styles.markerSlot}>
				<Animated.View style={[styles.revealIcon, side === "left" ? leftIconFade : rightIconFade]}>
					{side === "left" ? (
						<HiCheck size={26} />
					) : rightIcon ? (
						<Text style={styles.revealIconText}>{rightIcon}</Text>
					) : (
						<RxCross2 size={26} />
					)}
				</Animated.View>
				{loadingHere && (
					<Animated.View style={[styles.markerSpinner, spinnerFade]}>
						<ActivityIndicator color={colors.text} />
					</Animated.View>
				)}
			</View>
		);
		const text = <Text style={styles.revealText}>{label}</Text>;
		return (
			<Animated.View
				style={[
					styles.revealCard,
					loadingHere
						? styles.revealShown
						: side === "left"
							? leftRevealOpacity
							: rightRevealOpacity,
					{ backgroundColor: color },
				]}
			>
				<Animated.View
					style={[styles.revealGroup, side === "left" ? leftGroupSlide : rightGroupSlide]}
					onLayout={(e) => {
						(side === "left" ? leftGroupW : rightGroupW).value = e.nativeEvent.layout.width;
					}}
				>
					{side === "left" ? (
						<>
							{marker}
							{text}
						</>
					) : (
						<>
							{text}
							{marker}
						</>
					)}
				</Animated.View>
			</Animated.View>
		);
	};

	const flipStyle = useAnimatedStyle(() => ({
		transform: [
			{ perspective: 800 },
			{ rotateX: `${flip.value < 0.5 ? 180 * flip.value : 180 * flip.value - 180}deg` },
		],
	}));

	return (
		<Animated.View
			style={[styles.wrapper, flipStyle]}
			onLayout={(e) => {
				const h = e.nativeEvent.layout.height;
				if (h > 0) cardHeight.current = h;
				rowW.value = e.nativeEvent.layout.width;
			}}
		>
			<Animated.View style={[styles.revealBackdrop, backdropStyle]} pointerEvents="none" />
			{(reveal || state === "loading") && (
				<>
					{revealSide("left")}
					{revealSide("right")}
				</>
			)}

			<GestureDetector gesture={panGesture}>
				<Animated.View style={[styles.card, cardStyle]}>{children}</Animated.View>
			</GestureDetector>
		</Animated.View>
	);
});

const styles = StyleSheet.create({
	wrapper: {
		overflow: "hidden",
		borderRadius: CARD_RADIUS,
		marginHorizontal: spacing.md,
	},
	card: {
		backgroundColor: colors.surface,
		zIndex: 1,
	},
	loadingReveal: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.xl,
	},
	revealBackdrop: { ...(StyleSheet.absoluteFill as object) },
	revealCard: {
		...(StyleSheet.absoluteFill as object),
		alignItems: "center",
		justifyContent: "center",
		zIndex: 0,
	},
	revealShown: { opacity: 1 },
	revealGroup: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	markerSlot: { width: 36, height: 36 },
	markerSpinner: {
		...(StyleSheet.absoluteFill as object),
		justifyContent: "center",
		alignItems: "center",
	},
	revealIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 2,
		borderColor: colors.text,
		justifyContent: "center",
		alignItems: "center",
	},
	revealIconText: {
		fontSize: 14,
		lineHeight: 18,
		fontWeight: "700",
		color: colors.text,
		// Android's font padding sits text low in the circle
		includeFontPadding: false,
		textAlignVertical: "center",
	},
	revealText: {
		...typography.subtitle,
		color: colors.text,
	},
});
