import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { LoadErrorKind, MediaType } from "../enums";
import type { LoadErrorInfo } from "../utils";

interface Action {
	label: string;
	onPress: () => void;
}

interface Props {
	info: LoadErrorInfo;
	mediaType: MediaType;
	primary: Action;
	secondary?: Action;
}

/** Full-screen load failure: icon, title, explanation and next steps */
export default function ErrorState({ info, mediaType, primary, secondary }: Props) {
	const fade = useRef(new Animated.Value(0)).current;
	const rise = useRef(new Animated.Value(16)).current;

	useEffect(() => {
		Animated.parallel([
			Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
			Animated.spring(rise, { toValue: 0, damping: 14, stiffness: 140, useNativeDriver: true }),
		]).start();
	}, [fade, rise]);

	const icon =
		info.kind === LoadErrorKind.OFFLINE
			? "cloud-offline-outline"
			: info.kind === LoadErrorKind.SERVER
				? "alert-circle-outline"
				: mediaType === MediaType.MOVIE
					? "film-outline"
					: "tv-outline";

	return (
		<Animated.View style={[styles.container, { opacity: fade, transform: [{ translateY: rise }] }]}>
			<View style={styles.iconRing}>
				<Ionicons name={icon} size={44} color={colors.textSecondary} />
				{info.kind === LoadErrorKind.NOT_FOUND && (
					<View style={styles.badge}>
						<Text style={styles.badgeText}>?</Text>
					</View>
				)}
			</View>
			<Text style={styles.title}>{info.title}</Text>
			<Text style={styles.message}>{info.message}</Text>
			<TouchableOpacity style={styles.primaryButton} onPress={primary.onPress} activeOpacity={0.8}>
				<Text style={styles.primaryText}>{primary.label}</Text>
			</TouchableOpacity>
			{secondary && (
				<TouchableOpacity style={styles.secondaryButton} onPress={secondary.onPress} activeOpacity={0.7}>
					<Text style={styles.secondaryText}>{secondary.label}</Text>
				</TouchableOpacity>
			)}
			{info.code && <Text style={styles.code}>Error {info.code}</Text>}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xxl,
		backgroundColor: colors.background,
	},
	iconRing: {
		width: 112,
		height: 112,
		borderRadius: 56,
		backgroundColor: colors.surface,
		borderWidth: 1,
		borderColor: colors.border,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: spacing.xl,
	},
	badge: {
		position: "absolute",
		top: 10,
		right: 10,
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: colors.primary,
		borderWidth: 3,
		borderColor: colors.background,
		justifyContent: "center",
		alignItems: "center",
	},
	badgeText: {
		color: colors.text,
		fontWeight: "800",
		fontSize: 13,
	},
	title: {
		...typography.title,
		fontSize: 20,
		textAlign: "center",
	},
	message: {
		...typography.body,
		color: colors.textSecondary,
		textAlign: "center",
		lineHeight: 21,
		marginTop: spacing.sm,
		marginBottom: spacing.xl,
	},
	primaryButton: {
		alignSelf: "stretch",
		backgroundColor: colors.primary,
		paddingVertical: spacing.md + 2,
		borderRadius: 12,
		alignItems: "center",
	},
	primaryText: {
		...typography.subtitle,
		fontSize: 15,
	},
	secondaryButton: {
		alignSelf: "stretch",
		paddingVertical: spacing.md + 2,
		borderRadius: 12,
		alignItems: "center",
		marginTop: spacing.sm,
		backgroundColor: colors.surface,
	},
	secondaryText: {
		...typography.subtitle,
		fontSize: 15,
		color: colors.text,
	},
	code: {
		...typography.caption,
		color: colors.textMuted,
		marginTop: spacing.xl,
	},
});
