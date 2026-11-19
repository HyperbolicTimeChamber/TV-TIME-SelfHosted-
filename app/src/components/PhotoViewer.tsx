import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	Linking,
	Modal,
	Pressable as RNPressable,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
	type StyleProp,
	type ViewStyle,
} from "react-native";
// Gesture-handler Pressable: React Native's loses taps inside the cast sheet's gestures
import { Pressable } from "react-native-gesture-handler";
import Reanimated, {
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
import { useSubjectLink } from "../hooks/useSubjectLink";
import { tmdbLogoUri, tmdbPosterUri } from "../hooks/useTmdbImage";
import { PhotoSubjectKind } from "../enums";
import type { PhotoSubject } from "../types";
import { colors, spacing, typography, themedStyles } from "../theme";

const OPEN_MS = 280;
const CLOSE_MS = 220;
/** iOS drawer curve, as the app's sheets */
const EASE = Easing.bezier(0.32, 0.72, 0, 1);
/** A person's photo is a circle, like a profile picture; a studio's logo sits on a chip the row's shape */
const PERSON_ASPECT = 1;
const STUDIO_ASPECT = 2;
const WIDTH_SHARE = { [PhotoSubjectKind.PERSON]: 0.82, [PhotoSubjectKind.STUDIO]: 0.72 };
const STUDIO_RADIUS = 20;
const PILL_H = 48;
const PILL_GAP = spacing.lg;
const PHOTO_FADE_MS = 150;

type Rect = { x: number; y: number; width: number; height: number };

const photoUri = (subject: PhotoSubject, width: number) =>
	subject.kind === PhotoSubjectKind.STUDIO
		? tmdbLogoUri(subject.path, width)
		: tmdbPosterUri(subject.path, width);

/** The expanded photo + its name / link pill, grown out of the thumbnail that opened it */
function PhotoViewer({
	subject,
	origin,
	originRadius,
	thumbWidth,
	onClose,
}: Readonly<{
	subject: PhotoSubject;
	origin: Rect;
	originRadius: number;
	thumbWidth: number;
	onClose: () => void;
}>) {
	const { width, height } = useWindowDimensions();
	const insets = useSafeAreaInsets();
	const { url, label, resolving } = useSubjectLink(subject);
	const studio = subject.kind === PhotoSubjectKind.STUDIO;

	const frame = useMemo(() => {
		const aspect = studio ? STUDIO_ASPECT : PERSON_ASPECT;
		const room = height - insets.top - insets.bottom - PILL_H - PILL_GAP - spacing.xxl * 2;
		const w = Math.min(width * WIDTH_SHARE[subject.kind], room * aspect);
		const h = w / aspect;
		return { width: w, height: h, left: (width - w) / 2, top: (height - h - PILL_GAP - PILL_H) / 2 };
	}, [width, height, insets.top, insets.bottom, studio, subject.kind]);
	const frameRadius = studio ? STUDIO_RADIUS : frame.width / 2;
	const startScale = Math.max(origin.width / frame.width, origin.height / frame.height);
	const startX = origin.x + origin.width / 2 - (frame.left + frame.width / 2);
	const startY = origin.y + origin.height / 2 - (frame.top + frame.height / 2);

	const progress = useSharedValue(0);
	useEffect(() => {
		progress.value = withTiming(1, { duration: OPEN_MS, easing: EASE });
	}, [progress]);
	const close = () => {
		progress.value = withTiming(0, { duration: CLOSE_MS, easing: EASE }, (finished) => {
			if (finished) runOnJS(onClose)();
		});
	};

	const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
	const photo = useAnimatedStyle(() => ({
		// Fades in over the first stretch: a portrait cast card isn't the circle it grows into
		opacity: interpolate(progress.value, [0, 0.2], [0, 1]),
		borderRadius: interpolate(progress.value, [0, 1], [originRadius / startScale, frameRadius]),
		transform: [
			{ translateX: interpolate(progress.value, [0, 1], [startX, 0]) },
			{ translateY: interpolate(progress.value, [0, 1], [startY, 0]) },
			{ scale: interpolate(progress.value, [0, 1], [startScale, 1]) },
		],
	}));
	const pill = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [0.5, 1], [0, 1]),
		transform: [{ translateY: interpolate(progress.value, [0.5, 1], [spacing.md, 0]) }],
	}));

	return (
		<Modal
			visible
			transparent
			animationType="none"
			statusBarTranslucent
			navigationBarTranslucent
			onRequestClose={close}
		>
			<Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
				<RNPressable
					style={StyleSheet.absoluteFill}
					onPress={close}
					accessibilityRole="button"
					accessibilityLabel="Close"
				/>
			</Reanimated.View>
			<Reanimated.View
				pointerEvents="none"
				style={[styles.frame, studio && styles.studioFrame, frame, photo]}
			>
				<Image
					source={{ uri: photoUri(subject, frame.width) }}
					placeholder={{ uri: photoUri(subject, thumbWidth) }}
					placeholderContentFit={studio ? "contain" : "cover"}
					style={studio ? styles.logo : StyleSheet.absoluteFill}
					contentFit={studio ? "contain" : "cover"}
					transition={PHOTO_FADE_MS}
					accessibilityIgnoresInvertColors
				/>
			</Reanimated.View>
			<Reanimated.View
				style={[styles.pillRow, { top: frame.top + frame.height + PILL_GAP }, pill]}
				pointerEvents="box-none"
			>
				<RNPressable
					style={({ pressed }) => [styles.pill, (pressed || resolving) && styles.pillDim]}
					disabled={resolving}
					onPress={() => {
						Linking.openURL(url).catch(() => {});
					}}
					accessibilityRole="link"
					accessibilityLabel={`${subject.name}, ${label}`}
				>
					<Text style={styles.pillName} numberOfLines={1}>
						{subject.name}
					</Text>
					<View style={styles.pillDivider} />
					<Text style={styles.pillLink}>{label}</Text>
					<Ionicons name="open-outline" size={14} color={colors.primary} />
				</RNPressable>
			</Reanimated.View>
		</Modal>
	);
}

