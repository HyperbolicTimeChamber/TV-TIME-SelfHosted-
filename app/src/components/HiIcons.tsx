import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

// Same glyphs as react-icons' HiCheck (Heroicons v1 solid check, react-icons/hi) — the app's one
// tick icon — and IoIosCloseCircle (Ionicons v4, react-icons/io) — the search bars' clear button
const CHECK =
	"M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z";

const CLOSE_CIRCLE =
	"M256 48C141.1 48 48 141.1 48 256s93.1 208 208 208 208-93.1 208-208S370.9 48 256 48zm52.7 283.3L256 278.6l-52.7 52.7c-6.2 6.2-16.4 6.2-22.6 0-3.1-3.1-4.7-7.2-4.7-11.3 0-4.1 1.6-8.2 4.7-11.3l52.7-52.7-52.7-52.7c-3.1-3.1-4.7-7.2-4.7-11.3 0-4.1 1.6-8.2 4.7-11.3 6.2-6.2 16.4-6.2 22.6 0l52.7 52.7 52.7-52.7c6.2-6.2 16.4-6.2 22.6 0 6.2 6.2 6.2 16.4 0 22.6L278.6 256l52.7 52.7c6.2 6.2 6.2 16.4 0 22.6-6.2 6.3-16.4 6.3-22.6 0z";

export interface HiIconProps {
	size?: number;
	color?: string;
}

export function HiCheck({ size = 24, color = colors.text }: HiIconProps) {
	return (
		<Svg width={size} height={size} viewBox="0 0 20 20">
			<Path d={CHECK} fill={color} fillRule="evenodd" clipRule="evenodd" />
		</Svg>
	);
}

export function IoIosCloseCircle({ size = 24, color = colors.text }: HiIconProps) {
	return (
		<Svg width={size} height={size} viewBox="0 0 512 512">
			<Path d={CLOSE_CIRCLE} fill={color} />
		</Svg>
	);
}
