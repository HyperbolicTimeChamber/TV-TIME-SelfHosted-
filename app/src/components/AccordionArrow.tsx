import Reanimated, {
	FadeInUp,
	FadeOutUp,
	LinearTransition,
	useAnimatedStyle,
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
