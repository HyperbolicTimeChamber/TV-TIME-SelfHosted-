import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
import Animated, {
	Easing,
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chooseProfilePhoto, PhotoPickResult, removeProfilePhoto } from "../../services/profilePhoto";
import { colors, spacing, typography, themedStyles } from "../../theme";

const OPEN_MS = 280;
const CLOSE_MS = 220;
/** iOS drawer curve, as the app's sheets */
const EASE = Easing.bezier(0.32, 0.72, 0, 1);
const HEADER_H = 56;
const PHOTO_FADE_MS = 150;
/** The viewer is black whatever the theme, as chat apps show a picture */
const BLACK = "#000000";
const WHITE = "#FFFFFF";

export interface ThumbRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const PICK_ERRORS: Partial<Record<PhotoPickResult, string>> = {
	[PhotoPickResult.TOO_LARGE]: "That picture is too big. Choose one under 15 MB.",
	[PhotoPickResult.FAILED]: "Couldn't use that picture. Try another one.",
};

/**
 * The profile photo, full screen, grown out of the avatar: change it from the library, or remove the
 * one chosen on this device
 */
export default function ProfilePhotoViewer({
	uid,
	name,
	uri,
	canRemove,
	origin,
	onClose,
}: Readonly<{
	uid: string;
	name: string;
	/** The picture shown; null = none yet */
	uri: string | null;
	/** A photo chosen on this device is set */
	canRemove: boolean;
	/** The avatar's place on screen */
	origin: ThumbRect;
	onClose: () => void;
}>) {
	const { width, height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const [busy, setBusy] = useState(false);

	const size = Math.min(width, height - insets.top - insets.bottom - HEADER_H * 3);
	const left = (width - size) / 2;
	const top = (height - size) / 2;
	const startScale = origin.width / size;
	const startX = origin.x + origin.width / 2 - (left + size / 2);
	const startY = origin.y + origin.height / 2 - (top + size / 2);

	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withTiming(1, { duration: OPEN_MS, easing: EASE });
	}, [progress]);
	const close = () => {
		progress.value = withTiming(0, { duration: CLOSE_MS, easing: EASE }, (finished) => {
			if (finished) runOnJS(onClose)();
		});
	};

	const fade = useAnimatedStyle(() => ({ opacity: progress.value }));
	const photo = useAnimatedStyle(() => ({
		// A circle on the avatar, a square once open
		borderRadius: interpolate(progress.value, [0, 1], [size / 2, 0]),
		transform: [
			{ translateX: interpolate(progress.value, [0, 1], [startX, 0]) },
			{ translateY: interpolate(progress.value, [0, 1], [startY, 0]) },
			{ scale: interpolate(progress.value, [0, 1], [startScale, 1]) },
		],
	}));

	const choose = async () => {
		if (busy) return;
		setBusy(true);
		const result = await chooseProfilePhoto(uid);
		setBusy(false);
		const error = PICK_ERRORS[result];
		if (error) Alert.alert("Profile photo", error);
	};

	return (
		<Modal
			visible
			transparent
			animationType="none"
			statusBarTranslucent
			navigationBarTranslucent
			onRequestClose={close}
		>
			<Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, fade]}>
				<Pressable
					style={StyleSheet.absoluteFill}
					onPress={close}
					accessibilityRole="button"
					accessibilityLabel="Close"
				/>
			</Animated.View>
			<Animated.View style={[styles.header, { paddingTop: insets.top }, fade]}>
				<Pressable
					style={styles.headerButton}
					onPress={close}
					accessibilityRole="button"
					accessibilityLabel="Back"
				>
					<Ionicons name="arrow-back" size={24} color={WHITE} />
				</Pressable>
				<Text style={styles.headerName} numberOfLines={1}>
					{name}
				</Text>
				<Pressable
					style={styles.headerButton}
					onPress={choose}
					disabled={busy}
					accessibilityRole="button"
					accessibilityLabel="Change photo"
				>
					{busy ? (
						<ActivityIndicator size="small" color={WHITE} />
					) : (
						<Ionicons name="pencil" size={22} color={WHITE} />
					)}
				</Pressable>
			</Animated.View>
			<Animated.View
				pointerEvents="none"
				style={[styles.frame, { width: size, height: size, left, top }, photo]}
			>
				{uri ? (
					<Image
						source={{ uri }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						transition={PHOTO_FADE_MS}
						accessibilityLabel={`${name}'s profile photo`}
					/>
				) : (
					<Ionicons name="person" size={size / 2} color={colors.textMuted} />
				)}
			</Animated.View>
			<Animated.View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }, fade]}>
				<Pressable
					style={styles.primary}
					onPress={choose}
					disabled={busy}
					accessibilityRole="button"
				>
					<Ionicons name="images-outline" size={18} color={colors.onPrimary} />
					<Text style={styles.primaryText}>{uri ? "Change Photo" : "Add Photo"}</Text>
				</Pressable>
				{canRemove && (
					<Pressable
						style={styles.secondary}
						onPress={() => removeProfilePhoto(uid)}
						disabled={busy}
						accessibilityRole="button"
					>
						<Text style={styles.secondaryText}>Remove Photo</Text>
					</Pressable>
				)}
				<Text style={styles.note}>Saved on this device only.</Text>
			</Animated.View>
		</Modal>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		backdrop: { backgroundColor: BLACK },
		header: {
			position: "absolute",
			top: 0,
			left: 0,
			right: 0,
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: spacing.xs,
		},
		headerButton: {
			width: HEADER_H,
			height: HEADER_H,
			alignItems: "center",
			justifyContent: "center",
		},
		headerName: { ...typography.title, fontSize: 18, flex: 1, color: WHITE },
		frame: {
			position: "absolute",
			overflow: "hidden",
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: colors.surface,
		},
		footer: {
			position: "absolute",
			left: 0,
			right: 0,
			bottom: 0,
			alignItems: "center",
			gap: spacing.sm,
		},
		primary: {
			flexDirection: "row",
			alignItems: "center",
			gap: spacing.sm,
			height: 44,
			paddingHorizontal: spacing.xl,
			borderRadius: 22,
			backgroundColor: colors.primary,
		},
		primaryText: { ...typography.subtitle, fontSize: 15, color: colors.onPrimary },
		secondary: { height: 40, justifyContent: "center", paddingHorizontal: spacing.lg },
		secondaryText: { ...typography.subtitle, fontSize: 15, color: WHITE },
		note: { ...typography.caption, color: "rgba(255, 255, 255, 0.6)" },
	}),
);
