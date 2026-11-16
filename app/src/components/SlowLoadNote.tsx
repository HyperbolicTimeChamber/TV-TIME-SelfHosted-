import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Reanimated, {
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { spacing, typography, themedStyles } from "../theme";

const FADE_MS = 200;
const RISE_PX = 4;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Info page: one small note under the first section still loading (Where to Watch) once the
 * extras take longer than SLOW_LOAD_MS. Fades in with a 4px rise; the screen unmounts it the
 * moment the data lands (no exit). Reduced motion: it just appears
 */
export default function SlowLoadNote() {
	const reducedMotion = useReducedMotion();
	const progress = useSharedValue(0);
	useEffect(() => {
		progress.set(withTiming(1, { duration: reducedMotion ? 0 : FADE_MS, easing: EASE_OUT }));
	}, [progress, reducedMotion]);
	const animated = useAnimatedStyle(() => ({
		opacity: progress.get(),
		transform: [{ translateY: reducedMotion ? 0 : (1 - progress.get()) * RISE_PX }],
	}));
	return (
		<Reanimated.Text
			style={[styles.note, animated]}
			accessibilityRole="text"
			accessibilityLiveRegion="polite"
		>
			This is taking longer than usual…
		</Reanimated.Text>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		// Inset like the sections around it (their text sits spacing.sm inside the page padding)
		note: { ...typography.caption, marginTop: spacing.sm, paddingHorizontal: spacing.sm },
	}),
);
