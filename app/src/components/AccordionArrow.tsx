import { useEffect, useState, type ReactNode } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import Reanimated, {
	FadeInUp,
	FadeOutUp,
	LinearTransition,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withTiming,
} from "react-native-reanimated";
import IosArrowDown from "./IosArrowDown";

/** Card dropdowns (Calendar's show groups, a show's seasons) open and close on one beat */
export const ACCORDION_MS = 220;
// Child strips cascade in, a few ms apart
const STRIP_STAGGER_MS = 25;
/** Cards below an opening/closing dropdown glide to their new spot */
export const accordionLayout = LinearTransition.duration(ACCORDION_MS);
/** The nth strip under an opened card: fades down into place, a beat after the one above */
export const stripEntering = (nth: number) =>
	FadeInUp.duration(ACCORDION_MS).delay(nth * STRIP_STAGGER_MS);
export const stripExiting = FadeOutUp.duration(ACCORDION_MS / 2);
// FadeInUp's starting offset
const STRIP_RISE = 25;

/**
 * stripEntering as a plain style animation, for strips whose rows can change height while they
 * cascade in (a season's episodes gain a "Watched 2x" line once watch data lands). An `entering`
 * animation holds a view's frame until it finishes, so a row below a growing one kept its old
 * spot and overlapped it, eating the gap between them. Opacity and translate only — layout is
 * left alone.
 */
export function CascadeStrip({
	nth,
	style,
	children,
}: Readonly<{ nth: number; style?: StyleProp<ViewStyle>; children: ReactNode }>) {
	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withDelay(nth * STRIP_STAGGER_MS, withTiming(1, { duration: ACCORDION_MS }));
	}, [nth, progress]);
	const cascade = useAnimatedStyle(() => ({
		opacity: progress.value,
		transform: [{ translateY: (1 - progress.value) * STRIP_RISE }],
	}));
	return <Reanimated.View style={[style, cascade]}>{children}</Reanimated.View>;
}

/** Dropdown arrow that turns to point up while its card is open */
export default function AccordionArrow({ open, size }: Readonly<{ open: boolean; size: number }>) {
	const style = useAnimatedStyle(() => ({
		transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: ACCORDION_MS }) }],
	}));
	return (
		<Reanimated.View style={style}>
			<IosArrowDown size={size} />
		</Reanimated.View>
	);
}

/**
 * Height accordion for strips nested inside the card they open from (a show's seasons). A
 * `layout` transition on that card, with its strips entering and exiting inside it, kept a stale
 * height after closing and left a gap above the next card. Instead the strips lay out at full
 * height in an absolute stack, and the box holding them grows to (or shrinks from) that height,
 * so everything below follows frame by frame. Strips stay mounted until the close finishes.
 */
export function useAccordion(
	open: boolean,
	/** Content height when the caller already knows it (fixed-height rows): no measuring, and
	 *  the first frame of the open already has its target */
	knownHeight?: number,
) {
	const [mounted, setMounted] = useState(open);
	const progress = useSharedValue(open ? 1 : 0);
	const closing = useSharedValue(false);
	const contentH = useSharedValue(knownHeight ?? 0);
	useEffect(() => {
		if (knownHeight !== undefined) contentH.value = knownHeight;
	}, [knownHeight, contentH]);

	useEffect(() => {
		if (open) setMounted(true);
		closing.value = !open;
		progress.value = withTiming(open ? 1 : 0, { duration: ACCORDION_MS }, (finished) => {
			if (finished && !open) runOnJS(setMounted)(false);
		});
	}, [open, closing, progress]);

	const style = useAnimatedStyle(() => ({
		height: progress.value * contentH.value,
		// Opening, the strips fade in on their own; closing, they fade out together
		opacity: closing.value ? progress.value : 1,
		overflow: "hidden",
	}));
	const onContentLayout =
		knownHeight === undefined
			? (e: LayoutChangeEvent) => {
					contentH.value = e.nativeEvent.layout.height;
				}
			: undefined;
	return { mounted, style, onContentLayout };
}
