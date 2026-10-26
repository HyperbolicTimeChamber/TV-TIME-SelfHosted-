import { useState } from "react";
import { Text } from "react-native";
import { spacing } from "../../theme";
import { styles } from "./styles";

/**
 * A stat card's label pill. When the card is too narrow and the label wraps, Android sizes the
 * text to the full width it was offered, so the pill kept empty space beside the shorter line.
 * Once a wrap is measured, the pill is set to the widest line instead.
 */
export default function StatLabel({ label }: Readonly<{ label: string }>) {
	const [wrappedWidth, setWrappedWidth] = useState<number | null>(null);
	return (
		<Text
			style={[
				styles.statLabel,
				// +1: rounding down a line's width could wrap it again
				wrappedWidth !== null && { width: wrappedWidth + spacing.sm * 2 + 1 },
			]}
			onTextLayout={(e) => {
				const { lines } = e.nativeEvent;
				if (lines.length < 2) return;
				const widest = Math.ceil(Math.max(...lines.map((l) => l.width)));
				if (widest !== wrappedWidth) setWrappedWidth(widest);
			}}
		>
			{label}
		</Text>
	);
}
