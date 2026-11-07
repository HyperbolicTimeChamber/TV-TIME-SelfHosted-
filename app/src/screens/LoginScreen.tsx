import React, { useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	Pressable,
	StyleSheet,
	TextInput,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Alert,
} from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography } from "../theme";
import { getAuth, sendPasswordResetEmail } from "@react-native-firebase/auth";
import { useAuthStore } from "../stores";
import GoogleLogo from "../../assets/GoogleLogo";
import { getFirebaseAuthErrorMessage } from "../hooks";
import { LoadingSpinner } from "../components";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP_VERSION_LABEL } from "../utils/appVersion";

export default function LoginScreen() {
	const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuthStore();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSignUp, setIsSignUp] = useState(false);
	const [loading, setLoading] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [resetting, setResetting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleEmailAuth = async () => {
		if (!email.trim() || !password.trim()) {
			setError("Please enter email and password.");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			if (isSignUp) {
				await signUpWithEmail(email.trim(), password);
			} else {
				await signInWithEmail(email.trim(), password);
			}
		} catch (e: unknown) {
			const code = (e as { code?: string }).code ?? "";
			setError(getFirebaseAuthErrorMessage(code));
			// Success keeps the loader up — the auth listener swaps this screen out
			setLoading(false);
		}
	};

	const handleGoogleSignIn = async () => {
		setGoogleLoading(true);
		setError(null);
		try {
			await signInWithGoogle();
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Google sign in failed");
			setGoogleLoading(false);
		}
	};

	const handleForgotPassword = async () => {
		if (!email.trim()) {
			setError("Enter your email address first.");
			return;
		}
		setResetting(true);
		setError(null);
		try {
			await sendPasswordResetEmail(getAuth(), email.trim());
			Alert.alert("Reset Email Sent", "Check your inbox for a password reset link.");
		} catch (e: unknown) {
			const code = (e as { code?: string }).code ?? "";
			setError(getFirebaseAuthErrorMessage(code));
		} finally {
			setResetting(false);
		}
	};

	// Signing in / up: the form gives way to a loader until the app swaps this screen out
	const signingIn = loading || googleLoading;
	const busy = signingIn || resetting;
	const { bottom } = useSafeAreaInsets();
	// The field being typed in gets the app's focus ring (as the list-name field)
	const [focused, setFocused] = useState<"email" | "password" | null>(null);

	return (
		<KeyboardAvoidingView
			style={styles.container}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
				<Image
					source={require("../../assets/icon-foreground.original.png")}
					style={styles.logo}
					contentFit="contain"
				/>
				<Text style={styles.subtitle}>Track What You Watch</Text>

				{signingIn ? (
					<View style={styles.signingIn}>
						<LoadingSpinner />
						<Text style={styles.signingInText}>
							{isSignUp && loading ? "Creating your account…" : "Signing you in…"}
						</Text>
					</View>
				) : (
					<>
						<View style={styles.form}>
							<TextInput
								style={[styles.input, focused === "email" && styles.inputFocused]}
								onFocus={() => setFocused("email")}
								onBlur={() => setFocused(null)}
								placeholder="Email"
								placeholderTextColor={colors.textMuted}
								keyboardType="email-address"
								autoCapitalize="none"
								autoCorrect={false}
								value={email}
								onChangeText={setEmail}
								editable={!busy}
							/>
							<TextInput
								style={[styles.input, focused === "password" && styles.inputFocused]}
								onFocus={() => setFocused("password")}
								onBlur={() => setFocused(null)}
								placeholder="Password"
								placeholderTextColor={colors.textMuted}
								secureTextEntry
								value={password}
								onChangeText={setPassword}
								editable={!busy}
								onSubmitEditing={handleEmailAuth}
							/>

							<Pressable
								style={({ pressed }) => [
									styles.emailButton,
									pressed && styles.pressed,
									busy && styles.buttonDisabled,
								]}
								onPress={handleEmailAuth}
								disabled={busy}
								accessibilityRole="button"
							>
								<Text style={styles.emailButtonText}>{isSignUp ? "Sign Up" : "Sign In"}</Text>
							</Pressable>

							<TouchableOpacity
								onPress={() => {
									setIsSignUp(!isSignUp);
									setError(null);
								}}
								disabled={busy}
							>
								<Text style={styles.toggleText}>
									{isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
								</Text>
							</TouchableOpacity>

							{!isSignUp && (
								<TouchableOpacity onPress={handleForgotPassword} disabled={busy}>
									<Text style={styles.forgotText}>Forgot Password?</Text>
								</TouchableOpacity>
							)}
						</View>

						<View style={styles.dividerRow}>
							<View style={styles.dividerLine} />
							<Text style={styles.dividerText}>OR</Text>
							<View style={styles.dividerLine} />
						</View>

						<Pressable
							style={({ pressed }) => [
								styles.googleButton,
								pressed && styles.pressed,
								busy && styles.buttonDisabled,
							]}
							onPress={handleGoogleSignIn}
							disabled={busy}
							accessibilityRole="button"
						>
							<View style={styles.googleButtonInner}>
								<GoogleLogo size={20} />
								<Text style={styles.googleButtonText}>Sign in with Google</Text>
							</View>
						</Pressable>

						{error && <Text style={styles.error}>{error}</Text>}
					</>
				)}
			</ScrollView>
			{/* The very bottom, dim: which build this is (as on Settings) */}
			<Text style={[styles.version, { paddingBottom: bottom + spacing.md }]}>{APP_VERSION_LABEL}</Text>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	version: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	scrollContent: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: spacing.xl,
	},
	logo: {
		width: 120,
		height: 120,
		marginBottom: spacing.sm,
	},
	subtitle: {
		...typography.caption,
		fontSize: 16,
		marginBottom: spacing.xxl * 2,
	},
	form: {
		width: "100%",
		maxWidth: 320,
		alignItems: "center",
	},
	// The app's fields and buttons: 52 tall, 14 corners, borderless surfaces
	input: {
		width: "100%",
		height: 52,
		backgroundColor: colors.surface,
		borderWidth: 1.5,
		borderColor: "transparent",
		borderRadius: 14,
		paddingHorizontal: spacing.lg,
		color: colors.text,
		fontSize: 16,
		marginBottom: spacing.md,
	},
	inputFocused: { borderColor: colors.textSecondary },
	emailButton: {
		width: "100%",
		height: 52,
		backgroundColor: colors.primary,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		marginTop: spacing.xs,
	},
	// Buttons answer the press: a touch smaller
	pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
	emailButtonText: {
		...typography.subtitle,
		color: colors.text,
	},
	buttonDisabled: {
		opacity: 0.6,
	},
	toggleText: {
		...typography.body,
		color: colors.accent,
		marginTop: spacing.lg,
	},
	forgotText: {
		...typography.body,
		color: colors.textMuted,
		marginTop: spacing.md,
		fontSize: 14,
	},
	dividerRow: {
		flexDirection: "row",
		alignItems: "center",
		width: "100%",
		maxWidth: 320,
		marginVertical: spacing.xl,
	},
	dividerLine: {
		flex: 1,
		height: 1,
		backgroundColor: colors.border,
	},
	dividerText: {
		...typography.caption,
		marginHorizontal: spacing.lg,
	},
	googleButton: {
		width: "100%",
		maxWidth: 320,
		height: 52,
		backgroundColor: colors.surface,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	googleButtonInner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	googleButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
	},
	signingIn: {
		alignItems: "center",
		gap: spacing.lg,
	},
	signingInText: {
		...typography.body,
		color: colors.textSecondary,
	},
	error: {
		...typography.body,
		color: colors.destructiveRed,
		marginTop: spacing.lg,
		textAlign: "center",
	},
});
