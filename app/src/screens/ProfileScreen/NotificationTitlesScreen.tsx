import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from "react-native";
import ConfirmModal from "../../components/modals/ConfirmModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, themedStyles } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList } from "../../types";
import { MediaType } from "../../enums";
import { DEFAULT_NOTIFY_PREFS, localDate, titleSilenced, type NotifyPrefs } from "../../utils/notifyConfig";
import { dayLabel } from "../../utils/notifyEvents";
import { loadNotifyPrefs, saveNotifyPrefs } from "../../services/notifyPrefs";
import { listTrackedTitles } from "../../services/airingScheduler";
import { SwitchRow } from "./NotificationControls";

const DAY_MS = 24 * 60 * 60 * 1000;

interface TitleRow {
	docId: string;
	title: string;
	mediaType: MediaType;
}

/** Settings → Notifications → Choose titles: mute a show or movie (for a week, a month, for good) or alert only for a few */
export default function NotificationTitlesScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
	const [titles, setTitles] = useState<TitleRow[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		loadNotifyPrefs().then(setPrefs);
		listTrackedTitles()
			.then(setTitles)
			.catch(() => {})
			.finally(() => setLoaded(true));
	}, []);

	const edit = (change: (next: NotifyPrefs) => void) => {
		const next: NotifyPrefs = JSON.parse(JSON.stringify(prefs));
		change(next);
		setPrefs(next);
		saveNotifyPrefs(next).catch(() => {});
	};

	const now = Date.now();
	// The title being muted (its popup asks for how long; Cancel leaves it alone)
	const [muting, setMuting] = useState<{ docId: string; title: string } | null>(null);
	const muteFor = (days: number | null) => {
		if (!muting) return;
		const { docId } = muting;
		edit((p) => void (p.muted[docId] = days === null ? 0 : Date.now() + days * DAY_MS));
		setMuting(null);
	};
	const mute = (docId: string, title: string) => setMuting({ docId, title });
	const unmute = (docId: string) => edit((p) => void delete p.muted[docId]);
	const toggleSolo = (docId: string) =>
		edit((p) => void (p.solo = p.solo.includes(docId) ? p.solo.filter((d) => d !== docId) : [...p.solo, docId]));

	const status = (docId: string): string => {
		const until = prefs.muted[docId];
		if (until !== undefined && (until === 0 || until > now)) {
			return until === 0 ? "Muted" : `Muted until ${dayLabel(localDate(until))}`;
		}
		if (prefs.soloOnly) return prefs.solo.includes(docId) ? "Alerts on" : "Not chosen";
		return "Alerts on";
	};

	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<View style={{ paddingTop: top }}>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Choose titles</Text>
					<View style={styles.headerSpacer} />
				</View>
			</View>
			<FlatList
				data={titles}
				keyExtractor={(t) => t.docId}
				contentContainerStyle={styles.list}
				ListHeaderComponent={
					<View style={styles.card}>
						<SwitchRow
							first
							label="Only chosen titles"
							hint="Alerts only for the titles you star below"
							value={prefs.soloOnly}
							onChange={(v) => edit((p) => void (p.soloOnly = v))}
						/>
					</View>
				}
				ListEmptyComponent={
					loaded ? <Text style={styles.empty}>Track a show or a movie and it appears here.</Text> : null
				}
				renderItem={({ item }) => {
					const silenced = titleSilenced(prefs, item.docId, now);
					const mutedNow = prefs.muted[item.docId] !== undefined && (prefs.muted[item.docId] === 0 || prefs.muted[item.docId] > now);
					const chosen = prefs.solo.includes(item.docId);
					return (
						<View style={styles.row}>
							<View style={styles.textWrap}>
								<Text style={[styles.rowText, silenced && styles.dim]} numberOfLines={1}>
									{item.title}
								</Text>
								<Text style={styles.rowHint}>
									{item.mediaType === MediaType.MOVIE ? "Movie" : "Show"} · {status(item.docId)}
								</Text>
							</View>
							{prefs.soloOnly ? (
								<TouchableOpacity
									onPress={() => toggleSolo(item.docId)}
									hitSlop={8}
									accessibilityRole="button"
									accessibilityLabel={chosen ? `Remove ${item.title} from chosen titles` : `Choose ${item.title}`}
									style={styles.iconButton}
								>
									<Ionicons name={chosen ? "star" : "star-outline"} size={22} color={chosen ? colors.primary : colors.textMuted} />
								</TouchableOpacity>
							) : null}
							<TouchableOpacity
								onPress={() => (mutedNow ? unmute(item.docId) : mute(item.docId, item.title))}
								hitSlop={8}
								accessibilityRole="button"
								accessibilityLabel={mutedNow ? `Unmute ${item.title}` : `Mute ${item.title}`}
								style={styles.iconButton}
							>
								<Ionicons
									name={mutedNow ? "notifications-off" : "notifications-outline"}
									size={22}
									color={mutedNow ? colors.destructiveRed : colors.textMuted}
								/>
							</TouchableOpacity>
						</View>
					);
				}}
			/>
			<ConfirmModal
				visible={muting !== null}
				title={`Mute ${muting?.title ?? ""}?`}
				hint="No alerts for it until the mute ends."
				confirmLabel="For a week"
				confirmColor={colors.primary}
				onConfirm={() => muteFor(7)}
				secondaryLabel="For a month"
				onSecondary={() => muteFor(30)}
				tertiaryLabel="Until I unmute"
				onTertiary={() => muteFor(null)}
				onClose={() => setMuting(null)}
			/>
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
		list: { paddingBottom: spacing.xl },
		card: {
			marginVertical: spacing.md,
			marginHorizontal: spacing.lg,
			backgroundColor: colors.surface,
			borderRadius: 8,
			overflow: "hidden",
		},
		row: {
			flexDirection: "row",
			alignItems: "center",
			gap: spacing.md,
			marginHorizontal: spacing.lg,
			paddingVertical: spacing.md,
			borderBottomWidth: 1,
			borderBottomColor: colors.border,
		},
		textWrap: { flex: 1 },
		rowText: { ...typography.subtitle, fontSize: 15, color: colors.text },
		dim: { color: colors.textMuted },
		rowHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
		iconButton: { padding: spacing.xs },
		empty: { ...typography.caption, color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
	}),
);
