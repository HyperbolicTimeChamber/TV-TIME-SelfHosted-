import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";

// Same glyph as react-icons' IoIosArrowDown (used on web)
const PATH =
	"M256 294.1L383 167c9.4-9.4 24.6-9.4 33.9 0s9.3 24.6 0 34L273 345c-9.1 9.1-23.7 9.3-33.1.7L95 201.1c-4.7-4.7-7-10.9-7-17s2.3-12.3 7-17c9.4-9.4 24.6-9.4 33.9 0l127.1 127z";

export default function IosArrowDown({ size = 24, color = colors.text }: { size?: number; color?: string }) {
	return (
		<Svg width={size} height={size} viewBox="0 0 512 512">
			<Path d={PATH} fill={color} />
		</Svg>
	);
}