/**
 * A thumbnail (cast / crew photo, studio logo) that expands into the photo viewer on tap, like a
 * profile picture in a chat app. Without a subject (no photo) it's just its children
 */
export default function PhotoTrigger({
	subject,
	radius,
	thumbWidth,
	style,
	children,
}: Readonly<{
	subject: PhotoSubject | null;
	/** The thumbnail's corner radius: the photo grows out of that shape */
	radius: number;
	/** The width the thumbnail asks TMDB for: already cached, shown until the big one lands */
	thumbWidth: number;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}>) {
	const ref = useRef<View>(null);
	const [origin, setOrigin] = useState<Rect | null>(null);
	if (!subject) return <View style={style}>{children}</View>;
	return (
		<View ref={ref} collapsable={false} style={style}>
			<Pressable
				style={styles.fill}
				onPress={() =>
					ref.current?.measureInWindow((x, y, width, height) =>
						setOrigin({ x, y, width, height }),
					)
				}
				accessibilityRole="imagebutton"
				accessibilityLabel={`View ${subject.name}`}
			>
				{children}
			</Pressable>
			{origin && (
				<PhotoViewer
					subject={subject}
					origin={origin}
					originRadius={radius}
					thumbWidth={thumbWidth}
					onClose={() => setOrigin(null)}
				/>
			)}
		</View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	fill: { width: "100%", height: "100%" },
	backdrop: { backgroundColor: colors.overlay },
	frame: { position: "absolute", overflow: "hidden", backgroundColor: colors.surface },
	studioFrame: {
		backgroundColor: "rgba(255, 255, 255, 0.95)",
		padding: spacing.xl,
		alignItems: "center",
		justifyContent: "center",
	},
	logo: { width: "100%", height: "100%" },
	pillRow: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		alignItems: "center",
	},
	pill: {
		height: PILL_H,
		maxWidth: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
		borderRadius: PILL_H / 2,
		backgroundColor: colors.surfaceLight,
	},
	pillDim: { opacity: 0.7 },
	pillName: { ...typography.body, fontWeight: "600", color: colors.text, flexShrink: 1 },
	pillDivider: { width: 1, height: 16, backgroundColor: colors.border },
	pillLink: { ...typography.caption, fontWeight: "600", color: colors.primary },
}));
