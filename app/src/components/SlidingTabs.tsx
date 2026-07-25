import React, { useRef, useEffect } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	Animated,
	StyleSheet,
	LayoutChangeEvent,
} from "react-native";
import { colors, spacing, typography } from "../theme";

interface Tab {
	key: string;
	label: string;
}

interface Props {
	tabs: Tab[];
	activeKey: string;
	onTabPress: (key: string) => void;
}

export default function SlidingTabs({ tabs, activeKey, onTabPress }: Props) {
	const activeIndex = tabs.findIndex((t) => t.key === activeKey);
	const slideAnim = useRef(new Animated.Value(0)).current;
	const tabWidths = useRef<number[]>([]);
	const tabOffsets = useRef<number[]>([]);
	const [, setReady] = React.useState(false);

	useEffect(() => {
		if (tabOffsets.current.length === tabs.length) {
			Animated.spring(slideAnim, {
				toValue: tabOffsets.current[activeIndex] || 0,
				useNativeDriver: true,
				tension: 180,
				friction: 20,
			}).start();
		}
	}, [activeIndex, slideAnim, tabs.length]);

	const handleLayout = (index: number) => (e: LayoutChangeEvent) => {
		const { x, width } = e.nativeEvent.layout;
		tabWidths.current[index] = width;
		tabOffsets.current[index] = x;
		if (tabWidths.current.filter(Boolean).length === tabs.length) {
			slideAnim.setValue(tabOffsets.current[activeIndex] || 0);
			setReady(true);
		}
	};

	const pillWidth = tabWidths.current[activeIndex] || 0;

	return (
		<View style={styles.container}>
			<Animated.View
				style={[
					styles.pill,
					{
						width: pillWidth || `${100 / tabs.length}%`,
						transform: [{ translateX: slideAnim }],
					},
				]}
			/>
			{tabs.map((tab, index) => (
				<TouchableOpacity
					key={tab.key}
					style={styles.tab}
					onPress={() => onTabPress(tab.key)}
					onLayout={handleLayout(index)}
					activeOpacity={0.7}
				>
					<Text style={[styles.tabText, tab.key === activeKey && styles.tabTextActive]}>
						{tab.label}
					</Text>
				</TouchableOpacity>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		backgroundColor: colors.surface,
		borderBottomLeftRadius: 8,
		borderBottomRightRadius: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: colors.border,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		position: "relative",
	},
	pill: {
		position: "absolute",
		top: spacing.xs,
		bottom: spacing.xs,
		borderRadius: 6,
		backgroundColor: colors.primary,
	},
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: spacing.sm,
		borderRadius: 8,
	},
	tabText: {
		...typography.caption,
		fontWeight: "600",
		color: colors.textMuted,
	},
	tabTextActive: {
		color: colors.text,
	},
});
