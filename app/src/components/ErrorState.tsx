import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { LoadErrorKind, MediaType } from "../enums";
import type { LoadErrorInfo } from "../utils";

const NOT_FOUND_ART = require("../../assets/not-found.png");
const ART_RATIO = 600 / 587;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
// Cap by width and by ~42% of the screen height so the text always has room
const ART_HEIGHT = Math.min(SCREEN_W / ART_RATIO, SCREEN_H * 0.42, 420);
const ART_WIDTH = ART_HEIGHT * ART_RATIO;

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
	const climb = useRef(new Animated.Value(ART_HEIGHT)).current;
	const showArt = info.kind === LoadErrorKind.NOT_FOUND;

	useEffect(() => {
		Animated.parallel([
			Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
			Animated.spring(rise, { toValue: 0, damping: 14, stiffness: 140, useNativeDriver: true }),
			// Character pops up from below the screen edge
			Animated.spring(climb, {
				toValue: 0,
				damping: 11,
				stiffness: 90,
				delay: 120,
				useNativeDriver: true,
			}),
		]).start();
	}, [fade, rise, climb]);

	const icon =
		info.kind === LoadErrorKind.OFFLINE
			? "cloud-offline-outline"
			: info.kind === LoadErrorKind.SERVER
				? "alert-circle-outline"
				: mediaType === MediaType.MOVIE
					? "film-outline"
					: "tv-outline";

	return (
		<View style={styles.root}>
			{showArt && (
				<Animated.Image
					source={NOT_FOUND_ART}
					style={[styles.art, { transform: [{ translateY: climb }] }]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			)}
			<Animated.View
				style={[
					styles.container,
					showArt && styles.containerWithArt,
					{ opacity: fade, transform: [{ translateY: rise }] },
				]}
			>
				{!showArt && (
					<View style={styles.iconRing}>
						<Ionicons name={icon} size={44} color={colors.textSecondary} />
					</View>
				)}
				<Text style={styles.title}>{info.title}</Text>
				<Text style={styles.message}>{info.message}</Text>
				<TouchableOpacity
					style={styles.primaryButton}
					onPress={primary.onPress}
					activeOpacity={0.8}
				>
					<Text style={styles.primaryText}>{primary.label}</Text>
				</TouchableOpacity>
				{secondary && (
					<TouchableOpacity
						style={styles.secondaryButton}
						onPress={secondary.onPress}
						activeOpacity={0.7}
					>
						<Text style={styles.secondaryText}>{secondary.label}</Text>
					</TouchableOpacity>
				)}
				{info.code && <Text style={styles.code}>Error {info.code}</Text>}
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: colors.background,
	},
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xxl,
	},
	// Text + buttons live above the character
	containerWithArt: {
		justifyContent: "flex-start",
		paddingTop: SCREEN_H * 0.14,
		paddingBottom: ART_HEIGHT,
	},
	// Flush with the bottom edge: the cropped legs read as climbing out of the screen
	art: {
		position: "absolute",
		bottom: 0,
		alignSelf: "center",
		width: ART_WIDTH,
		height: ART_HEIGHT,
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
