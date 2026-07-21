import { StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../theme";

export const importStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.title,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  warning: {
    ...typography.caption,
    color: colors.destructiveRed,
    textAlign: "center",
    marginBottom: spacing.lg,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  subhead: {
    ...typography.subtitle,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
  skipButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  skipText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: spacing.lg,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  // Candidate cards
  candidateRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  candidateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 4,
  },
  noPoster: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  noPosterText: {
    ...typography.title,
    color: colors.textMuted,
  },
  candidateInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: "center",
  },
  candidateName: {
    ...typography.subtitle,
    flex: 1,
  },
  candidateYear: {
    ...typography.caption,
    marginTop: 2,
  },
  candidateOverview: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  expandHint: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.xs,
    fontSize: 10,
  },
  typeBadge: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeMovie: {
    backgroundColor: colors.moviePurple,
  },
  typeBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700",
  },
  // Review
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRowDuplicate: {
    opacity: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  posterSmall: {
    width: 40,
    height: 60,
    borderRadius: 4,
  },
  reviewInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  reviewName: {
    ...typography.body,
    fontWeight: "600",
  },
  reviewSub: {
    ...typography.caption,
    marginTop: 2,
  },
  duplicateBadge: {
    ...typography.caption,
    color: colors.warningAmber,
    fontWeight: "600",
    marginTop: 2,
  },
  unmatchedText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  // Done
  statsBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.xl,
    width: "100%",
    marginBottom: spacing.xl,
  },
  reviewFooter: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  backButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  statLine: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  // Disambiguation
  expectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginBottom: spacing.md,
  },
  expectedLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  expectedHint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  disambigHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  infoButton: {
    color: colors.primary,
    backgroundColor: colors.surface,
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: "center",
    lineHeight: 26,
    fontSize: 14,
    fontWeight: "700",
    overflow: "hidden",
  },
  disambigFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  // Modal
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    width: "100%",
  },
  modalTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  modalBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  modalButtonText: {
    ...typography.subtitle,
    color: colors.text,
  },
  disambigSkipBtn: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disambigSkipText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  disambigBackBtn: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  disambigBackText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "600",
  },
});
