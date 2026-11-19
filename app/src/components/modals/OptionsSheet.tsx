import React, { useEffect, useRef } from "react";
import {
	View,
	Text,
	Pressable,
	Modal,
	Animated,
	PanResponder,
	StyleSheet,
	Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, themedStyles } from "../../theme";

export interface SheetOption {
	key: string;
	label: string;
	icon: React.ComponentProps<typeof Ionicons>["name"];
	destructive?: boolean;
	onPress: () => void;
}

interface Props {
	visible: boolean;
	title: string;
	subtitle?: string;
	options: SheetOption[];
	onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

const SHEET_SPRING = {
	toValue: 0,
	damping: 30,
	stiffness: 220,
	overshootClamping: true,
	useNativeDriver: true,
} as const;

/**
 * A bottom sheet of actions (a long-press menu). Same look as WatchActionSheet; the dismiss target
 * is behind the sheet and the drag-to-close pan is on the header only, so taps on the rows never
 * compete with a gesture.
 */
export default function OptionsSheet({ visible, title, subtitle, options, onClose }: Readonly<Props>) {
	const insets = useSafeAreaInsets();
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

	useEffect(() => {
		if (visible) Animated.spring(translateY, SHEET_SPRING).start();
		else translateY.setValue(SCREEN_HEIGHT);
	}, [visible, translateY]);

	const slideOut = (after?: () => void) => {
		Animated.timing(translateY, {
			toValue: SCREEN_HEIGHT,
			duration: 200,
			useNativeDriver: true,
		}).start(() => {
			onClose();
			after?.();
		});
	};

	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onPanResponderMove: (_, gs) => {
				if (gs.dy > 0) translateY.setValue(gs.dy);
			},
			onPanResponderRelease: (_, gs) => {
				if (gs.dy > 80 || gs.vy > 0.5) slideOut();
				else Animated.spring(translateY, SHEET_SPRING).start();
			},
			onPanResponderTerminate: () => Animated.spring(translateY, SHEET_SPRING).start(),
		}),
	).current;

	return (
		<Modal visible={visible} transparent animationType="none" onRequestClose={() => slideOut()}>
			<View style={styles.overlay}>
				<Pressable style={StyleSheet.absoluteFill} onPress={() => slideOut()} />
				<Animated.View
					style={[
						styles.sheet,
						{ paddingBottom: Math.max(34, insets.bottom + 16), transform: [{ translateY }] },
					]}
				>
					<View {...panResponder.panHandlers}>
						<View style={styles.handle} />
						<Text style={styles.title} numberOfLines={1}>
							{title}
						</Text>
						{subtitle ? (
							<Text style={styles.subtitle} numberOfLines={1}>
								{subtitle}
							</Text>
						) : (
							<View style={{ height: spacing.md }} />
						)}
					</View>
					{options.map((o) => (
						<Pressable
							key={o.key}
							style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
							// Closes first, then runs: an option that opens another modal needs this one gone
							onPress={() => slideOut(o.onPress)}
						>
							<Ionicons
								name={o.icon}
								size={22}
								color={o.destructive ? colors.destructiveRed : colors.text}
								style={styles.icon}
							/>
							<Text style={[styles.optionText, o.destructive && { color: colors.destructiveRed }]}>
								{o.label}
							</Text>
						</Pressable>
					))}
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: colors.overlayLight,
		justifyContent: "flex-end",
	},
	sheet: {
		backgroundColor: colors.surface,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		paddingHorizontal: spacing.lg,
	},
	handle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.textMuted,
		alignSelf: "center",
		marginTop: spacing.sm,
		marginBottom: spacing.md,
	},
	title: { ...typography.subtitle, fontSize: 16, textAlign: "center" },
	subtitle: {
		...typography.caption,
		textAlign: "center",
		marginTop: spacing.xs,
		marginBottom: spacing.lg,
	},
	option: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	icon: { width: 36 },
	optionText: { ...typography.subtitle, fontSize: 15 },
}));
