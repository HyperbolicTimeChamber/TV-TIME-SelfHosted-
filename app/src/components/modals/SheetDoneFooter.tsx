import { StyleSheet, Text } from "react-native";
// Gesture-handler Pressable: inside a Gorhom sheet, React Native's lost a tap whose finger drifted
// a pixel or two (the sheet's gestures took the touch)
import { Pressable } from "react-native-gesture-handler";
import { KEYBOARD_STATUS, useBottomSheet, useBottomSheetInternal } from "@gorhom/bottom-sheet";
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import { colors, spacing, typography, themedStyles } from "../../theme";

/** The Done pill's height + the gap under it — a sheet's scroll content ends this far (plus the
 *  nav-bar inset) above the bottom so its last row can scroll clear of the pill */
export const DONE_FOOTER_HEIGHT = 76;

/**
 * Done, floating over a Gorhom sheet's content (its footerComponent, inside BottomSheetFooter).
 * The footer pins it to the sheet's visible bottom, so while the sheet closes it stayed put until
 * the sheet's top reached it. Below the lowest detent (index between 0 and -1 — closing) it rides
 * down with the sheet: the share of that detent already gone.
 *
 * `stayBehindKeyboard`: Gorhom's footer jumps to the keyboard's top edge while it's up; this
 * cancels that (and the nav-bar inset Gorhom drops then), so Done stays at the sheet's bottom and
 * the keyboard covers it instead of pushing it up over the content.
 */
export default function SheetDoneFooter({
	lowestSnap,
	onPress,
	stayBehindKeyboard = false,
	bottomInset = 0,
}: Readonly<{
	lowestSnap: number;
	onPress: () => void;
	stayBehindKeyboard?: boolean;
	/** The BottomSheetFooter's bottomInset (needed with stayBehindKeyboard) */
	bottomInset?: number;
}>) {
	const { animatedIndex } = useBottomSheet();
	const { animatedKeyboardState } = useBottomSheetInternal();
	const closingStyle = useAnimatedStyle(() => {
		const keyboard = animatedKeyboardState.value;
		const keyboardLift =
			stayBehindKeyboard && keyboard.status === KEYBOARD_STATUS.SHOWN
				? keyboard.heightWithinContainer - bottomInset
				: 0;
		return {
			transform: [
				{ translateY: Math.max(0, -animatedIndex.value) * lowestSnap + Math.max(0, keyboardLift) },
			],
		};
	});
	return (
		<Reanimated.View style={[styles.footer, closingStyle]} pointerEvents="box-none">
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
			>
				<Text style={styles.doneText}>Done</Text>
			</Pressable>
		</Reanimated.View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	footer: { alignItems: "center", paddingBottom: spacing.md },
	done: {
		minWidth: 120,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.xl,
		borderRadius: 999,
		alignItems: "center",
		backgroundColor: colors.warningAmber,
	},
	donePressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
	doneText: { ...typography.subtitle, fontSize: 15, color: colors.onAmber },
}));
