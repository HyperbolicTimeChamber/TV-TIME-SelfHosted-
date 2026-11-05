import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

// Same glyph as react-icons' HiCheck (Heroicons v1 solid check, react-icons/hi) used on web —
// the app's one tick icon
const CHECK =
	"M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z";

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
