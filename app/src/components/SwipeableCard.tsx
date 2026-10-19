import React, { useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
	View,
	Text,
	StyleSheet,
	ActivityIndicator,
	Dimensions,
	LayoutAnimation,
	Platform,
	UIManager,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	runOnJS,
	interpolate,
	Extrapolation,
} from "react-native-reanimated";
import { colors, spacing, typography } from "../theme";
import { RxCheck, RxCross2 } from "./RxIcons";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
/** A swiped-away row that is still in the list after this long comes back */
const DONE_RESTORE_MS = 1500;

type SwipeState = "idle" | "swiped_left" | "swiped_right" | "loading" | "done";

export interface SwipeableCardRef {
	triggerSwipeLeft: () => void;
}

interface Props {
	children: React.ReactNode;
	onSwipeLeft: () => Promise<void>;
	/** Omit to turn the right action (drag toward the left edge) off */
	onSwipeRight?: () => Promise<void>;
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
	},
	ref,
) {
	const translateX = useSharedValue(0);
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
	const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => {
		if (restoreTimer.current) clearTimeout(restoreTimer.current);
	}, []);
	const [persistingLoad, setPersistingLoad] = React.useState(false);
	// Recycled into another item → start clean
	const firstKey = useRef(resetKey);
	useEffect(() => {
		if (resetKey === firstKey.current) return;
		firstKey.current = resetKey;
		if (restoreTimer.current) clearTimeout(restoreTimer.current);
		translateX.value = 0;
		isProcessing.current = false;
		setShowReveal(false);
		setPersistingLoad(false);
		setSwipeState("idle");
	}, [resetKey, translateX]);
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

	const handleSwipeComplete = useCallback(
		async (direction: "left" | "right") => {
			if (isProcessing.current) return;
			isProcessing.current = true;

			const persist = persistRef.current;
			const shouldPersist = typeof persist === "object" ? persist[direction] : !!persist;

			if (shouldPersist) {
				// Keep card off-screen, show colored reveal underneath while loading
				const color = direction === "left" ? leftColorRef.current : rightColorRef.current;
				setActionColor(color);
				setPersistingLoad(true);
				setSwipeState("loading");
				try {
					if (direction === "left") {
						await onSwipeLeftRef.current();
					} else {
						await onSwipeRightRef.current?.();
					}
				} catch (err) {
					console.error("SwipeableCard action failed:", err);
				}
				// Reset silently without animation — list re-render handles the update
				translateX.value = 0;
				setPersistingLoad(false);
				setShowReveal(false);
				setSwipeState("idle");
				isProcessing.current = false;
				return;
			}

			const color = direction === "left" ? leftColorRef.current : rightColorRef.current;
			setActionColor(color);
			setSwipeState("loading");

			try {
				if (direction === "left") {
					await onSwipeLeftRef.current();
				} else {
					await onSwipeRightRef.current?.();
				}
				setSwipeState("done");
				LayoutAnimation.configureNext(LayoutAnimation.create(300, "easeInEaseOut", "opacity"));
				// Row still here once the list has updated (Rewatch / −1 keep it) → show it again
				// rather than leave a blank gap
				restoreTimer.current = setTimeout(() => {
					translateX.value = 0;
					setShowReveal(false);
					setSwipeState("idle");
					isProcessing.current = false;
				}, DONE_RESTORE_MS);
			} catch (err) {
				console.error("SwipeableCard action failed:", err);
				translateX.value = withTiming(0, { duration: 300 });
				setSwipeState("idle");
				setShowReveal(false);
				isProcessing.current = false;
			}
		},
		[translateX],
	);

	useImperativeHandle(
		ref,
		() => ({
			triggerSwipeLeft: () => {
				if (swipeState !== "idle" || isProcessing.current) return;
				setShowReveal(true);
				translateX.value = withTiming(SCREEN_WIDTH, { duration: 300 }, () => {
					runOnJS(handleSwipeComplete)("left");
				});
			},
		}),
		[swipeState, handleSwipeComplete, translateX],
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
						translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
							runOnJS(handleSwipeComplete)("left");
						});
					} else if (rightEnabled && event.translationX < -SWIPE_THRESHOLD) {
						translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
							runOnJS(handleSwipeComplete)("right");
						});
					} else {
						translateX.value = withTiming(0, { duration: 200 });
						runOnJS(setShowReveal)(false);
					}
				}),
		[rightEnabled, idle, translateX, handleSwipeComplete],
	);

	const cardStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	const leftRevealOpacity = useAnimatedStyle(() => ({
		opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
	}));

	const rightRevealOpacity = useAnimatedStyle(() => ({
		opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP),
	}));

	if (swipeState === "done") {
		return null;
	}

	if (swipeState === "loading" && !persistingLoad) {
		return (
			<View
				style={[
					styles.wrapper,
					styles.loadingReveal,
					{ backgroundColor: actionColor, minHeight: cardHeight.current || 100 },
				]}
			>
				<ActivityIndicator color={colors.text} />
				<Text style={styles.revealText}>{actionColor === leftColor ? leftLabel : rightLabel}</Text>
			</View>
		);
	}

	return (
		<View
			style={styles.wrapper}
			onLayout={(e) => {
				const h = e.nativeEvent.layout.height;
				if (h > 0) cardHeight.current = h;
			}}
		>
			{showReveal && (
				<>
					<Animated.View
						style={[
							styles.revealCard,
							swipeState === "loading" && actionColor === leftColor
								? { opacity: 1, justifyContent: "center" as const }
								: [styles.revealLeft, leftRevealOpacity],
							{ backgroundColor: leftColor },
						]}
					>
						{swipeState === "loading" && actionColor === leftColor ? (
							<>
								<ActivityIndicator color={colors.text} />
								<Text style={styles.revealText}>{leftLabel}</Text>
							</>
						) : (
							<>
								<View style={styles.revealIcon}>
									<RxCheck size={26} />
								</View>
								<Text style={styles.revealText}>{leftLabel}</Text>
							</>
						)}
					</Animated.View>

					<Animated.View
						style={[
							styles.revealCard,
							swipeState === "loading" && actionColor === rightColor
								? { opacity: 1, justifyContent: "center" as const }
								: [styles.revealRight, rightRevealOpacity],
							{ backgroundColor: rightColor },
						]}
					>
						{swipeState === "loading" && actionColor === rightColor ? (
							<>
								<ActivityIndicator color={colors.text} />
								<Text style={styles.revealText}>{rightLabel}</Text>
							</>
						) : (
							<>
								<Text style={styles.revealText}>{rightLabel}</Text>
								<View style={styles.revealIcon}>
									{rightIcon ? (
										<Text style={styles.revealIconText}>{rightIcon}</Text>
									) : (
										<RxCross2 size={26} />
									)}
								</View>
							</>
						)}
					</Animated.View>
				</>
			)}

			<GestureDetector gesture={panGesture}>
				<Animated.View style={[styles.card, cardStyle]}>{children}</Animated.View>
			</GestureDetector>
		</View>
	);
});

const styles = StyleSheet.create({
	wrapper: {
		overflow: "hidden",
		borderRadius: 8,
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
	revealCard: {
		...(StyleSheet.absoluteFill as object),
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.xl,
		zIndex: 0,
	},
	revealLeft: {
		justifyContent: "flex-start",
	},
	revealRight: {
		justifyContent: "flex-end",
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
