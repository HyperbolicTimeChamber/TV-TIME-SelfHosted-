import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, themedStyles } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import type { ProfileStackParamList } from "../../types";

/** A settings sub-page: back button, centred title, swipe right to leave */
export default function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
	const { top, bottom } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView
				style={{ paddingTop: top }}
				contentContainerStyle={{ paddingBottom: top + bottom + spacing.lg }}
				keyboardShouldPersistTaps="handled"
			>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>{title}</Text>
					<View style={styles.headerSpacer} />
				</View>
				{children}
			</ScrollView>
		</SwipeBackView>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		container: { flex: 1, backgroundColor: colors.background },
		headerRow: {
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: spacing.sm,
			paddingVertical: spacing.sm,
		},
		headerSpacer: { width: CIRCLE_BUTTON_SIZE },
		headerTitle: { ...typography.title, flex: 1, textAlign: "center", fontSize: 18 },
	}),
);
